import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '../context/CalendarContext';
import { MAX_CALENDAR_IMPORT_BYTES } from '../context/CalendarContext';
import ConfirmDialog from './ConfirmDialog';
import InlineAlert from './InlineAlert';

/**
 * URLHandler - Processes URL query parameters for various actions
 *
 * Supported parameters:
 * - ?calendar=CALENDAR_ID - Open a specific calendar
 * - ?import=BASE64_URL - Import calendar from URL (legacy support)
 */
export const URLHandler = () => {
  const { t } = useTranslation();
  const {
    calendarId: activeCalendarId,
    isLoaded,
    loadServerCalendar,
    importData,
  } = useCalendar();

  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  const [pendingImport, setPendingImport] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const processURLParams = async () => {
      const params = new URLSearchParams(window.location.search);

      // Process calendar parameter
      if (params.has('calendar')) {
        const calendarId = params.get('calendar');
        if (calendarId && calendarId !== activeCalendarId) {
          await handleLoadCalendar(calendarId);
        }
        params.delete('calendar');
      }

      // Process legacy import parameter
      if (params.has('import')) {
        const importUrl = params.get('import');
        if (importUrl) {
          await handleLegacyImport(importUrl);
        }
        params.delete('import');
      }

      // Clean up URL
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    };

    processURLParams();
    // URL parameters should be consumed once after context initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const handleLoadCalendar = async (calendarId: string) => {
    setMessage(t('urlHandler.loadingCalendar'));
    setMessageType('info');

    try {
      await loadServerCalendar(calendarId);
      setMessage(t('urlHandler.calendarLoaded'));
      setMessageType('success');

      // Auto-hide success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(t('urlHandler.loadFailed', { error: errorMessage }));
      setMessageType('error');
    }
  };

  const handleLegacyImport = async (importUrl: string) => {
    setMessage(t('urlHandler.importingCalendar'));
    setMessageType('info');

    try {
      // Decode base64 URL
      const decodedUrl = atob(importUrl);

      // Validate URL
      let url: URL;
      try {
        url = new URL(decodedUrl);
      } catch {
        throw new Error(t('urlHandler.invalidUrl'));
      }

      // Only allow HTTP/HTTPS
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(t('urlHandler.invalidProtocol'));
      }

      // Fetch the calendar data
      const response = await fetch(decodedUrl);
      if (!response.ok) {
        throw new Error(t('urlHandler.fetchFailed', { error: response.statusText }));
      }

      const contentLength = response.headers.get('Content-Length');
      if (contentLength && Number(contentLength) > MAX_CALENDAR_IMPORT_BYTES) {
        throw new Error(t('urlHandler.importTooLarge'));
      }

      const jsonString = await response.text();
      if (new TextEncoder().encode(jsonString).length > MAX_CALENDAR_IMPORT_BYTES) {
        throw new Error(t('urlHandler.importTooLarge'));
      }

      const data = JSON.parse(jsonString) as { courses?: unknown };
      if (!Array.isArray(data.courses)) {
        throw new Error(t('urlHandler.invalidCalendarData'));
      }

      setPendingImport(jsonString);
      setMessage(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(t('urlHandler.importFailed', { error: errorMessage }));
      setMessageType('error');
    }
  };

  const handleConfirmImport = async () => {
    if (pendingImport) {
      const imported = await importData(pendingImport);
      setPendingImport(null);
      if (!imported) return;
      setMessage(t('urlHandler.importSucceeded'));
      setMessageType('success');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (pendingImport) {
    return (
      <ConfirmDialog
        title={t('dialogs.importFromUrl.title')}
        message={t('dialogs.importFromUrl.message')}
        confirmText={t('dialogs.importFromUrl.confirm')}
        cancelText={t('dialogs.importFromUrl.cancel')}
        onConfirm={handleConfirmImport}
        onCancel={() => setPendingImport(null)}
      />
    );
  }

  if (!message) return null;

  return <InlineAlert title={message} variant={messageType === 'error' ? 'danger' : messageType} onClose={() => setMessage(null)} />;
};
