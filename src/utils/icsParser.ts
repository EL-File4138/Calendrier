import { getNextColor } from './colors';
import i18n from '../i18n/config';
import type { CalendarData, Course, Weekday } from '../types/Course';
import { DEFAULT_EVENT_TYPE_ICONS } from './eventIcons';

interface IcsDateValue {
  date: Date;
  allDay: boolean;
  timezone?: string;
}

interface IcsEvent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: IcsDateValue;
  end?: IcsDateValue;
  durationMinutes?: number;
  rrule?: string;
  excludedDates?: string[];
}

export interface IcsCalendar {
  events: IcsEvent[];
  timezone?: string;
}

const WEEKDAYS: Weekday[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SESSION_TYPES: Array<[RegExp, string]> = [
  [/\b(?:lecture|wyk(?:ład)?|w)\b/i, 'Lecture'],
  [/\b(?:lab(?:oratory)?|laboratorium|l)\b/i, 'Laboratory'],
  [/\b(?:exercise|ćw(?:iczenia)?|cw)\b/i, 'Exercise'],
  [/\b(?:seminar|sem)\b/i, 'Seminar'],
  [/\b(?:project|projekt|proj)\b/i, 'Project'],
  [/\b(?:tutorial|ćwiczenia)\b/i, 'Tutorial'],
];

/** Parse the VEVENT subset used by university timetable feeds. */
export function parseICS(input: string): IcsCalendar {
  const lines = unfoldLines(input);
  const events: IcsEvent[] = [];
  let timezone: string | undefined;
  let current: Partial<IcsEvent> | undefined;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start) events.push(current as IcsEvent);
      current = undefined;
      continue;
    }
    if (line.startsWith('X-WR-TIMEZONE:')) {
      timezone = unescapeIcs(line.slice(line.indexOf(':') + 1));
      continue;
    }
    if (!current) continue;

    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const property = line.slice(0, separator);
    const value = unescapeIcs(line.slice(separator + 1));
    const [name, ...parameters] = property.split(';');
    const params = new Map(parameters.map((part) => {
      const [key, paramValue = ''] = part.split('=');
      return [key.toUpperCase(), paramValue.replace(/^"|"$/g, '')];
    }));

    switch (name.toUpperCase()) {
      case 'UID': current.uid = value; break;
      case 'SUMMARY': current.summary = value; break;
      case 'DESCRIPTION': current.description = value; break;
      case 'LOCATION': current.location = value; break;
      case 'RRULE': current.rrule = value; break;
      case 'EXDATE': current.excludedDates = [...(current.excludedDates ?? []), dateKeyInTimezone(parseDateValue(value, params.get('VALUE'), params.get('TZID')).date, params.get('TZID'))]; break;
      case 'DTSTART': current.start = parseDateValue(value, params.get('VALUE'), params.get('TZID')); break;
      case 'DTEND': current.end = parseDateValue(value, params.get('VALUE'), params.get('TZID')); break;
      case 'DURATION':
        current.durationMinutes = parseDurationMinutes(value);
        break;
    }
  }
  return { events, timezone };
}

