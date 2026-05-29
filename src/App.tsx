import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bullseye, Spinner } from '@patternfly/react-core';
import { CalendarProvider } from './context/CalendarContext';
import WeekCalendar from './components/WeekCalendar';
import CourseForm from './components/CourseForm';
import SettingsModal from './components/SettingsModal';
import Toolbar from './components/Toolbar';
import InlineAlert from './components/InlineAlert';
import { URLHandler } from './components/URLHandler';
import { useCalendar } from './context/CalendarContext';
import type { Weekday } from './types/Course';
import './App.css';

function AppContent() {
  const { t } = useTranslation();
  const { isLoaded, localError } = useCalendar();
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | undefined>();
  const [formInitialData, setFormInitialData] = useState<{
    day?: Weekday;
    startTime?: string;
    endTime?: string;
  }>();
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

  if (!isLoaded) {
    return (
      <div className="calendrier-app">
        <Bullseye className="calendrier-loading-state">
          <Spinner size="xl" aria-label={t('urlHandler.loadingCalendar')} />
        </Bullseye>
      </div>
    );
  }

  return (
    <div className="calendrier-app">
      <Toolbar onAddCourse={handleAddCourse} onOpenSettings={() => setShowSettings(true)} />
      <main className="calendrier-main">
        {localError && <InlineAlert title={localError} variant="danger" />}
        <URLHandler />
        <WeekCalendar
          onEditCourse={handleEditCourse}
          onDragCreate={handleDragCreate}
        />
      </main>
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
