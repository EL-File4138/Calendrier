import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Course, CalendarData, Settings } from '../types/Course';
import type { WSUpdateMessage, WSPresenceMessage } from '../api/types';
import { getNextColor } from '../utils/colors';
import { calendarAPI } from '../api/client';

const STORAGE_KEY = 'academic-calendar-data';
const USER_ID_KEY = 'calendrier-user-id';
const CALENDAR_ID_KEY = 'calendrier-calendar-id';
const USER_REGISTERED_KEY = 'calendrier-user-registered';

type SyncMode = 'local' | 'server';

interface CalendarContextType {
  // Data
  courses: Course[];
  title: string;
  settings: Settings;
  darkMode: boolean;

  // Sync state
  syncMode: SyncMode;
  userId: string | null;
  calendarId: string | null;
  isRegistered: boolean;
  hasWriteAccess: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  version: number;

  // CRUD operations
  addCourse: (course: Omit<Course, 'id'>) => Promise<void>;
  updateCourse: (id: string, course: Omit<Course, 'id'>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  duplicateCourse: (id: string) => Promise<void>;
  updateTitle: (title: string) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  toggleDarkMode: () => void;
  newCalendar: () => void;

  // Import/Export (local JSON)
  exportData: () => string;
  importData: (jsonString: string) => void;

  // Server operations
  createServerCalendar: () => Promise<string>;
  loadServerCalendar: (calendarId: string) => Promise<void>;
  syncToServer: () => Promise<void>;
  deleteCalendar: () => Promise<void>;
  grantAccess: (targetUserId: string, level: 'owner' | 'write' | 'read') => Promise<boolean>;
  revokeAccess: (targetUserId: string) => Promise<boolean>;
  listPrivileges: () => Promise<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>>;

  // Presence
  activeUsers: Array<{ userId: string; displayName?: string }>;
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

  // Sync state
  const [syncMode, setSyncMode] = useState<SyncMode>('local');
  const [userId, setUserId] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false); // Any access (read/write/owner)
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [activeUsers, setActiveUsers] = useState<Array<{ userId: string; displayName?: string }>>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Refs to always access latest state in callbacks
  const latestDataRef = useRef({ title, courses, settings, version });

  // Update ref whenever data changes
  useEffect(() => {
    latestDataRef.current = { title, courses, settings, version };
  }, [title, courses, settings, version]);

