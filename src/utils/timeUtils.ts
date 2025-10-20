import type { Weekday, TimeFormat, WeekStart } from '../types/Course';
import i18n from '../i18n/config';

export const WEEKDAYS: Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const getOrderedWeekdays = (weekStart: WeekStart): Weekday[] => {
  if (weekStart === 'Sunday') {
    return ['Sunday', ...WEEKDAYS.slice(0, 6)];
  }
  return WEEKDAYS;
};

export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

export const formatTime = (time: string, format: TimeFormat): string => {
  if (format === '24h') {
    return time;
  }

  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? i18n.t('time.pm') : i18n.t('time.am');
  const displayHours = hours % 12 || 12;
  const timeString = `${displayHours}:${minutes.toString().padStart(2, '0')}`;

  // Chinese places period before time, other languages place it after
  if (i18n.language === 'zh') {
    return `${period} ${timeString}`;
  }
  return `${timeString} ${period}`;
};

export const calculateTimeRange = (sessions: Array<{ startTime: string; endTime: string }>) => {
  if (sessions.length === 0) {
    return { start: 8 * 60, end: 18 * 60 }; // Default 8:00 AM to 6:00 PM
  }

  let minStart = Infinity;
  let maxEnd = 0;

  sessions.forEach(session => {
    const start = timeToMinutes(session.startTime);
    const end = timeToMinutes(session.endTime);
    minStart = Math.min(minStart, start);
    maxEnd = Math.max(maxEnd, end);
  });

  // Add 30-minute padding
  minStart = Math.max(0, minStart - 30);
  maxEnd = Math.min(24 * 60, maxEnd + 30);

  // Round to nearest hour
  minStart = Math.floor(minStart / 60) * 60;
  maxEnd = Math.ceil(maxEnd / 60) * 60;

  return { start: minStart, end: maxEnd };
};
