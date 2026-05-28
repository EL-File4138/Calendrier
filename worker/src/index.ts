import { CalendarDO } from './CalendarDO';
import { ActivationTokenDO } from './ActivationTokenDO';
import {
  Env,
  CreateCalendarRequest,
  CreateCalendarResponse,
  ReadCalendarResponse,
  WriteCalendarRequest,
  GrantPrivilegeRequest,
  GrantPrivilegeResponse,
  User,
  ActivationToken,
  Privilege,
  PrivilegeLevel,
} from './types';

interface RevokePrivilegeRequest {
  calendarId: string;
  granterId: string;
  targetUserId: string;
}

interface ListPrivilegesRequest {
  calendarId: string;
  requesterId: string;
}

interface DeleteCalendarRequest {
  calendarId: string;
  requesterId: string;
}

interface ListPrivilegesResponse {
  success: boolean;
  privileges?: Privilege[];
  message?: string;
}

interface DeleteCalendarResponse {
  success: boolean;
  message?: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_CALENDAR_DATA_BYTES = 256 * 1024;
const VALID_PRIVILEGE_LEVELS: PrivilegeLevel[] = ['read', 'write', 'owner'];

export { CalendarDO, ActivationTokenDO };

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

/**
 * Verify admin master token authentication
 * Uses constant-time comparison to prevent timing attacks
 */
function verifyAdminToken(request: Request, env: Env): boolean {
  // Ensure ADMIN_MASTER_TOKEN is configured
  if (!env.ADMIN_MASTER_TOKEN || env.ADMIN_MASTER_TOKEN.length < 32) {
    console.error('ADMIN_MASTER_TOKEN is not properly configured (must be at least 32 characters)');
    return false;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  // Support both "Bearer <token>" and plain token
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // Use constant-time comparison to prevent timing attacks
  return constantTimeCompare(token, env.ADMIN_MASTER_TOKEN);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): value is Record<string, string> {
  return typeof value[key] === 'string' && value[key].trim().length > 0;
}

function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  return token || null;
}

async function verifyUserSession(request: Request, env: Env, userId: string): Promise<Response | null> {
  const isRegistered = await env.USERS.get(`registered:${userId}`);
  if (!isRegistered) {
    return Response.json({ error: 'User must be registered' }, { status: 401 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return Response.json({ error: 'Missing session token' }, { status: 401 });
  }

  const expectedHash = await env.USERS.get(`session:${userId}`);
  const tokenHash = await sha256Hex(token);
  if (!expectedHash || !constantTimeCompare(tokenHash, expectedHash)) {
    return Response.json({ error: 'Invalid session token' }, { status: 401 });
  }

  await env.USERS.put(`session:${userId}`, expectedHash, { expirationTtl: SESSION_TTL_SECONDS });

  return null;
}

function getWebSocketToken(request: Request): string | null {
  const protocolHeader = request.headers.get('Sec-WebSocket-Protocol');
  const protocol = protocolHeader?.split(',').map(value => value.trim()).find(value => value.startsWith('calendrier-session.'));
  return protocol?.substring('calendrier-session.'.length) || null;
}

function isValidPrivilegeLevel(value: string): value is PrivilegeLevel {
  return VALID_PRIVILEGE_LEVELS.includes(value as PrivilegeLevel);
}

function isCalendarDataSizeValid(data: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(data)).length <= MAX_CALENDAR_DATA_BYTES;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const value = await request.json();
    if (!isObject(value)) {
      return Response.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }
    return value;
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
}

/**
 * Main Worker - handles authentication and routes requests to Durable Objects
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response: Response;

      // Authentication endpoints
      if (path === '/api/user/create') {
        response = await handleCreateUser(request, env);
      } else if (path === '/api/user/logout') {
        response = await handleLogout(request, env);
      }
      // Calendar management endpoints
      else if (path === '/api/calendar/create') {
        response = await handleCreateCalendar(request, env);
      } else if (path === '/api/calendar/read') {
        response = await handleReadCalendar(request, env);
      } else if (path === '/api/calendar/write') {
        response = await handleWriteCalendar(request, env);
      }
      // Privilege management endpoints
      else if (path === '/api/privilege/grant') {
        response = await handleGrantPrivilege(request, env);
      } else if (path === '/api/privilege/revoke') {
        response = await handleRevokePrivilege(request, env);
      } else if (path === '/api/privilege/list') {
        response = await handleListPrivileges(request, env);
      }
      // Calendar deletion endpoint
      else if (path === '/api/calendar/delete') {
        response = await handleDeleteCalendar(request, env);
      }
      // WebSocket endpoint - return directly without CORS wrapping
      else if (path.startsWith('/api/calendar/') && path.endsWith('/ws')) {
        return await handleWebSocket(request, env);
      }
      // Admin endpoint for creating activation tokens
      else if (path === '/api/admin/token/create') {
        response = await handleCreateActivationToken(request, env);
      } else if (path === '/api/admin/token/revoke') {
        response = await handleRevokeActivationToken(request, env);
      } else {
        response = new Response('Not found', { status: 404 });
      }

      // Add CORS headers to response
      // Create a new response with CORS headers (can't modify immutable headers)
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...corsHeaders,
        },
      });

      return newResponse;
    } catch (error: unknown) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};

/**
 * Create a new user with activation token (registered immediately)
 */
async function handleCreateUser(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'activationToken')) {
    return Response.json({ success: false, message: 'Missing activation token' }, { status: 400 });
  }
  const body = parsed as { displayName?: string; activationToken: string };

