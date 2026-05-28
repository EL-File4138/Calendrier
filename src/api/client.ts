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
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

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
      const error = await response.json();
      throw new Error(error.message || `Failed to create user: ${response.statusText}`);
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
      throw new Error(`Failed to log out: ${response.statusText}`);
    }

    return response.json();
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
      throw new Error(`Failed to create calendar: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Read a calendar (authenticated or anonymous)
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
      throw new Error(`Failed to read calendar: ${response.statusText}`);
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
      throw new Error(`Failed to write calendar: ${response.statusText}`);
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
      throw new Error(`Failed to grant privilege: ${response.statusText}`);
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
      throw new Error(`Failed to revoke privilege: ${response.statusText}`);
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
      throw new Error(`Failed to list privileges: ${response.statusText}`);
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
      throw new Error(`Failed to delete calendar: ${response.statusText}`);
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
