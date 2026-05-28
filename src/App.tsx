import { useState } from 'react';
import { CalendarProvider } from './context/CalendarContext';
import WeekCalendar from './components/WeekCalendar';
import CourseForm from './components/CourseForm';
import SettingsModal from './components/SettingsModal';
import Toolbar from './components/Toolbar';
import { URLHandler } from './components/URLHandler';
import type { Weekday } from './types/Course';
import './App.css';

function AppContent() {
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

  return (
    <div className="calendrier-app">
      <Toolbar onAddCourse={handleAddCourse} onOpenSettings={() => setShowSettings(true)} />
      <main className="calendrier-main">
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
