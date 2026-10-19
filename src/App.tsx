import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Bullseye, Spinner } from '@patternfly/react-core';
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
import PublicCalendarView from './components/PublicCalendarView';

function AppContent() {
  const { t } = useTranslation();
  const { isLoaded, localError, dismissLocalError, isOffline, calendarId, loadServerCalendar } = useCalendar();
  const [retryError, setRetryError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [displayMode, setDisplayMode] = useState<'week' | 'consolidated'>('week');
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
      <Toolbar onAddCourse={handleAddCourse} onOpenSettings={() => setShowSettings(true)} displayMode={displayMode} onDisplayModeChange={setDisplayMode} />
      <main className="calendrier-main">
        {isOffline && <Alert isInline variant="warning" title={t('remoteCalendar.offline')}>
          <p>{t('remoteCalendar.cached')}</p>
          <Button variant="link" onClick={() => { setRetryError(false); if (calendarId) void loadServerCalendar(calendarId).catch(() => setRetryError(true)); }}>{t('remoteCalendar.retry')}</Button>
          {retryError && <p role="alert">{t('errors.connectionLost')}</p>}
        </Alert>}
        {localError && <InlineAlert onClose={dismissLocalError} title={t(localError)} variant="danger" />}
        <URLHandler />
        <WeekCalendar
          readOnly={isOffline}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
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
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);
  if (new URLSearchParams(hash.slice(1)).has('public')) {
    return <PublicCalendarView key={hash} hash={hash} />;
  }
  return <CalendarProvider><AppContent /></CalendarProvider>;
}

export default App;
