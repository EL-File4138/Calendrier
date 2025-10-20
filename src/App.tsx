import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarProvider, useCalendar } from './context/CalendarContext';
import WeekCalendar from './components/WeekCalendar';
import CourseForm from './components/CourseForm';
import SettingsModal from './components/SettingsModal';
import ConfirmDialog from './components/ConfirmDialog';
import Toolbar from './components/Toolbar';
import type { Weekday } from './types/Course';
import './App.css';

function AppContent() {
  const { t } = useTranslation();
  const { importData } = useCalendar();
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | undefined>();
  const [formInitialData, setFormInitialData] = useState<{
    day?: Weekday;
    startTime?: string;
    endTime?: string;
  }>();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const pendingImportRef = useRef<string | null>(null);

  useEffect(() => {
    // Check for ?import=<base64> query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const importParam = urlParams.get('import');

    if (importParam) {
      try {
        // Decode base64 to get URL
        const decodedUrl = atob(importParam);

        // Basic URL validation
        let url: URL;
        try {
          url = new URL(decodedUrl);
        } catch {
          throw new Error('Invalid URL format');
        }

        // Security: Only allow http/https protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Invalid URL protocol. Only HTTP and HTTPS are allowed.');
        }

        // Fetch the JSON file
        fetch(decodedUrl)
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
          })
          .then(jsonString => {
            // Validate JSON structure
            try {
              const data = JSON.parse(jsonString);
              if (!data.courses || !Array.isArray(data.courses)) {
                throw new Error('Invalid calendar data format');
              }

              // Store the JSON and show confirmation dialog
              pendingImportRef.current = jsonString;
              setShowImportDialog(true);
            } catch (e) {
              console.error('Invalid JSON format:', e);
              alert(t('errors.invalidCalendarFormat'));
            }
          })
          .catch(error => {
            console.error('Failed to fetch calendar data:', error);
            alert(t('errors.failedToFetchCalendar') + ': ' + error.message);
          });

        // Clean up URL by removing the query parameter
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (error) {
        console.error('Failed to process import parameter:', error);
        alert('Failed to process import parameter: ' + (error as Error).message);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleConfirmImport = () => {
    if (pendingImportRef.current) {
      importData(pendingImportRef.current);
      pendingImportRef.current = null;
    }
    setShowImportDialog(false);
  };

  const handleAddCourse = () => {
    setEditingCourseId(undefined);
    setFormInitialData(undefined);
    setShowForm(true);
  };

  const handleEditCourse = (courseId: string) => {
    setEditingCourseId(courseId);
    setFormInitialData(undefined);
    setShowForm(true);
  };

  const handleDragCreate = (day: Weekday, startTime: string, endTime: string) => {
    setEditingCourseId(undefined);
    setFormInitialData({ day, startTime, endTime });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingCourseId(undefined);
    setFormInitialData(undefined);
  };

  return (
    <div className="app">
      <Toolbar onAddCourse={handleAddCourse} onOpenSettings={() => setShowSettings(true)} />
      <div className="app-content">
        <WeekCalendar
          onEditCourse={handleEditCourse}
          onDragCreate={handleDragCreate}
        />
      </div>
      {showForm && (
        <CourseForm
          courseId={editingCourseId}
          initialData={formInitialData}
          onClose={handleCloseForm}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showImportDialog && (
        <ConfirmDialog
          title={t('dialogs.importFromUrl.title')}
          message={t('dialogs.importFromUrl.message')}
          confirmText={t('dialogs.importFromUrl.confirm')}
          cancelText={t('dialogs.importFromUrl.cancel')}
          onConfirm={handleConfirmImport}
          onCancel={() => {
            pendingImportRef.current = null;
            setShowImportDialog(false);
          }}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <CalendarProvider>
      <AppContent />
    </CalendarProvider>
  );
}

export default App;
