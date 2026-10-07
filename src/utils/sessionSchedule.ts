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
  if (!startKey && (schedule.mode !== 'weekly' || (schedule.intervalWeeks ?? 1) !== 1)) return null;
  const overrideEntries = Object.entries(schedule.overrides ?? {});
  const movedSource = overrideEntries.find(([source, value]) => value.moveToDate === targetKey && !value.cancelled && !schedule.excludedDates?.includes(source))?.[0];
  const sourceKey = movedSource ?? targetKey;
  const sourceDate = parseDateKey(sourceKey);
  const start = startKey ? parseDateKey(startKey) : sourceDate;
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
  const variants = new Map<string, Session>();
  const addVariant = (resolved: Session) => {
    const key = JSON.stringify([resolved.meetDay, resolved.startTime, resolved.endTime, resolved.location, resolved.instructor]);
    variants.set(key, { ...session, meetDay: resolved.meetDay, startTime: resolved.startTime, endTime: resolved.endTime, location: resolved.location, instructor: resolved.instructor });
  };
  const add = (date: Date) => {
    const resolved = resolveSessionForDate(session, date);
    if (!resolved) return;
    addVariant(resolved);
  };
  if (!schedule.startDate) {
    if (schedule.mode !== 'weekly' || (schedule.intervalWeeks ?? 1) !== 1) return [];
    // Finite exceptions cannot remove every unbounded weekly occurrence.
    addVariant(session);
    for (const [source, override] of Object.entries(schedule.overrides ?? {})) {
      add(parseDateKey(override.moveToDate ?? source));
    }
    return [...variants.values()];
  }
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

export function skipSessionOccurrence(session: Session, sourceDate: string): Session {
  const schedule = session.schedule ?? { mode: 'weekly' as const };
  return {
    ...session,
    schedule: { ...schedule, excludedDates: [...new Set([...(schedule.excludedDates ?? []), sourceDate])] },
  };
}

export function moveSessionOccurrence(session: Session, occurrence: ResolvedSession, targetDate: string, startTime: string): Session {
  const start = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  const target = parseDateKey(targetDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || dateKey(target) !== targetDate || !start) throw new Error('invalidMove');
  const minutes = Number(start[1]) * 60 + Number(start[2]);
  const duration = timeMinutes(occurrence.endTime) - timeMinutes(occurrence.startTime);
  if (duration <= 0 || minutes + duration >= 1440) throw new Error('invalidMove');
  const existing = resolveSessionForDate(session, target);
  if (existing && existing.sourceDate !== occurrence.sourceDate) throw new Error('moveConflict');
  const schedule = session.schedule ?? { mode: 'weekly' as const };
  return {
    ...session,
    schedule: {
      ...schedule,
      overrides: {
        ...schedule.overrides,
        [occurrence.sourceDate]: {
          ...schedule.overrides?.[occurrence.sourceDate],
          moveToDate: targetDate,
          startTime,
          endTime: `${String(Math.floor((minutes + duration) / 60)).padStart(2, '0')}:${String((minutes + duration) % 60).padStart(2, '0')}`,
        },
      },
    },
  };
}

const timeMinutes = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const formatWeekRange = (start: Date, locale?: string): string => {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
};
