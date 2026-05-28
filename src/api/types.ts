// Re-export types from Course.ts
export type { Weekday, TimeFormat, WeekStart, Session, Course, Settings, CalendarData } from '../types/Course';

// Privilege types
export type PrivilegeLevel = 'owner' | 'write' | 'read';

export interface Privilege {
  userId: string;
  level: PrivilegeLevel;
  grantedAt: number;
  grantedBy: string;
}

// API Response types
export interface CreateUserResponse {
  success: boolean;
  userId: string;
  createdAt: number;
  sessionToken: string;
  message?: string;
}

export interface RegisterUserResponse {
  success: boolean;
  message?: string;
}

export interface CreateCalendarResponse {
  calendarId: string;
  createdAt: number;
}

export interface ReadCalendarResponse {
  data: import('../types/Course').CalendarData;
  version: number;
  hasWriteAccess: boolean;
  updatedAt: number;
}

export interface WriteCalendarResponse {
  success: boolean;
  version: number;
  updatedAt: number;
  message?: string;
}

export interface GrantPrivilegeResponse {
  success: boolean;
  message?: string;
  ownershipTransferred?: boolean;
  newOwnerId?: string;
  shouldDestroy?: boolean;
}

export interface ListCalendarsResponse {
  calendars: Array<{
    id: string;
    title: string;
    privilegeLevel: 'owner' | 'write' | 'read';
    updatedAt: number;
  }>;
}

// WebSocket message types
export type WSMessageType = 'subscribe' | 'unsubscribe' | 'update' | 'cursor' | 'presence';

export interface WSMessage {
  type: WSMessageType;
  calendarId?: string;
  userId?: string;
  data?: unknown;
  timestamp: number;
}

export interface WSUpdateMessage extends WSMessage {
  type: 'update';
  calendarId: string;
  version: number;
  data: import('../types/Course').CalendarData;
}

export interface WSPresenceMessage extends WSMessage {
  type: 'presence';
  calendarId: string;
  userId: string;
  displayName?: string;
  action: 'join' | 'leave';
}
