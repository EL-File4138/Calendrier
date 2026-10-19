import { calendarLinkTarget } from './remoteCalendar';

const KEY = 'calendrier-calendar-history-v1';
const LIMIT = 10;
export interface CalendarHistoryEntry {
  target: string;
  title: string;
  visitedAt: number;
}

export function readCalendarHistory(appUrl: string): CalendarHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 32768) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    const seen = new Set<string>();
    return entries.filter((entry): entry is CalendarHistoryEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const { target, title, visitedAt } = entry;
      if (typeof target !== 'string' || typeof title !== 'string' || title.length > 200 ||
        !Number.isFinite(visitedAt) || visitedAt < 0 || seen.has(target)) return false;
      if (calendarLinkTarget(new URL(target, appUrl).href, appUrl) !== target) return false;
      seen.add(target);
      return true;
    }).slice(0, LIMIT);
  } catch { return []; }
}

export function rememberCalendar(input: string, appUrl: string, title = ''): void {
  const target = calendarLinkTarget(input, appUrl);
  if (!target) return;
  const entries = readCalendarHistory(appUrl).filter(entry => entry.target !== target);
  entries.unshift({ target, title: title.slice(0, 200), visitedAt: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT))); }
  catch { /* History is optional; unavailable storage must not prevent navigation. */ }
}

export function removeCalendarHistory(target?: string, appUrl?: string): void {
  try {
    if (target && appUrl) localStorage.setItem(KEY, JSON.stringify(readCalendarHistory(appUrl).filter(entry => entry.target !== target)));
    else localStorage.removeItem(KEY);
  } catch { /* Browsing remains available when storage is blocked. */ }
}
