import type {
  CalendarData,
  CreateCalendarResponse,
  ReadCalendarResponse,
  WriteCalendarResponse,
  GrantPrivilegeResponse,
  Privilege,
  CreateUserResponse,
} from './types';

// Configure your Worker URL here
export const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as unknown;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if (typeof record.message === 'string') return record.message;
      if (typeof record.error === 'string') return record.error;
    }
  } catch {
    // Fall back to HTTP status information when the server returns a non-JSON body.
  }
  return `${fallback}: ${response.statusText || response.status}`;
}

export class CalendarAPI {
  private workerUrl: string;

  constructor(workerUrl: string = WORKER_URL) {
    // Remove trailing slash to avoid double slashes in API URLs
    this.workerUrl = workerUrl.replace(/\/$/, '');
  }

  /**
   * Create a new user with activation token (registered immediately)
   */
  async createUser(activationToken: string, displayName?: string): Promise<CreateUserResponse> {
    const response = await fetch(`${this.workerUrl}/api/user/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activationToken, displayName }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to create user'));
    }

    return response.json();
  }

  async logout(userId: string, sessionToken: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.workerUrl}/api/user/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to log out'));
    }

    return response.json();
  }

  async managePublicLink(calendarId: string, requesterId: string, sessionToken: string, action: 'status' | 'create' | 'revoke' | 'purge'): Promise<{ token: string | null; publicId: string | null }> {
    const response = await fetch(`${this.workerUrl}/api/public/manage`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ calendarId, requesterId, action }),
    });
    if (!response.ok) throw new Error(await responseErrorMessage(response, 'Failed to manage public link'));
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('token' in result) || !('publicId' in result) || (result.token !== null && (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token))) || (result.publicId !== null && (typeof result.publicId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.publicId)))) {
      throw new Error('Invalid public link response');
    }
    return { token: result.token, publicId: result.publicId };
  }

  async readPublicCalendar(publicId: string, token: string, signal?: AbortSignal): Promise<ReadCalendarResponse> {
    const response = await fetch(`${this.workerUrl}/api/public/read`, {
      method: 'POST', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, token }),
    });
    if (!response.ok) throw new Error('Public link unavailable');
    const result = await response.json() as ReadCalendarResponse;
    if (!result || !result.data || !Array.isArray(result.data.courses) || typeof result.version !== 'number' || typeof result.updatedAt !== 'number') {
      throw new Error('Invalid public calendar response');
    }
    return result;
  }

  /**
   * Create a new calendar
   */
  async createCalendar(userId: string, sessionToken: string, data: CalendarData): Promise<CreateCalendarResponse> {
    const response = await fetch(`${this.workerUrl}/api/calendar/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ userId, data }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to create calendar'));
    }

    return response.json();
  }

  /**
   * Read a calendar with a valid user session.
   */
  async readCalendar(calendarId: string, userId?: string, sessionToken?: string): Promise<ReadCalendarResponse> {
    const params = new URLSearchParams({ calendarId });
    if (userId) {
      params.append('userId', userId);
    }

    const response = await fetch(`${this.workerUrl}/api/calendar/read?${params.toString()}`, {
      method: 'GET',
      headers: sessionToken
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` }
        : { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to read calendar'));
    }

    return response.json();
  }

  /**
   * Write to a calendar
   */
  async writeCalendar(
    calendarId: string,
    userId: string,
    sessionToken: string,
    data: CalendarData,
    version: number
  ): Promise<WriteCalendarResponse> {
    const response = await fetch(`${this.workerUrl}/api/calendar/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ calendarId, userId, data, version }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to write calendar'));
    }

    return response.json();
  }

  /**
   * Grant privilege to another user
   */
  async grantPrivilege(
    calendarId: string,
    granterId: string,
    sessionToken: string,
    targetUserId: string,
    level: 'owner' | 'write' | 'read'
  ): Promise<GrantPrivilegeResponse> {
    const response = await fetch(`${this.workerUrl}/api/privilege/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ calendarId, granterId, targetUserId, level }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to grant privilege'));
    }

    return response.json();
  }

  /**
   * Revoke privilege from a user
   */
  async revokePrivilege(
    calendarId: string,
    granterId: string,
    sessionToken: string,
    targetUserId: string
  ): Promise<GrantPrivilegeResponse> {
    const response = await fetch(`${this.workerUrl}/api/privilege/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ calendarId, granterId, targetUserId }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to revoke privilege'));
    }

    return response.json();
  }

  /**
   * List users with access to a calendar
   */
  async listPrivileges(
    calendarId: string,
    requesterId: string,
    sessionToken: string
  ): Promise<{ success: boolean; privileges?: Privilege[]; message?: string }> {
    const response = await fetch(`${this.workerUrl}/api/privilege/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ calendarId, requesterId }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to list privileges'));
    }

    return response.json();
  }

  /**
   * Delete a calendar completely
   * - Only owners can delete
   * - Removes calendar from all users' lists
   * - Deletes DO storage and KV cache
   */
  async deleteCalendar(
    calendarId: string,
    requesterId: string,
    sessionToken: string
  ): Promise<{ success: boolean; message?: string }> {
    const response = await fetch(`${this.workerUrl}/api/calendar/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ calendarId, requesterId }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, 'Failed to delete calendar'));
    }

    return response.json();
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(calendarId: string, userId: string, sessionToken: string): WebSocket {
    const wsUrl = this.workerUrl.replace(/^http/, 'ws');
    const params = new URLSearchParams({ userId });
    const ws = new WebSocket(
      `${wsUrl}/api/calendar/${calendarId}/ws?${params.toString()}`,
      `calendrier-session.${sessionToken}`
    );
    return ws;
  }
}

// Singleton instance
export const calendarAPI = new CalendarAPI();
