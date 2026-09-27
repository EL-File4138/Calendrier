import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import {
  Button,
  TextInput
} from '@patternfly/react-core';
import {
  PlusIcon,
  CogIcon,
  MoonIcon,
  SunIcon,
  FolderOpenIcon,
  FileAltIcon,
  FileExportIcon,
  FileImportIcon,
  ImageIcon,
  PrintIcon,
  ShareAltIcon,
  CloudUploadAltIcon,
  TrashIcon,
} from '@patternfly/react-icons';
import { useCalendar } from '../context/CalendarContext';
import { MAX_CALENDAR_IMPORT_BYTES } from '../context/CalendarContext';
import { mapICSToCalendarData, parseICS } from '../utils/icsParser';
import ConfirmDialog from './ConfirmDialog';
import InlineAlert from './InlineAlert';
import ShareDialog from './ShareDialog';
import { UserPanel } from './UserPanel';
import { ToolbarDropdown } from './ToolbarDropdown';
import './Toolbar.css';

interface ToolbarProps {
  onAddCourse: () => void;
  onOpenSettings: () => void;
}

type DialogType = 'new-calendar' | 'import-warning' | 'share' | 'delete-calendar' | null;

const CalendrierToolbar = ({ onAddCourse, onOpenSettings }: ToolbarProps) => {
  const { t } = useTranslation();
  const {
    title,
    exportData,
    importData,
    newCalendar,
    updateTitle,
    darkMode,
    toggleDarkMode,
    syncMode,
    userId,
    createServerCalendar,
    deleteCalendar,
    hasWriteAccess,
  } = useCalendar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImportRef = useRef<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const [dialog, setDialog] = useState<DialogType>(null);
  const [alertMessage, setAlertMessage] = useState<{ message: string; variant: 'danger' | 'success' } | null>(null);

  const showAlert = (message: string, variant: 'danger' | 'success' = 'danger') => {
    setAlertMessage({ message, variant });
  };

  const waitForPaint = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const runInLightMode = async <T,>(callback: () => T | Promise<T>): Promise<T> => {
    const root = document.documentElement;
    const shouldRestoreDarkMode = root.classList.contains('dark-mode');

    if (shouldRestoreDarkMode) {
      root.classList.remove('dark-mode');
      await waitForPaint();
    }

    try {
      return await callback();
    } finally {
      if (shouldRestoreDarkMode) {
        root.classList.add('dark-mode');
      }
    }
  };

  const handleExport = () => {
    const jsonString = exportData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calendar';
    a.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_CALENDAR_IMPORT_BYTES) {
        showAlert(t('errors.importTooLarge'));
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (new TextEncoder().encode(content).length > MAX_CALENDAR_IMPORT_BYTES) {
          showAlert(t('errors.importTooLarge'));
          return;
        }
        try {
          if (/\.(?:ics|ical)$/i.test(file.name)) {
            const parsed = parseICS(content);
            if (!parsed.events.length) throw new Error('No events');
            pendingImportRef.current = JSON.stringify(mapICSToCalendarData(parsed));
          } else {
            pendingImportRef.current = content;
          }
          setDialog('import-warning');
        } catch {
          showAlert(t(/\.(?:ics|ical)$/i.test(file.name) ? 'errors.invalidIcs' : 'errors.invalidJson'));
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (pendingImportRef.current) {
      await importData(pendingImportRef.current);
      pendingImportRef.current = null;
    }
    setDialog(null);
  };

  const handleNewCalendar = () => {
    setDialog('new-calendar');
  };

  const handleConfirmNewCalendar = async () => {
    await newCalendar();
    setDialog(null);
  };

  const handleSaveBeforeNew = async () => {
    handleExport();
    await newCalendar();
    setDialog(null);
  };

  const handleSaveAsImage = async () => {
    const calendarElement = document.querySelector('.week-calendar') as HTMLElement;
    const toolbarElement = document.querySelector('.calendrier-toolbar') as HTMLElement;

    if (!calendarElement) {
      showAlert(t('errors.calendarNotFound'));
      return;
    }

    try {
      if (toolbarElement) {
        toolbarElement.style.display = 'none';
      }

      const titleElement = calendarElement.querySelector('.calendar-title') as HTMLElement;
      if (titleElement) {
        titleElement.style.display = 'block';
      }

      const dataUrl = await runInLightMode(() => toPng(calendarElement, {
          quality: 1,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
          width: calendarElement.scrollWidth,
          height: calendarElement.scrollHeight,
        }));

      if (toolbarElement) {
        toolbarElement.style.display = '';
      }
      if (titleElement) {
        titleElement.style.display = '';
      }

      const link = document.createElement('a');
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calendar';
      link.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to save image:', error);
      showAlert(t('errors.failedToSaveImage'));

      if (toolbarElement) {
        toolbarElement.style.display = '';
      }
      const titleElement = calendarElement.querySelector('.calendar-title') as HTMLElement;
      if (titleElement) {
        titleElement.style.display = '';
      }
    }
  };

  const handlePrint = async () => {
    await runInLightMode(() => {
      window.print();
    });
  };

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setTempTitle(title);
  };

  const handleTitleSave = () => {
    if (tempTitle.trim()) {
      updateTitle(tempTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setTempTitle(title);
    }
  };

  const handleSaveToServer = async () => {
    if (!userId) {
      showAlert(t('toolbar.saveToServerError'));
      return;
    }

    try {
      const calendarId = await createServerCalendar();
      showAlert(t('toolbar.saveToServerSuccess', { id: calendarId.substring(0, 8) }), 'success');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showAlert(t('toolbar.saveToServerFailed', { error: errorMessage }));
    }
  };

  const handleDeleteCalendar = () => {
    setDialog('delete-calendar');
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteCalendar();
      setDialog(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showAlert(t('toolbar.deleteCalendarFailed', { error: errorMessage }));
    }
  };

  return (
    <>
      <header className="calendrier-toolbar" role="banner">
        <div className="calendrier-toolbar__brand">
            {isEditingTitle ? (
              <TextInput
                className="calendrier-title-input"
                type="text"
                value={tempTitle}
                onChange={(_event, value) => setTempTitle(value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                aria-label={t('toolbar.editTitlePlaceholder')}
              />
            ) : (
              <h1><button type="button"
                className="calendrier-title"
                onClick={handleTitleClick}
                title={t('toolbar.editTitlePlaceholder')}
              >
                {title}
              </button></h1>
            )}
        </div>
        <div className="calendrier-toolbar__actions">
          <div className="calendrier-toolbar__primary-actions">
                  <Button
                    variant="primary"
                    icon={<PlusIcon />}
                    onClick={onAddCourse}
                    aria-label={t('toolbar.addCourseTitle')}
                  >
                    {t('toolbar.addCourse')}
                  </Button>
                  <ToolbarDropdown
                    label={t('toolbar.file')}
                    icon={<FolderOpenIcon />}
                    items={[
                      {
                        label: t('toolbar.newCalendar'),
                        icon: <FileAltIcon />,
                        onClick: handleNewCalendar,
                      },
                      {
                        label: t('toolbar.export'),
                        icon: <FileExportIcon />,
                        onClick: handleExport,
                      },
                      {
                        label: t('toolbar.import'),
                        icon: <FileImportIcon />,
                        onClick: handleImport,
                      },
                      {
                        label: t('toolbar.saveAsImage'),
                        icon: <ImageIcon />,
                        onClick: handleSaveAsImage,
                      },
                      {
                        label: t('toolbar.print'),
                        icon: <PrintIcon />,
                        onClick: handlePrint,
                      },
                    ]}
                  />
                  <ToolbarDropdown
                    label={t('toolbar.shareMenu')}
                    icon={<ShareAltIcon />}
                    items={[
                      {
                        label: t('toolbar.share'),
                        icon: <ShareAltIcon />,
                        onClick: () => setDialog('share'),
                      },
                      ...(syncMode === 'local' && userId ? [{
                        label: t('toolbar.saveToServer'),
                        icon: <CloudUploadAltIcon />,
                        onClick: handleSaveToServer,
                      }] : []),
                      ...(syncMode === 'server' && hasWriteAccess ? [{
                        label: t('toolbar.deleteCalendar'),
                        icon: <TrashIcon />,
                        onClick: handleDeleteCalendar,
                      }] : []),
                    ]}
                  />
          </div>
          <div className="calendrier-toolbar__utility-actions">
                  <Button
                    variant="plain"
                    icon={<CogIcon />}
                    onClick={onOpenSettings}
                    aria-label={t('toolbar.settingsTitle')}
                  />
                  <Button
                    variant="plain"
                    icon={darkMode ? <SunIcon /> : <MoonIcon />}
                    onClick={toggleDarkMode}
                    aria-label={t('toolbar.darkModeTitle')}
                  />
                  <UserPanel />
          </div>
        </div>
      </header>

      {alertMessage && <InlineAlert title={alertMessage.message} variant={alertMessage.variant} onClose={() => setAlertMessage(null)} />}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.ics,.ical,text/calendar,application/ics"
        className="calendrier-file-input"
        onChange={handleFileChange}
      />

      {dialog === 'new-calendar' && (
        <ConfirmDialog
          title={t('dialogs.newCalendar.title')}
          message={t('dialogs.newCalendar.message')}
          confirmText={t('dialogs.newCalendar.confirm')}
          cancelText={t('dialogs.newCalendar.cancel')}
          showSecondaryAction
          secondaryActionText={t('dialogs.newCalendar.saveAndCreate')}
          onConfirm={handleConfirmNewCalendar}
          onSecondaryAction={handleSaveBeforeNew}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'import-warning' && (
        <ConfirmDialog
          title={t('dialogs.import.title')}
          message={t('dialogs.import.message')}
          confirmText={t('dialogs.import.confirm')}
          cancelText={t('dialogs.import.cancel')}
          onConfirm={handleConfirmImport}
          onCancel={() => {
            pendingImportRef.current = null;
            setDialog(null);
          }}
        />
      )}

      {dialog === 'share' && (
        <ShareDialog onClose={() => setDialog(null)} />
      )}

      {dialog === 'delete-calendar' && (
        <ConfirmDialog
          title={t('dialogs.deleteCalendar.title')}
          message={t('dialogs.deleteCalendar.message')}
          confirmText={t('dialogs.deleteCalendar.confirm')}
          cancelText={t('dialogs.deleteCalendar.cancel')}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
};

export default CalendrierToolbar;
