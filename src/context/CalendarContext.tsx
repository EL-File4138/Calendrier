import i18n from '../i18n/config';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Course, CalendarData, Settings, Weekday, SessionSchedule, SessionOverride, AcademicCalendar, AcademicPeriodKind } from '../types/Course';
import type { WSUpdateMessage, WSPresenceMessage } from '../api/types';
import { getNextColor } from '../utils/colors';
import { calendarAPI } from '../api/client';
import { DEFAULT_EVENT_TYPE_ICONS } from '../utils/eventIcons';

const STORAGE_KEY = 'academic-calendar-data';
const USER_ID_KEY = 'calendrier-user-id';
const SESSION_TOKEN_KEY = 'calendrier-session-token';
const CALENDAR_ID_KEY = 'calendrier-calendar-id';
const USER_REGISTERED_KEY = 'calendrier-user-registered';
const WEEKDAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MAX_CALENDAR_IMPORT_BYTES = 256 * 1024;

const safeLocalStorage = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore unavailable storage during cleanup.
    }
  },
};

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
  sessionToken: string | null;
  calendarId: string | null;
  isRegistered: boolean;
  isLoaded: boolean;
  hasWriteAccess: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  dismissSyncError: () => void;
  localError: string | null;
  dismissLocalError: () => void;
  version: number;

  // CRUD operations
  addCourse: (course: Omit<Course, 'id'>) => Promise<void>;
  updateCourse: (id: string, course: Omit<Course, 'id'>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  duplicateCourse: (id: string) => Promise<void>;
  updateTitle: (title: string) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  toggleDarkMode: () => void;
  newCalendar: () => Promise<void>;

  // Import/Export (local JSON)
  exportData: () => string;
  importData: (jsonString: string) => Promise<boolean>;

  // Server operations
  createServerCalendar: () => Promise<string>;
  registerUserSession: (userId: string, sessionToken: string) => Promise<void>;
  loadServerCalendar: (calendarId: string) => Promise<void>;
  syncToServer: () => Promise<void>;
  deleteCalendar: () => Promise<void>;
  grantAccess: (targetUserId: string, level: 'owner' | 'write' | 'read') => Promise<boolean>;
  revokeAccess: (targetUserId: string) => Promise<{ success: boolean; message?: string; shouldDestroy?: boolean }>;
  listPrivileges: () => Promise<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>>;

  // Presence
  activeUsers: Array<{ userId: string; displayName?: string }>;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

const defaultSettings: Settings = {
  timeFormat: '24h',
  weekStart: 'Monday',
  weekView: 'school',
  eventTypeIcons: DEFAULT_EVENT_TYPE_ICONS,
};

const sanitizeAcademicCalendar = (value: unknown): AcademicCalendar | undefined => {
  if (!isRecord(value) || typeof value.yearLabel !== 'string' || typeof value.startDate !== 'string' || typeof value.endDate !== 'string' || !Array.isArray(value.periods)) return undefined;
  const kinds: AcademicPeriodKind[] = ['semester', 'break', 'holiday', 'exams', 'retakeExams', 'other'];
  const periods = value.periods.flatMap((period): AcademicCalendar['periods'] => {
    if (!isRecord(period) || typeof period.label !== 'string' || typeof period.startDate !== 'string' || typeof period.endDate !== 'string') return [];
    return [{
      id: typeof period.id === 'string' ? period.id : crypto.randomUUID(),
      label: period.label,
      kind: kinds.includes(period.kind as AcademicPeriodKind) ? period.kind as AcademicPeriodKind : 'other',
      startDate: period.startDate,
      endDate: period.endDate,
    }];
  });
  const specialDates = isRecord(value.specialDates)
    ? Object.fromEntries(Object.entries(value.specialDates).flatMap(([date, label]): Array<[string, string]> => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof label === 'string' && label.trim() ? [[date, label]] : []))
    : undefined;
  return { yearLabel: value.yearLabel, startDate: value.startDate, endDate: value.endDate, periods, specialDates };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const sanitizeCalendarData = (value: unknown): CalendarData => {
  if (!isRecord(value)) {
    return { courses: [] };
  }

  const usedColors = Array.isArray(value.courses) ? value.courses.flatMap((course) => isRecord(course) && typeof course.color === 'string' ? [course.color] : []) : [];
  const courses = Array.isArray(value.courses)
    ? value.courses.flatMap((course): Course[] => {
      if (!isRecord(course)) return [];

      const sessions = Array.isArray(course.sessions)
        ? course.sessions.flatMap((session): Course['sessions'] => {
          if (!isRecord(session) || !WEEKDAYS.includes(session.meetDay as Weekday)) return [];

          const rawSchedule = isRecord(session.schedule) ? session.schedule : undefined;
          const rawOverrides = rawSchedule && isRecord(rawSchedule.overrides) ? rawSchedule.overrides : undefined;
          const overrides = rawOverrides ? Object.fromEntries(Object.entries(rawOverrides).flatMap(([date, raw]): Array<[string, SessionOverride]> => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRecord(raw)) return [];
            const override: SessionOverride = {};
            if (raw.cancelled === true) override.cancelled = true;
            for (const key of ['moveToDate', 'startTime', 'endTime', 'location', 'instructor'] as const) {
              if (typeof raw[key] === 'string' && raw[key]) override[key] = raw[key];
            }
            return [[date, override]];
          })) : undefined;
          const schedule: SessionSchedule | undefined = rawSchedule && (rawSchedule.mode === 'weekly' || rawSchedule.mode === 'once' || rawSchedule.mode === 'bounded')
            ? {
              mode: rawSchedule.mode,
              startDate: typeof rawSchedule.startDate === 'string' ? rawSchedule.startDate : undefined,
              endDate: typeof rawSchedule.endDate === 'string' ? rawSchedule.endDate : undefined,
              intervalWeeks: typeof rawSchedule.intervalWeeks === 'number' && rawSchedule.intervalWeeks > 0 ? Math.floor(rawSchedule.intervalWeeks) : 1,
              excludedDates: Array.isArray(rawSchedule.excludedDates) ? rawSchedule.excludedDates.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) : [],
              overrides,
            } : undefined;

          return [{
            id: typeof session.id === 'string' ? session.id : crypto.randomUUID(),
            meetDay: session.meetDay as Weekday,
            startTime: typeof session.startTime === 'string' ? session.startTime : '09:00',
            endTime: typeof session.endTime === 'string' ? session.endTime : '10:00',
            sessionType: typeof session.sessionType === 'string' ? session.sessionType : undefined,
            icon: typeof session.icon === 'string' ? session.icon : undefined,
            instructor: typeof session.instructor === 'string' ? session.instructor : undefined,
            location: typeof session.location === 'string' ? session.location : undefined,
            schedule,
          }];
        })
        : [];

      const color = typeof course.color === 'string' ? course.color : getNextColor(usedColors);
      usedColors.push(color);
      return [{
        id: typeof course.id === 'string' ? course.id : crypto.randomUUID(),
        title: typeof course.title === 'string' ? course.title : i18n.t('calendar.untitledCourse'),
        color,
        icon: typeof course.icon === 'string' ? course.icon : undefined,
        sessions,
      }];
    })
    : [];

  const settings = isRecord(value.settings)
    ? {
      timeFormat: value.settings.timeFormat === '12h' ? '12h' : '24h',
      weekStart: value.settings.weekStart === 'Sunday' ? 'Sunday' : 'Monday',
      weekView: value.settings.weekView === 'full' ? 'full' : 'school',
      eventTypeIcons: isRecord(value.settings.eventTypeIcons)
        ? { ...DEFAULT_EVENT_TYPE_ICONS, ...Object.fromEntries(Object.entries(value.settings.eventTypeIcons).flatMap(([key, icon]): Array<[string, string]> => typeof icon === 'string' && icon.trim() ? [[key, icon.trim().slice(0, 32)]] : [])) }
        : { ...DEFAULT_EVENT_TYPE_ICONS },
      academicCalendar: sanitizeAcademicCalendar(value.settings.academicCalendar),
    } satisfies Settings
    : undefined;

  return {
    courses,
    title: typeof value.title === 'string' ? value.title : undefined,
    settings,
  };
};

