import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '../context/CalendarContext';
import ConfirmDialog from './ConfirmDialog';
import './URLHandler.css';

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

  const [processing, setProcessing] = useState(false);
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
    setProcessing(true);
    setMessage('Loading calendar...');
    setMessageType('info');

    try {
      await loadServerCalendar(calendarId);
      setMessage('Calendar loaded successfully!');
      setMessageType('success');

      // Auto-hide success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Failed to load calendar: ${errorMessage}`);
      setMessageType('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleLegacyImport = async (importUrl: string) => {
    setProcessing(true);
    setMessage('Importing calendar...');
    setMessageType('info');

    try {
      // Decode base64 URL
      const decodedUrl = atob(importUrl);

      // Validate URL
      let url: URL;
      try {
        url = new URL(decodedUrl);
      } catch {
        throw new Error('Invalid URL format');
      }

      // Only allow HTTP/HTTPS
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only HTTP/HTTPS URLs are allowed');
      }

      // Fetch the calendar data
      const response = await fetch(decodedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const jsonString = await response.text();
      const data = JSON.parse(jsonString) as { courses?: unknown };
      if (!Array.isArray(data.courses)) {
        throw new Error('Invalid calendar data format');
      }

      setPendingImport(jsonString);
      setMessage(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(`Import failed: ${errorMessage}`);
      setMessageType('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (pendingImport) {
      await importData(pendingImport);
      setPendingImport(null);
      setMessage('Calendar imported successfully!');
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

  return (
    <div className={`url-handler-notification ${messageType}`}>
      <div className="url-handler-content">
        {processing && <div className="url-handler-spinner" />}
        <span className="url-handler-message">{message}</span>
        {!processing && (
          <button
            className="url-handler-close"
            onClick={() => setMessage(null)}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