  const tokenId = env.ACTIVATION_TOKEN_DO.idFromName(body.activationToken);
  const tokenStub = env.ACTIVATION_TOKEN_DO.get(tokenId);
  const consumeResponse = await tokenStub.fetch('https://token/consume', {
    method: 'POST',
    body: JSON.stringify({ token: body.activationToken }),
  });
  if (!consumeResponse.ok) {
    return consumeResponse;
  }

  // Create user
  const userId = crypto.randomUUID();
  const now = Date.now();

  const user: User = {
    id: userId,
    createdAt: now,
    displayName: body.displayName,
  };

  // Store user and mark as registered
  await env.USERS.put(`user:${userId}`, JSON.stringify(user));
  await env.USERS.put(`registered:${userId}`, 'true');
  const sessionToken = generateSessionToken();
  await env.USERS.put(`session:${userId}`, await sha256Hex(sessionToken), { expirationTtl: SESSION_TTL_SECONDS });

  return Response.json({
    success: true,
    userId,
    createdAt: now,
    sessionToken,
    message: 'User created and registered successfully',
  });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'userId')) {
    return Response.json({ error: 'Missing userId' }, { status: 400 });
  }

  const authError = await verifyUserSession(request, env, parsed.userId);
  if (authError) return authError;
  await env.USERS.delete(`session:${parsed.userId}`);
  return Response.json({ success: true });
}

/**
 * Create a new calendar
 */
async function handleCreateCalendar(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'userId') || !isObject(parsed.data) || !isCalendarDataSizeValid(parsed.data)) {
    return Response.json({ error: 'Missing or invalid calendar create request' }, { status: 400 });
  }
  const body = parsed as unknown as CreateCalendarRequest;

  const authError = await verifyUserSession(request, env, body.userId);
  if (authError) return authError;

  const calendarId = crypto.randomUUID();
  const now = Date.now();

  // Get Durable Object instance
  const id = env.CALENDAR_DO.idFromName(calendarId);
  const stub = env.CALENDAR_DO.get(id);

  // Initialize the calendar
  await stub.fetch('https://do/initialize', {
    method: 'POST',
    body: JSON.stringify({
      calendarId,
      ownerId: body.userId,
      data: body.data,
    }),
  });

  // Store calendar reference for the user
  const userCalendarsKey = `user-calendars:${body.userId}`;
  const existingCalendars = await env.USERS.get(userCalendarsKey);
  const calendars = existingCalendars ? JSON.parse(existingCalendars) : [];
  calendars.push({
    id: calendarId,
    title: body.data.title || 'Untitled Calendar',
    privilegeLevel: 'owner',
    createdAt: now,
  });
  await env.USERS.put(userCalendarsKey, JSON.stringify(calendars));

  const response: CreateCalendarResponse = {
    calendarId,
    createdAt: now,
  };

  return Response.json(response);
}

