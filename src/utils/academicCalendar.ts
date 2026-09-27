import type { AcademicCalendar, AcademicPeriod, WeekStart } from '../types/Course';
import { weekStartDate } from './sessionSchedule';

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const academicPeriodForDate = (calendar: AcademicCalendar | undefined, date: Date): AcademicPeriod | undefined => {
  return academicPeriodsForDate(calendar, date)[0];
};

export const academicPeriodsForDate = (calendar: AcademicCalendar | undefined, date: Date): AcademicPeriod[] => {
  if (!calendar) return [];
  const key = academicDateKey(date);
  return calendar.periods.filter((period) => period.startDate <= key && period.endDate >= key);
};

export const academicWeekNumber = (period: AcademicPeriod | undefined, date: Date, weekStart: WeekStart = 'Monday'): number | undefined => {
  if (!period || period.kind !== 'semester') return undefined;
  const start = parseDate(period.startDate);
  if (!start) return undefined;
  const firstWeek = weekStartDate(start, weekStart);
  const currentWeek = weekStartDate(date, weekStart);
  // Compare calendar dates in UTC so daylight-saving changes cannot shift the week count.
  const calendarDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((calendarDay(currentWeek) - calendarDay(firstWeek)) / DAY_MS / 7) + 1;
};

export const academicDateKey = (date: Date) => (
  `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
);

export const academicSpecialDateLabel = (calendar: AcademicCalendar | undefined, date: Date) => (
  calendar?.specialDates?.[academicDateKey(date)]
);
