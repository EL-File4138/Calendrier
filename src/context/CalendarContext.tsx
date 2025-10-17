import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Course, CalendarData, Settings } from '../types/Course';
import { getNextColor } from '../utils/colors';

const STORAGE_KEY = 'academic-calendar-data';

interface CalendarContextType {
  courses: Course[];
  title: string;
  settings: Settings;
  darkMode: boolean;
  addCourse: (course: Omit<Course, 'id'>) => void;
  updateCourse: (id: string, course: Omit<Course, 'id'>) => void;
  deleteCourse: (id: string) => void;
  duplicateCourse: (id: string) => void;
  updateTitle: (title: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  toggleDarkMode: () => void;
  newCalendar: () => void;
  exportData: () => string;
  importData: (jsonString: string) => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

const defaultSettings: Settings = {
  timeFormat: '24h',
  weekStart: 'Monday',
};

export const CalendarProvider = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [title, setTitle] = useState('Academic Calendar');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [darkMode, setDarkMode] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data: CalendarData = JSON.parse(saved);
        if (data.courses && Array.isArray(data.courses)) {
          setCourses(data.courses);
        }
        if (data.title) {
          setTitle(data.title);
        }
        if (data.settings) {
          setSettings({ ...defaultSettings, ...data.settings });
        }
      }

      // Load dark mode preference
      const savedDarkMode = localStorage.getItem('dark-mode');
      if (savedDarkMode) {
        setDarkMode(savedDarkMode === 'true');
      } else {
        // If no saved preference, check system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDarkMode(prefersDark);
      }
    } catch (error) {
      console.error('Failed to load data from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage whenever data changes (but only after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      const data: CalendarData = {
        title,
        courses,
        settings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save data to localStorage:', error);
    }
  }, [courses, title, settings, isLoaded]);

  // Save dark mode preference
  useEffect(() => {
    if (!isLoaded) return;

    localStorage.setItem('dark-mode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [darkMode, isLoaded]);

  const addCourse = (courseData: Omit<Course, 'id'>) => {
    const newCourse: Course = {
      ...courseData,
      id: crypto.randomUUID(),
      color: courseData.color || getNextColor(courses.map(c => c.color)),
      sessions: courseData.sessions.map(session => ({
        ...session,
        id: crypto.randomUUID(),
      })),
    };
    setCourses(prev => [...prev, newCourse]);
  };

  const updateCourse = (id: string, courseData: Omit<Course, 'id'>) => {
    setCourses(prev =>
      prev.map(course =>
        course.id === id
          ? {
              ...courseData,
              id,
              sessions: courseData.sessions.map(session => ({
                ...session,
                id: session.id || crypto.randomUUID(),
              })),
            }
          : course
      )
    );
  };

  const deleteCourse = (id: string) => {
    setCourses(prev => prev.filter(course => course.id !== id));
  };

  const duplicateCourse = (id: string) => {
    const course = courses.find(c => c.id === id);
    if (course) {
      const duplicated: Course = {
        ...course,
        id: crypto.randomUUID(),
        title: `${course.title} (Copy)`,
        sessions: course.sessions.map(session => ({
          ...session,
          id: crypto.randomUUID(),
        })),
      };
      setCourses(prev => [...prev, duplicated]);
    }
  };

  const updateTitle = (newTitle: string) => {
    setTitle(newTitle);
  };

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const newCalendar = () => {
    setCourses([]);
    setTitle('Academic Calendar');
    setSettings(defaultSettings);
  };

  const exportData = (): string => {
    const data: CalendarData = { title, courses, settings };
    return JSON.stringify(data, null, 2);
  };

  const importData = (jsonString: string) => {
    try {
      const data: CalendarData = JSON.parse(jsonString);
      if (data.courses && Array.isArray(data.courses)) {
        const validatedCourses = data.courses.map(course => ({
          ...course,
          id: course.id || crypto.randomUUID(),
          sessions: course.sessions.map(session => ({
            ...session,
            id: session.id || crypto.randomUUID(),
          })),
        }));
        setCourses(validatedCourses);
      }
      if (data.title) {
        setTitle(data.title);
      }
      if (data.settings) {
        setSettings({ ...defaultSettings, ...data.settings });
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      alert('Invalid JSON format');
    }
  };

  return (
    <CalendarContext.Provider
      value={{
        courses,
        title,
        settings,
        darkMode,
        addCourse,
        updateCourse,
        deleteCourse,
        duplicateCourse,
        updateTitle,
        updateSettings,
        toggleDarkMode,
        newCalendar,
        exportData,
        importData,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within CalendarProvider');
  }
  return context;
};