/**
 * Read a calendar (authenticated or anonymous)
 */
async function handleReadCalendar(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const calendarId = url.searchParams.get('calendarId');
  const userId = url.searchParams.get('userId');

  if (!calendarId) {
    return Response.json({ error: 'Missing calendarId parameter' }, { status: 400 });
  }

  // If user is authenticated, get from Durable Object (live data)
  if (userId) {
    const authError = await verifyUserSession(request, env, userId);
    if (authError) return authError;
    const id = env.CALENDAR_DO.idFromName(calendarId);
    const stub = env.CALENDAR_DO.get(id);

    const doResponse = await stub.fetch('https://do/read', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });

    return doResponse;
  }

  return Response.json({ error: 'Authentication required' }, { status: 401 });
}

/**
 * Write to a calendar (authenticated only)
 */
async function handleWriteCalendar(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'calendarId') || !hasString(parsed, 'userId') || !isObject(parsed.data) || !isCalendarDataSizeValid(parsed.data) || typeof parsed.version !== 'number') {
    return Response.json({ error: 'Missing or invalid calendar write request' }, { status: 400 });
  }
  const body = parsed as unknown as WriteCalendarRequest;

  const authError = await verifyUserSession(request, env, body.userId);
  if (authError) return authError;

  // Forward to Durable Object
  const id = env.CALENDAR_DO.idFromName(body.calendarId);
  const stub = env.CALENDAR_DO.get(id);

  const doResponse = await stub.fetch('https://do/write', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return doResponse;
}

/**
 * Grant privilege to another user
 */
async function handleGrantPrivilege(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'calendarId') || !hasString(parsed, 'granterId') || !hasString(parsed, 'targetUserId') || !hasString(parsed, 'level')) {
    return Response.json({ error: 'Missing or invalid privilege grant request' }, { status: 400 });
  }
  if (!isValidPrivilegeLevel(parsed.level)) {
    return Response.json({ error: 'Invalid privilege level' }, { status: 400 });
  }
  const body = parsed as unknown as GrantPrivilegeRequest;

  const authError = await verifyUserSession(request, env, body.granterId);
  if (authError) return authError;

  // Verify target user exists and is registered
  const targetRegistered = await env.USERS.get(`registered:${body.targetUserId}`);
  if (!targetRegistered) {
    return Response.json({ error: 'Target user not found or not registered' }, { status: 404 });
  }

  // Forward to Durable Object
  const id = env.CALENDAR_DO.idFromName(body.calendarId);
  const stub = env.CALENDAR_DO.get(id);

  const doResponse = await stub.fetch('https://do/grant', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Clone response before reading to avoid "disturbed stream" error
  const clonedResponse = doResponse.clone();

  // If successful, add or update calendar in target user's list
  if (doResponse.ok) {
    const result: GrantPrivilegeResponse = await doResponse.json();
    if (result.success) {
      const userCalendarsKey = `user-calendars:${body.targetUserId}`;
      const existingCalendars = await env.USERS.get(userCalendarsKey);
      const calendars = existingCalendars ? JSON.parse(existingCalendars) : [];

      // Check if calendar already in list
      const existingIndex = calendars.findIndex((c: { id: string }) => c.id === body.calendarId);

      if (existingIndex >= 0) {
        // Update existing entry with new privilege level
        calendars[existingIndex].privilegeLevel = body.level;
        calendars[existingIndex].updatedAt = Date.now();
        await env.USERS.put(userCalendarsKey, JSON.stringify(calendars));
      } else {
        // Add new entry
        // Get calendar title from DO
        const readResponse = await stub.fetch('https://do/read', {
          method: 'POST',
          body: JSON.stringify({ userId: body.targetUserId }),
        });
        const readData: ReadCalendarResponse = await readResponse.json();

        calendars.push({
          id: body.calendarId,
          title: readData.data.title || 'Untitled Calendar',
          privilegeLevel: body.level,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await env.USERS.put(userCalendarsKey, JSON.stringify(calendars));
      }
    }
  }

  return clonedResponse;
}

/**
 * Revoke privilege from a user
 */
async function handleRevokePrivilege(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'calendarId') || !hasString(parsed, 'granterId') || !hasString(parsed, 'targetUserId')) {
    return Response.json({ error: 'Missing or invalid privilege revoke request' }, { status: 400 });
  }
  const body = parsed as unknown as RevokePrivilegeRequest;

  const authError = await verifyUserSession(request, env, body.granterId);
  if (authError) return authError;

  // Forward to Durable Object
  const id = env.CALENDAR_DO.idFromName(body.calendarId);
  const stub = env.CALENDAR_DO.get(id);

  const doResponse = await stub.fetch('https://do/revoke', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Clone response before reading to avoid "disturbed stream" error
  const clonedResponse = doResponse.clone();

  // If successful, remove calendar from target user's list
  if (doResponse.ok) {
    const result: GrantPrivilegeResponse = await doResponse.json();
    if (result.success) {
      const userCalendarsKey = `user-calendars:${body.targetUserId}`;
      const existingCalendars = await env.USERS.get(userCalendarsKey);
      if (existingCalendars) {
        const calendars = JSON.parse(existingCalendars);
        const filtered = calendars.filter((c: { id: string }) => c.id !== body.calendarId);
        await env.USERS.put(userCalendarsKey, JSON.stringify(filtered));
      }
    }
  }

  return clonedResponse;
}

/**
 * List privileges for a calendar
 */
async function handleListPrivileges(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'calendarId') || !hasString(parsed, 'requesterId')) {
    return Response.json({ error: 'Missing or invalid privilege list request' }, { status: 400 });
  }
  const body = parsed as unknown as ListPrivilegesRequest;

  const authError = await verifyUserSession(request, env, body.requesterId);
  if (authError) return authError;

  // Forward to Durable Object
  const id = env.CALENDAR_DO.idFromName(body.calendarId);
  const stub = env.CALENDAR_DO.get(id);

  const doResponse = await stub.fetch('https://do/listPrivileges', {
    method: 'POST',
    body: JSON.stringify({ requesterId: body.requesterId }),
  });

  return doResponse;
}

