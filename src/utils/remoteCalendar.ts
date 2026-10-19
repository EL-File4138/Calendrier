import type { ReadCalendarResponse } from '../api/types';
import { parsePublicLink } from './publicLink';

export class RemoteCalendarError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const isRemoteUnavailable = (error: unknown): boolean =>
  error instanceof TypeError || (error instanceof RemoteCalendarError && error.status >= 500);

export function calendarLinkTarget(input: string, appUrl: string): string | null {
  try {
    const url = new URL(input.trim());
    const app = new URL(appUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== app.origin ||
      url.username || url.password || url.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') !== app.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '')) return null;
    if (parsePublicLink(url.hash)) return `${app.pathname}${url.hash}`;
    const id = url.searchParams.get('calendar');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '') || url.hash) return null;
    return `${app.pathname}?calendar=${id}`;
  } catch { return null; }
}

type CacheKind = 'private' | 'public';
const cacheKey = (kind: CacheKind) => `calendrier-remote-${kind}-v1`;

// A digest scopes the snapshot to server, calendar and credentials without persisting another bearer token.
export async function remoteCacheIdentity(parts: string[]): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readRemoteCache(kind: CacheKind, identity: string): ReadCalendarResponse | null {
  try {
    const raw = localStorage.getItem(cacheKey(kind));
    if (!raw || raw.length > 2 * 1024 * 1024) return null;
    const value = JSON.parse(raw);
    const snapshot = value.snapshot;
    if (value.identity !== identity || !snapshot || !Number.isFinite(snapshot.version) ||
      !Number.isFinite(snapshot.updatedAt) || !snapshot.data || !Array.isArray(snapshot.data.courses)) return null;
    return { ...snapshot, hasWriteAccess: false };
  } catch { return null; }
}

export function writeRemoteCache(kind: CacheKind, identity: string, snapshot: ReadCalendarResponse): void {
  try {
    localStorage.setItem(cacheKey(kind), JSON.stringify({ identity, snapshot: { ...snapshot, hasWriteAccess: false } }));
  } catch { /* Cache failure must not prevent live viewing or overwrite the local calendar. */ }
}

export function clearRemoteCache(kind: CacheKind): void {
  try { localStorage.removeItem(cacheKey(kind)); } catch { /* Storage may be unavailable. */ }
}
