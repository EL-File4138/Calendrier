// Shared types from the main application
export type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type TimeFormat = '12h' | '24h';
export type WeekStart = 'Monday' | 'Sunday';

export interface Session {
  id: string;
  meetDay: Weekday;
  startTime: string; // Format: "HH:mm"
  endTime: string;   // Format: "HH:mm"
  sessionType?: string;
  instructor?: string;
  location?: string;
}

export interface Course {
  id: string;
  title: string;
  color: string;
  sessions: Session[];
}

export interface Settings {
  timeFormat: TimeFormat;
  weekStart: WeekStart;
}

export interface CalendarData {
  title?: string;
  courses: Course[];
  settings?: Settings;
}

// New types for multi-user system

export interface User {
  id: string;              // UUID generated on client
  createdAt: number;       // Timestamp
  displayName?: string;    // Optional display name
}

export interface ActivationToken {
  token: string;           // The activation token itself
  createdAt: number;       // When it was created
  expiresAt?: number;      // Optional expiration timestamp
  maxUses?: number;        // Optional max usage count
  usedCount: number;       // How many times it's been used
  createdBy?: string;      // Optional: who created it
}

export type PrivilegeLevel = 'owner' | 'write' | 'read';

export interface Privilege {
  userId: string;
  level: PrivilegeLevel;
  grantedAt: number;
  grantedBy: string;       // userId who granted this privilege
}

export interface CalendarDocument {
  id: string;              // Document ID
  data: CalendarData;      // The actual calendar data
  privileges: Privilege[]; // Access control list
  createdAt: number;
  updatedAt: number;
  version: number;         // For optimistic locking
}

// API Request/Response types

export interface CreateUserRequest {
  displayName?: string;
}

export interface CreateUserResponse {
  userId: string;
  createdAt: number;
}

export interface RegisterUserRequest {
  userId: string;
  activationToken: string;
}

export interface RegisterUserResponse {
  success: boolean;
  message?: string;
}

export interface CreateCalendarRequest {
  userId: string;
  data: CalendarData;
}

export interface CreateCalendarResponse {
  calendarId: string;
  createdAt: number;
}

export interface ReadCalendarRequest {
  calendarId: string;
  userId?: string;         // Optional for authenticated users
}

export interface ReadCalendarResponse {
  data: CalendarData;
  version: number;
  hasWriteAccess: boolean;
  updatedAt: number;
}

export interface WriteCalendarRequest {
  calendarId: string;
  userId: string;
  data: CalendarData;
  version: number;          // For optimistic locking
}

export interface WriteCalendarResponse {
  success: boolean;
  version: number;
  updatedAt: number;
  message?: string;
}

export interface GrantPrivilegeRequest {
  calendarId: string;
  granterId: string;        // User granting the privilege
  targetUserId: string;     // User receiving the privilege
  level: PrivilegeLevel;
}

export interface GrantPrivilegeResponse {
  success: boolean;
  message?: string;
  ownershipTransferred?: boolean;  // True if ownership was transferred
  newOwnerId?: string;             // ID of new owner if transferred
  shouldDestroy?: boolean;         // True if calendar should be destroyed
}

export interface ListCalendarsRequest {
  userId: string;
}

export interface ListCalendarsResponse {
  calendars: Array<{
    id: string;
    title: string;
    privilegeLevel: PrivilegeLevel;
    updatedAt: number;
  }>;
}

// WebSocket message types for real-time collaboration

export type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'update'
  | 'cursor'
  | 'presence';

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
  data: CalendarData;
}

export interface WSPresenceMessage extends WSMessage {
  type: 'presence';
  calendarId: string;
  userId: string;
  displayName?: string;
  action: 'join' | 'leave';
}

// Environment bindings for Cloudflare Worker

export interface Env {
  // Durable Object namespace
  CALENDAR_DO: DurableObjectNamespace;

  // KV namespace for caching
  CALENDAR_CACHE: KVNamespace;

  // KV namespace for activation tokens
  ACTIVATION_TOKENS: KVNamespace;

  // KV namespace for user data
  USERS: KVNamespace;

  // Master token for admin API authentication
  ADMIN_MASTER_TOKEN: string;
}
