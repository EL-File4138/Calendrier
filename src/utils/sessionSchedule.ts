import type { Session, SessionOverride, Weekday } from '../types/Course';

const WEEKDAYS: Weekday[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ResolvedSession extends Session {
  occurrenceDate: string;
  sourceDate: string;
}

export const dateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export function resolveSessionForDate(session: Session, date: Date): ResolvedSession | null {
  const targetKey = dateKey(date);
  const schedule = session.schedule;
  if (!schedule) {
    if (WEEKDAYS[date.getDay()] !== session.meetDay) return null;
    return { ...session, occurrenceDate: targetKey, sourceDate: targetKey };
  }

  const startKey = schedule.startDate;
  if (!startKey) return null;
  const start = parseDateKey(startKey);
  const overrideEntries = Object.entries(schedule.overrides ?? {});
  const movedSource = overrideEntries.find(([, value]) => value.moveToDate === targetKey)?.[0];
  const sourceKey = movedSource ?? targetKey;
  const sourceDate = parseDateKey(sourceKey);
  const weeks = Math.round((sourceDate.getTime() - start.getTime()) / (7 * 86400000));
  const interval = Math.max(1, schedule.intervalWeeks ?? 1);
  const recurring = schedule.mode === 'once'
    ? sourceKey === startKey
    : sourceDate >= start
      && WEEKDAYS[sourceDate.getDay()] === session.meetDay
      && weeks >= 0
      && weeks % interval === 0
      && (!schedule.endDate || sourceKey <= schedule.endDate);
  if (!recurring || schedule.excludedDates?.includes(sourceKey)) return null;

  const override: SessionOverride | undefined = schedule.overrides?.[sourceKey];
  if (override?.cancelled) return null;
  const effectiveDate = override?.moveToDate ? parseDateKey(override.moveToDate) : sourceDate;
  if (dateKey(effectiveDate) !== targetKey) return null;
  return {
    ...session,
    meetDay: WEEKDAYS[effectiveDate.getDay()],
    startTime: override?.startTime ?? session.startTime,
    endTime: override?.endTime ?? session.endTime,
    location: override?.location ?? session.location,
    instructor: override?.instructor ?? session.instructor,
    occurrenceDate: targetKey,
    sourceDate: sourceKey,
  };
}

export const weekStartDate = (date: Date, weekStart: Weekday = 'Monday'): Date => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const desired = weekStart === 'Sunday' ? 0 : 1;
  const delta = (result.getDay() - desired + 7) % 7;
  result.setDate(result.getDate() - delta);
  return result;
};

export function consolidateSession(session: Session): Session[] {
  const schedule = session.schedule;
  if (!schedule) return [session];
  if (!schedule.startDate) return [];
  const variants = new Map<string, Session>();
  const add = (date: Date) => {
    const resolved = resolveSessionForDate(session, date);
    if (!resolved) return;
    const key = JSON.stringify([resolved.meetDay, resolved.startTime, resolved.endTime, resolved.location, resolved.instructor]);
    variants.set(key, { ...session, meetDay: resolved.meetDay, startTime: resolved.startTime, endTime: resolved.endTime, location: resolved.location, instructor: resolved.instructor });
  };
  const start = parseDateKey(schedule.startDate);
  if (schedule.mode === 'once') {
    add(start);
  } else {
    const first = new Date(start);
    first.setDate(first.getDate() + (WEEKDAYS.indexOf(session.meetDay) - first.getDay() + 7) % 7);
    // One more candidate than all exceptions guarantees an ordinary repeat if one exists.
    const attempts = Object.keys(schedule.overrides ?? {}).length + (schedule.excludedDates?.length ?? 0) + 1;
    const interval = Math.max(1, schedule.intervalWeeks ?? 1);
    const phase = Math.round((first.getTime() - start.getTime()) / (7 * 86400000));
    const offset = (interval - phase % interval) % interval;
    for (let index = 0; index < attempts; index++) {
      const candidate = new Date(first);
      candidate.setDate(first.getDate() + (offset + index * interval) * 7);
      if (schedule.endDate && dateKey(candidate) > schedule.endDate) break;
      add(candidate);
    }
  }
  for (const [source, override] of Object.entries(schedule.overrides ?? {})) {
    add(parseDateKey(override.moveToDate ?? source));
  }
  return [...variants.values()];
}

export const formatWeekRange = (start: Date, locale?: string): string => {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
};