  // Load from localStorage on mount
  useEffect(() => {
    const initializeCalendar = async () => {
      try {
        // Load user ID
        const savedUserId = localStorage.getItem(USER_ID_KEY);
        if (savedUserId) {
          setUserId(savedUserId);

          // Load registration status
          const savedRegistered = localStorage.getItem(USER_REGISTERED_KEY);
          if (savedRegistered === 'true') {
            setIsRegistered(true);
          }
        }

        // Load calendar ID and fetch from server if available
        const savedCalendarId = localStorage.getItem(CALENDAR_ID_KEY);
        if (savedCalendarId && savedUserId) {
          setCalendarId(savedCalendarId);
          setSyncMode('server');

          // Load calendar from server
          try {
            const response = await calendarAPI.readCalendar(savedCalendarId, savedUserId);
            setCourses(response.data.courses);
            if (response.data.title) setTitle(response.data.title);
            if (response.data.settings) setSettings({ ...defaultSettings, ...response.data.settings });
            setVersion(response.version);
            setHasWriteAccess(response.hasWriteAccess);
            setHasCalendarAccess(true);
          } catch (error) {
            console.error('Failed to load saved calendar:', error);
            // Fall back to local data
            setSyncMode('local');
          }
        } else {
          // Load local data if no server calendar
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
        }

        // Load dark mode preference
        const savedDarkMode = localStorage.getItem('dark-mode');
        if (savedDarkMode) {
          setDarkMode(savedDarkMode === 'true');
        } else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setDarkMode(prefersDark);
        }
      } catch (error) {
        console.error('Failed to load data from localStorage:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    initializeCalendar();
  }, []);

  // Save to localStorage whenever data changes (local mode only)
  useEffect(() => {
    if (!isLoaded) return;

    if (syncMode === 'local') {
      try {
        const data: CalendarData = { title, courses, settings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save data to localStorage:', error);

        // Handle QuotaExceededError
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          alert('Browser storage is full. Please delete some old calendars or export your data.');
        }
      }
    }
  }, [courses, title, settings, isLoaded, syncMode]);

  // Update URL when calendar ID changes
  useEffect(() => {
    if (!isLoaded) return;

    if (calendarId && syncMode === 'server') {
      // Add calendar ID to URL
      const url = new URL(window.location.href);
      if (url.searchParams.get('calendar') !== calendarId) {
        url.searchParams.set('calendar', calendarId);
        window.history.replaceState({}, '', url.toString());
      }
    } else {
      // Remove calendar ID from URL if in local mode
      const url = new URL(window.location.href);
      if (url.searchParams.has('calendar')) {
        url.searchParams.delete('calendar');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [calendarId, syncMode, isLoaded]);

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

  // Connect WebSocket when in server mode (only if user has access)
  useEffect(() => {
    // Only connect WebSocket if user has successfully loaded a calendar (has any access level)
    if (syncMode === 'server' && calendarId && userId && isRegistered && hasCalendarAccess) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncMode, calendarId, userId, isRegistered, hasCalendarAccess]);

  const connectWebSocket = () => {
    if (!calendarId || !userId) return;

    try {
      const ws = calendarAPI.connectWebSocket(calendarId, userId);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0; // Reset on successful connection
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'update') {
          const updateMsg = message as WSUpdateMessage;
          // Update local state with server data
          setCourses(updateMsg.data.courses);
          if (updateMsg.data.title) setTitle(updateMsg.data.title);
          if (updateMsg.data.settings) setSettings(updateMsg.data.settings);
          setVersion(updateMsg.version);
        } else if (message.type === 'presence') {
          const presenceMsg = message as WSPresenceMessage;
          if (presenceMsg.action === 'join') {
            setActiveUsers(prev => [
              ...prev.filter(u => u.userId !== presenceMsg.userId),
              { userId: presenceMsg.userId, displayName: presenceMsg.displayName },
            ]);
          } else if (presenceMsg.action === 'leave') {
            setActiveUsers(prev => prev.filter(u => u.userId !== presenceMsg.userId));
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Implement exponential backoff with max attempts
        const MAX_RECONNECT_ATTEMPTS = 10;
        const BASE_DELAY = 1000; // 1 second
        const MAX_DELAY = 30000; // 30 seconds

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current),
            MAX_DELAY
          );

          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (syncMode === 'server' && calendarId && userId) {
              connectWebSocket();
            }
          }, delay);
        } else {
          console.error('Max WebSocket reconnection attempts reached');
          setLastSyncError('Connection lost. Please refresh the page.');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const syncToServer = useCallback(async () => {
    if (syncMode !== 'server' || !calendarId || !userId || !hasWriteAccess) {
      return;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      // Use ref to get the latest data
      const { title: currentTitle, courses: currentCourses, settings: currentSettings, version: currentVersion } = latestDataRef.current;
      const data: CalendarData = { title: currentTitle, courses: currentCourses, settings: currentSettings };
      const response = await calendarAPI.writeCalendar(calendarId, userId, data, currentVersion);

      if (response.success) {
        setVersion(response.version);
      } else {
        setLastSyncError(response.message || 'Sync failed - version conflict');
        // Version conflict - the WebSocket will receive the latest version
      }
    } catch (error: unknown) {
      console.error('Failed to sync to server:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLastSyncError(errorMessage);
    } finally {
      setIsSyncing(false);
    }
  }, [syncMode, calendarId, userId, hasWriteAccess]);

  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      syncToServer();
    }, 1000); // Debounce for 1 second
  }, [syncToServer]);

  const addCourse = async (courseData: Omit<Course, 'id'>) => {
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

    if (syncMode === 'server') {
      debouncedSync();
    }
  };

  const updateCourse = async (id: string, courseData: Omit<Course, 'id'>) => {
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

    if (syncMode === 'server') {
      debouncedSync();
    }
  };

  const deleteCourse = async (id: string) => {
    setCourses(prev => prev.filter(course => course.id !== id));

    if (syncMode === 'server') {
      debouncedSync();
    }
  };

  const duplicateCourse = async (id: string) => {
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

      if (syncMode === 'server') {
        debouncedSync();
      }
    }
  };

  const updateTitle = async (newTitle: string) => {
    setTitle(newTitle);

    if (syncMode === 'server') {
      debouncedSync();
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));