export const CalendarProvider = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [title, setTitle] = useState(i18n.t('calendar.defaultTitle'));
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [darkMode, setDarkMode] = useState(false);

  // Sync state
  const [syncMode, setSyncMode] = useState<SyncMode>('local');
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false); // Any access (read/write/owner)
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [activeUsers, setActiveUsers] = useState<Array<{ userId: string; displayName?: string }>>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const syncStateRef = useRef({ syncMode, calendarId, userId, sessionToken });

  // Refs to always access latest state in callbacks
  const latestDataRef = useRef({ title, courses, settings, version });

  // Update ref whenever data changes
  useEffect(() => {
    latestDataRef.current = { title, courses, settings, version };
  }, [title, courses, settings, version]);

  useEffect(() => {
    syncStateRef.current = { syncMode, calendarId, userId, sessionToken };
  }, [syncMode, calendarId, userId, sessionToken]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const initializeCalendar = async () => {
      try {
        // Load user ID
        const savedUserId = safeLocalStorage.getItem(USER_ID_KEY);
        if (savedUserId) {
          setUserId(savedUserId);
          setSessionToken(safeLocalStorage.getItem(SESSION_TOKEN_KEY));

          // Load registration status
          const savedRegistered = safeLocalStorage.getItem(USER_REGISTERED_KEY);
          if (savedRegistered === 'true') {
            setIsRegistered(true);
          }
        }

        // Load calendar ID and fetch from server if available
        const savedCalendarId = safeLocalStorage.getItem(CALENDAR_ID_KEY);
        const savedSessionToken = safeLocalStorage.getItem(SESSION_TOKEN_KEY);
        if (savedCalendarId && savedUserId && savedSessionToken) {
          setCalendarId(savedCalendarId);
          setSyncMode('server');

          // Load calendar from server
          try {
            const response = await calendarAPI.readCalendar(savedCalendarId, savedUserId, savedSessionToken);
            setCourses(response.data.courses);
            if (response.data.title) setTitle(response.data.title);
            if (response.data.settings) setSettings({ ...defaultSettings, ...response.data.settings });
            setVersion(response.version);
            setHasWriteAccess(response.hasWriteAccess);
            setHasCalendarAccess(true);
          } catch (error) {
            console.error('Failed to load saved calendar:', error);
            setSyncMode('local');
            safeLocalStorage.removeItem(CALENDAR_ID_KEY);
          }
        } else {
          // Load local data if no server calendar
          const saved = safeLocalStorage.getItem(STORAGE_KEY);
          if (saved) {
            const data = sanitizeCalendarData(JSON.parse(saved));
            setCourses(data.courses);
            if (data.title) {
              setTitle(data.title);
            }
            if (data.settings) {
              setSettings({ ...defaultSettings, ...data.settings });
            }
          }
        }

        // Load dark mode preference
        const savedDarkMode = safeLocalStorage.getItem('dark-mode');
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
        safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save data to localStorage:', error);

        // Handle QuotaExceededError
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          setLocalError('errors.storageFull');
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

    try {
      safeLocalStorage.setItem('dark-mode', darkMode.toString());
    } catch {
      // Keep rendering even when browser storage is unavailable.
    }
    if (darkMode) {
      document.documentElement.classList.add('dark-mode', 'pf-v6-theme-dark');
    } else {
      document.documentElement.classList.remove('dark-mode', 'pf-v6-theme-dark');
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
      if (!sessionToken) return;
      const ws = calendarAPI.connectWebSocket(calendarId, userId, sessionToken);

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
            const current = syncStateRef.current;
            if (current.syncMode === 'server' && current.calendarId && current.userId && current.sessionToken) {
              connectWebSocket();
            }
          }, delay);
        } else {
          console.error('Max WebSocket reconnection attempts reached');
          setLastSyncError(i18n.t('errors.connectionLost'));
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const syncToServer = useCallback(async () => {
    if (syncMode !== 'server' || !calendarId || !userId || !sessionToken || !hasWriteAccess) {
      return;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      // Use ref to get the latest data
      const { title: currentTitle, courses: currentCourses, settings: currentSettings, version: currentVersion } = latestDataRef.current;
      const data: CalendarData = { title: currentTitle, courses: currentCourses, settings: currentSettings };
      const response = await calendarAPI.writeCalendar(calendarId, userId, sessionToken, data, currentVersion);

      if (response.success) {
        setVersion(response.version);
      } else {
        setLastSyncError(i18n.t('errors.syncConflict'));
        // Version conflict - the WebSocket will receive the latest version
      }
    } catch (error: unknown) {
      console.error('Failed to sync to server:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setLastSyncError(errorMessage);
    } finally {
      setIsSyncing(false);
    }
  }, [syncMode, calendarId, userId, sessionToken, hasWriteAccess]);

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
        if (sessionToken) {
          await calendarAPI.revokePrivilege(calendarId, userId, sessionToken, userId); // Self-revoke
        }
      } catch (error) {
        console.error('Failed to auto-revoke on new calendar:', error);
        // Continue anyway - user wanted to create new calendar
      }
    }

    setCourses([]);
    setTitle(i18n.t('calendar.defaultTitle'));
    setSettings(defaultSettings);
    setCalendarId(null);
    setSyncMode('local');
    setHasWriteAccess(false);
    setHasCalendarAccess(false);
    setVersion(1);
    setLastSyncError(null);
    safeLocalStorage.removeItem(CALENDAR_ID_KEY);

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

  const importData = async (jsonString: string) => {
    try {
      if (new TextEncoder().encode(jsonString).length > MAX_CALENDAR_IMPORT_BYTES) {
        setLocalError('errors.importTooLarge');
        return false;
      }
      const data = sanitizeCalendarData(JSON.parse(jsonString));
      setCourses(data.courses);
      setTitle(data.title || i18n.t('calendar.defaultTitle'));
      setSettings({ ...defaultSettings, ...data.settings });
      setLocalError(null);
      if (syncMode === 'server' && hasWriteAccess) {
        debouncedSync();
      }
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      setLocalError('errors.invalidJson');
      return false;
    }
  };

  const createServerCalendar = async (): Promise<string> => {
    if (!userId || !sessionToken) {
      throw new Error(i18n.t('toolbar.saveToServerError'));
    }

    // Auto-revoke from current calendar if switching
    const previousCalendarId = calendarId;
    if (syncMode === 'server' && previousCalendarId) {
      try {
        await calendarAPI.revokePrivilege(previousCalendarId, userId, sessionToken, userId); // Self-revoke
      } catch (error) {
        console.error('Failed to auto-revoke from previous calendar:', error);
        // Continue anyway - user wanted to create new calendar
      }
    }

    try {
      const data: CalendarData = { title, courses, settings };
      const response = await calendarAPI.createCalendar(userId, sessionToken, data);
      setCalendarId(response.calendarId);
      setSyncMode('server');
      setHasWriteAccess(true);
      setHasCalendarAccess(true); // Owner has full access
      setVersion(1);
      setLastSyncError(null);
      safeLocalStorage.setItem(CALENDAR_ID_KEY, response.calendarId);

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
    if (syncMode === 'server' && previousCalendarId && previousCalendarId !== calId && userId && sessionToken) {
      try {
        await calendarAPI.revokePrivilege(previousCalendarId, userId, sessionToken, userId); // Self-revoke
      } catch (error) {
        console.error('Failed to auto-revoke from previous calendar:', error);
        // Continue anyway - user wanted to load different calendar
      }
    }

    try {
      const response = await calendarAPI.readCalendar(calId, userId || undefined, sessionToken || undefined);
      setCourses(response.data.courses);
      if (response.data.title) setTitle(response.data.title);
      if (response.data.settings) setSettings(response.data.settings);
      setVersion(response.version);
      setHasWriteAccess(response.hasWriteAccess);
      setHasCalendarAccess(true); // Successfully loaded = has access
      setCalendarId(calId);
      setSyncMode('server');
      safeLocalStorage.setItem(CALENDAR_ID_KEY, calId);

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
    if (!calendarId || !userId || !sessionToken) {
      throw new Error(i18n.t('errors.calendarNotFound'));
    }

    try {
      const response = await calendarAPI.grantPrivilege(calendarId, userId, sessionToken, targetUserId, level);
      return response.success;
    } catch (error: unknown) {
      console.error('Failed to grant access:', error);
      throw error;
    }
  };

  const revokeAccess = async (targetUserId: string): Promise<{ success: boolean; message?: string; shouldDestroy?: boolean }> => {
    if (!calendarId || !userId || !sessionToken) {
      throw new Error(i18n.t('errors.calendarNotFound'));
    }

    try {
      return await calendarAPI.revokePrivilege(calendarId, userId, sessionToken, targetUserId);
    } catch (error: unknown) {
      console.error('Failed to revoke access:', error);
      throw error;
    }
  };

  const listPrivileges = async (): Promise<Array<{userId: string; level: string; grantedAt: number; grantedBy: string}>> => {
    if (!calendarId || !userId || !sessionToken) {
      throw new Error(i18n.t('errors.calendarNotFound'));
    }

    try {
      const response = await calendarAPI.listPrivileges(calendarId, userId, sessionToken);
      if (response.success && response.privileges) {
        return response.privileges;
      }
      throw new Error(i18n.t('errors.loadPrivileges'));
    } catch (error: unknown) {
      console.error('Failed to list privileges:', error);
      throw error;
    }
  };

  const deleteCalendar = async (): Promise<void> => {
    if (!calendarId || !userId || !sessionToken) {
      throw new Error(i18n.t('errors.calendarNotFound'));
    }

    try {
      await calendarAPI.deleteCalendar(calendarId, userId, sessionToken);

      // Reset to local mode after deletion
      setCourses([]);
      setTitle(i18n.t('calendar.defaultTitle'));
      setSettings(defaultSettings);
      setCalendarId(null);
      setSyncMode('local');
      setHasWriteAccess(false);
      setHasCalendarAccess(false);
      setVersion(1);
      setLastSyncError(null);
      safeLocalStorage.removeItem(CALENDAR_ID_KEY);

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

  const registerUserSession = async (nextUserId: string, nextSessionToken: string): Promise<void> => {
    setUserId(nextUserId);
    setSessionToken(nextSessionToken);
    setIsRegistered(true);
    safeLocalStorage.setItem(USER_ID_KEY, nextUserId);
    safeLocalStorage.setItem(SESSION_TOKEN_KEY, nextSessionToken);
    safeLocalStorage.setItem(USER_REGISTERED_KEY, 'true');
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
        sessionToken,
        calendarId,
        isRegistered,
        isLoaded,
        hasWriteAccess,
        isSyncing,
        lastSyncError,
        dismissSyncError: () => setLastSyncError(null),
        localError,
        dismissLocalError: () => setLocalError(null),
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
        registerUserSession,
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