/**
 * Handle WebSocket connection
 */
async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const calendarId = pathParts[pathParts.length - 2]; // /api/calendar/{id}/ws

  const userId = url.searchParams.get('userId');
  const token = getWebSocketToken(request);
  if (!userId) {
    return new Response('Missing userId', { status: 400 });
  }

  const expectedHash = await env.USERS.get(`session:${userId}`);
  if (!token || !expectedHash || !constantTimeCompare(await sha256Hex(token), expectedHash)) {
    return new Response('Invalid session token', { status: 401 });
  }

  // Forward to Durable Object
  const id = env.CALENDAR_DO.idFromName(calendarId);
  const stub = env.CALENDAR_DO.get(id);

  return stub.fetch(`https://do/ws?userId=${userId}`, {
    headers: request.headers,
  });
}

/**
 * Admin endpoint to create activation tokens
 * Protected with ADMIN_MASTER_TOKEN authentication
 */
async function handleCreateActivationToken(request: Request, env: Env): Promise<Response> {
  // Verify admin authentication
  if (!verifyAdminToken(request, env)) {
    console.warn('Unauthorized admin token creation attempt');
    return Response.json(
      { success: false, error: 'Unauthorized - Invalid admin token' },
      { status: 401 }
    );
  }

  let body: { expiresAt?: number; maxUses?: number; token?: string; createdBy?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  // Validate input
  if (body.expiresAt !== undefined && (typeof body.expiresAt !== 'number' || body.expiresAt <= Date.now())) {
    return Response.json(
      { success: false, error: 'expiresAt must be a future timestamp' },
      { status: 400 }
    );
  }

  if (body.maxUses !== undefined && (typeof body.maxUses !== 'number' || body.maxUses <= 0 || !Number.isInteger(body.maxUses))) {
    return Response.json(
      { success: false, error: 'maxUses must be a positive integer' },
      { status: 400 }
    );
  }

  if (body.token && (typeof body.token !== 'string' || body.token.length < 8)) {
    return Response.json(
      { success: false, error: 'Custom token must be at least 8 characters' },
      { status: 400 }
    );
  }

  const token = body.token || crypto.randomUUID();
  const now = Date.now();

  const activationToken: ActivationToken = {
    token,
    createdAt: now,
    expiresAt: body.expiresAt,
    maxUses: body.maxUses,
    usedCount: 0,
    createdBy: body.createdBy,
  };

  await env.ACTIVATION_TOKENS.put(`token:${token}`, JSON.stringify(activationToken));

  // Log admin action for audit trail
  console.log(`[ADMIN] Activation token created: ${token.substring(0, 8)}... by ${body.createdBy || 'unknown'}`);

  return Response.json({
    success: true,
    token,
    createdAt: now,
  });
}

/**
 * Admin endpoint to revoke/delete activation tokens
 * Protected with ADMIN_MASTER_TOKEN authentication
 */
async function handleRevokeActivationToken(request: Request, env: Env): Promise<Response> {
  // Verify admin authentication
  if (!verifyAdminToken(request, env)) {
    console.warn('Unauthorized admin token revocation attempt');
    return Response.json(
      { success: false, error: 'Unauthorized - Invalid admin token' },
      { status: 401 }
    );
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  if (!body.token || typeof body.token !== 'string') {
    return Response.json(
      { success: false, error: 'Missing or invalid token parameter' },
      { status: 400 }
    );
  }

  // Check if token exists
  const tokenStr = await env.ACTIVATION_TOKENS.get(`token:${body.token}`);
  if (!tokenStr) {
    return Response.json(
      { success: false, error: 'Token not found' },
      { status: 404 }
    );
  }

  // Delete the token
  await env.ACTIVATION_TOKENS.delete(`token:${body.token}`);

  // Log admin action for audit trail
  console.log(`[ADMIN] Activation token revoked: ${body.token.substring(0, 8)}...`);

  return Response.json({
    success: true,
    message: 'Activation token revoked successfully',
  });
}

/**
 * Delete a calendar completely
 * - Only owners can delete
 * - Removes calendar from all users' lists
 * - Deletes DO storage and KV cache
 */
async function handleDeleteCalendar(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request);
  if (parsed instanceof Response) return parsed;
  if (!hasString(parsed, 'calendarId') || !hasString(parsed, 'requesterId')) {
    return Response.json({ error: 'Missing or invalid calendar delete request' }, { status: 400 });
  }
  const body = parsed as unknown as DeleteCalendarRequest;

  const authError = await verifyUserSession(request, env, body.requesterId);
  if (authError) return authError;

  // Get Durable Object instance
  const id = env.CALENDAR_DO.idFromName(body.calendarId);
  const stub = env.CALENDAR_DO.get(id);

  // First, get the list of all users with access (before deletion)
  const listResponse = await stub.fetch('https://do/listPrivileges', {
    method: 'POST',
    body: JSON.stringify({ requesterId: body.requesterId }),
  });

  let userIdsToCleanup: string[] = [];
  if (listResponse.ok) {
    const listData = await listResponse.json() as ListPrivilegesResponse;
    if (listData.success && listData.privileges) {
      userIdsToCleanup = listData.privileges.map((p: { userId: string }) => p.userId);
    }
  }

  // Destroy the calendar in DO
  const doResponse = await stub.fetch('https://do/destroy', {
    method: 'POST',
    body: JSON.stringify({ requesterId: body.requesterId }),
  });
  const clonedResponse = doResponse.clone();

  // If successful, remove from all users' calendar lists
  if (doResponse.ok) {
    const result = await doResponse.json() as DeleteCalendarResponse;
    if (result.success) {
      // Remove calendar from each user's list
      for (const userId of userIdsToCleanup) {
        const userCalendarsKey = `user-calendars:${userId}`;
        const existingCalendars = await env.USERS.get(userCalendarsKey);
        if (existingCalendars) {
          const calendars = JSON.parse(existingCalendars);
          const filtered = calendars.filter((c: { id: string }) => c.id !== body.calendarId);
          await env.USERS.put(userCalendarsKey, JSON.stringify(filtered));
        }
      }
    }
  }

  return clonedResponse;
}