    if (syncMode === 'server') {
      debouncedSync();
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const newCalendar = async () => {
    // Auto-revoke from current calendar if in server mode
    if (syncMode === 'server' && calendarId && userId) {
      try {
        await calendarAPI.revokePrivilege(calendarId, userId, userId); // Self-revoke
      } catch (error) {
        console.error('Failed to auto-revoke on new calendar:', error);
        // Continue anyway - user wanted to create new calendar
      }
    }

    setCourses([]);
    setTitle('Academic Calendar');
    setSettings(defaultSettings);
    setCalendarId(null);
    setSyncMode('local');
    setHasWriteAccess(false);
    setHasCalendarAccess(false);
    localStorage.removeItem(CALENDAR_ID_KEY);

    // Remove calendar ID from URL
    const url = new URL(window.location.href);
    if (url.searchParams.has('calendar')) {
      url.searchParams.delete('calendar');
      window.history.pushState({}, '', url.toString());
    }
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

  const createServerCalendar = async (): Promise<string> => {
    if (!userId) {
      throw new Error('User must be logged in to create server calendars');
    }

    // Auto-revoke from current calendar if switching
    const previousCalendarId = calendarId;
    if (syncMode === 'server' && previousCalendarId) {
      try {
        await calendarAPI.revokePrivilege(previousCalendarId, userId, userId); // Self-revoke
      } catch (error) {
        console.error('Failed to auto-revoke from previous calendar:', error);
        // Continue anyway - user wanted to create new calendar
      }
    }

    try {
      const data: CalendarData = { title, courses, settings };
      const response = await calendarAPI.createCalendar(userId, data);
      setCalendarId(response.calendarId);
      setSyncMode('server');
      setHasWriteAccess(true);
      setHasCalendarAccess(true); // Owner has full access
      localStorage.setItem(CALENDAR_ID_KEY, response.calendarId);

      // Update URL to include calendar ID
      const url = new URL(window.location.href);
      url.searchParams.set('calendar', response.calendarId);
      window.history.pushState({}, '', url.toString());

      return response.calendarId;
    } catch (error: unknown) {
      console.error('Failed to create server calendar:', error);
      throw error;
    }
  };

  const loadServerCalendar = async (calId: string): Promise<void> => {
    // Auto-revoke from current calendar if switching
    const previousCalendarId = calendarId;
    if (syncMode === 'server' && previousCalendarId && previousCalendarId !== calId && userId) {
      try {
        await calendarAPI.revokePrivilege(previousCalendarId, userId, userId); // Self-revoke
      } catch (error) {
        console.error('Failed to auto-revoke from previous calendar:', error);
        // Continue anyway - user wanted to load different calendar
      }
    }

    try {
      const response = await calendarAPI.readCalendar(calId, userId || undefined);
      setCourses(response.data.courses);
      if (response.data.title) setTitle(response.data.title);
      if (response.data.settings) setSettings(response.data.settings);
      setVersion(response.version);
      setHasWriteAccess(response.hasWriteAccess);
      setHasCalendarAccess(true); // Successfully loaded = has access
      setCalendarId(calId);
      setSyncMode('server');
      localStorage.setItem(CALENDAR_ID_KEY, calId);

      // Update URL to include calendar ID
      const url = new URL(window.location.href);
      url.searchParams.set('calendar', calId);
      window.history.pushState({}, '', url.toString());
    } catch (error: unknown) {
      console.error('Failed to load server calendar:', error);
      throw error;
    }
  };

  const grantAccess = async (targetUserId: string, level: 'owner' | 'write' | 'read'): Promise<boolean> => {
    if (!calendarId || !userId) {
      throw new Error('No calendar or user ID');
    }

    try {
      const response = await calendarAPI.grantPrivilege(calendarId, userId, targetUserId, level);
      return response.success;
    } catch (error: unknown) {
      console.error('Failed to grant access:', error);
      throw error;
    }
  };

  const revokeAccess = async (targetUserId: string): Promise<boolean> => {
    if (!calendarId || !userId) {
      throw new Error('No calendar or user ID');
    }

    try {
      const response = await calendarAPI.revokePrivilege(calendarId, userId, targetUserId);
      return response.success;
    } catch (error: unknown) {
      console.error('Failed to revoke access:', error);
      throw error;
    }
  };

  const listPrivileges = async (): Promise<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>> => {
    if (!calendarId || !userId) {
      throw new Error('No calendar or user ID');
    }

    try {
      const response = await calendarAPI.listPrivileges(calendarId, userId);
      if (response.success && response.privileges) {
        return response.privileges;
      }
      throw new Error(response.message || 'Failed to list privileges');
    } catch (error: unknown) {
      console.error('Failed to list privileges:', error);
      throw error;
    }
  };

  const deleteCalendar = async (): Promise<void> => {
    if (!calendarId || !userId) {
      throw new Error('No calendar or user ID');
    }

    try {
      await calendarAPI.deleteCalendar(calendarId, userId);

      // Reset to local mode after deletion
      setCourses([]);
      setTitle('Academic Calendar');
      setSettings(defaultSettings);
      setCalendarId(null);
      setSyncMode('local');
      setHasWriteAccess(false);
      setHasCalendarAccess(false);
      localStorage.removeItem(CALENDAR_ID_KEY);

      // Remove calendar ID from URL
      const url = new URL(window.location.href);
      if (url.searchParams.has('calendar')) {
        url.searchParams.delete('calendar');
        window.history.pushState({}, '', url.toString());
      }
    } catch (error: unknown) {
      console.error('Failed to delete calendar:', error);
      throw error;
    }
  };

  return (
    <CalendarContext.Provider
      value={{
        courses,
        title,
        settings,
        darkMode,
        syncMode,
        userId,
        calendarId,
        isRegistered,
        hasWriteAccess,
        isSyncing,
        lastSyncError,
        version,
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
        createServerCalendar,
        loadServerCalendar,
        syncToServer,
        deleteCalendar,
        grantAccess,
        revokeAccess,
        listPrivileges,
        activeUsers,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCalendar = () => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within CalendarProvider');
  }
  return context;
};