export function mapICSToCalendarData(calendar: IcsCalendar): CalendarData {
  type Occurrence = { title: string; type?: string; location?: string; instructor?: string; date: string; start: ReturnType<typeof zonedParts>; end: ReturnType<typeof zonedParts> };
  const grouped = new Map<string, Occurrence[]>();
  for (const event of calendar.events) {
    if (event.start.allDay) continue;
    const instructor = extractInstructor(event.description ?? '');
    const { title, type } = extractCourse(event.summary ?? i18n.t('calendar.untitledCourse'));
    const location = event.location?.trim() || extractAts4Location(event.summary ?? '');
    const timezone = event.start.timezone === 'UTC' ? calendar.timezone : event.start.timezone ?? calendar.timezone;
    const endTimezone = event.end?.timezone === 'UTC' ? calendar.timezone : event.end?.timezone ?? calendar.timezone;
    const endDate = event.end?.date ?? new Date(event.start.date.getTime() + (event.durationMinutes ?? 60) * 60000);
    const occurrence = { title, type, location, instructor, date: dateKeyInTimezone(event.start.date, timezone), start: zonedParts(event.start.date, timezone), end: zonedParts(endDate, endTimezone) };
    // Explicit occurrences on different weekdays or time slots are separate series,
    // not overrides of a recurrence that never occurs on their source date.
    const key = JSON.stringify([title.toLocaleLowerCase(), type ?? '', location ?? '', instructor ?? '', occurrence.start.weekday, occurrence.start.time, occurrence.end.time]);
    grouped.set(key, [...(grouped.get(key) ?? []), occurrence]);
  }
  const courses = new Map<string, Course>();
  for (const [key, occurrences] of grouped) {
    occurrences.sort((a, b) => a.date.localeCompare(b.date));
    const first = occurrences[0]; const last = occurrences[occurrences.length - 1];
    const knownDates = new Set(occurrences.map((item) => item.date)); const excludedDates: string[] = [];
    for (let date = parseDateKey(first.date); date <= parseDateKey(last.date); date = addDays(date, 1)) {
      const dateString = dateKeyInTimezone(date);
      if (WEEKDAYS[date.getDay()] === WEEKDAYS[first.start.weekday] && !knownDates.has(dateString)) excludedDates.push(dateString);
    }
    const overrides: Record<string, { startTime?: string; endTime?: string; location?: string; instructor?: string }> = {};
    for (const occurrence of occurrences.slice(1)) {
      const override: typeof overrides[string] = {};
      if (occurrence.start.time !== first.start.time) override.startTime = occurrence.start.time;
      if (occurrence.end.time !== first.end.time) override.endTime = occurrence.end.time;
      if (occurrence.location !== first.location) override.location = occurrence.location;
      if (occurrence.instructor !== first.instructor) override.instructor = occurrence.instructor;
      if (Object.keys(override).length) overrides[occurrence.date] = override;
    }
    const courseKey = first.title.toLocaleLowerCase();
    const course = courses.get(courseKey) ?? { id: stableId(courseKey), title: first.title, color: getNextColor([...courses.values()].map((course) => course.color)), sessions: [] };
      const typeKey = first.type?.toLocaleLowerCase();
      course.sessions.push({ id: stableId(`${key}|${first.date}`), meetDay: WEEKDAYS[first.start.weekday], startTime: first.start.time, endTime: first.end.time, sessionType: first.type, icon: typeKey ? DEFAULT_EVENT_TYPE_ICONS[typeKey] : undefined, location: first.location, instructor: first.instructor, schedule: { mode: 'bounded', startDate: first.date, endDate: last.date, intervalWeeks: 1, excludedDates, overrides } });
    courses.set(courseKey, course);
  }
  return { title: i18n.t('calendar.importedTitle'), courses: [...courses.values()], settings: { timeFormat: '24h', weekStart: 'Monday' } };
}

function addDays(date: Date, days: number): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }
function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function extractAts4Location(summary: string): string | undefined {
  const match = summary.match(/\s([A-Za-z]{1,4}\d{1,4}[A-Za-z]?(?:\s+[A-Za-z]{1,4}\d{1,4}[A-Za-z]?)*|Aula\s+[A-Za-z0-9 -]+)$/i);
  return match?.[1]?.trim();
}

function dateKeyInTimezone(date: Date, timezone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function unfoldLines(input: string): string[] { return input.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n').map((line) => line.trimEnd()); }
function unescapeIcs(value: string): string { return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }

function parseDateValue(value: string, valueType?: string, timezone?: string): IcsDateValue {
  const allDay = valueType?.toUpperCase() === 'DATE' || /^\d{8}$/.test(value);
  if (allDay) return { date: new Date(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)), 0, 0, 0), allDay: true, timezone };
  const utc = value.endsWith('Z');
  const raw = value.replace(/Z$/, '');
  const parts = {
    year: Number(raw.slice(0, 4)), month: Number(raw.slice(4, 6)) - 1, day: Number(raw.slice(6, 8)),
    hour: Number(raw.slice(9, 11)), minute: Number(raw.slice(11, 13)), second: Number(raw.slice(13, 15)),
  };
  const date = utc ? new Date(Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second))
    : timezone ? zonedDateToInstant(parts, timezone) : new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
  return { date, allDay: false, timezone: utc ? 'UTC' : timezone };
}

function zonedDateToInstant(parts: { year: number; month: number; day: number; hour: number; minute: number; second: number }, timezone: string): Date {
  const target = Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
  const probe = new Date(target);
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(probe);
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
  const displayed = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return new Date(target - (displayed - target));
}

function parseDurationMinutes(value: string): number | undefined {
  const match = value.match(/^P(?:0D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return undefined;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) + Number(match[3] ?? 0) / 60;
  return minutes > 0 ? minutes : undefined;
}

function zonedParts(date: Date, timezone?: string): { weekday: number; time: string; minutes: number } {
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone || undefined, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value ?? 'Sun');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return { weekday, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, minutes: hour * 60 + minute };
}

function extractCourse(summary: string): { title: string; type?: string } {
  for (const [pattern, type] of SESSION_TYPES) {
    const match = summary.match(pattern);
    if (match?.index !== undefined) return { title: summary.slice(0, match.index).replace(/[-,:|]+$/, '').trim() || summary.trim(), type };
  }
  return { title: summary.trim() || i18n.t('calendar.untitledCourse') };
}
function extractInstructor(description: string): string | undefined { return description.match(/(?:instructor|teacher|prowadzący)\s*:\s*([^\n]+)/i)?.[1]?.trim(); }
function stableId(value: string): string { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(36); }
