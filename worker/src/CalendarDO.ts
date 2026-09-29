import {
  CalendarDocument,
  CalendarData,
  Privilege,
  PrivilegeLevel,
  WriteCalendarRequest,
  WriteCalendarResponse,
  ReadCalendarResponse,
  GrantPrivilegeRequest,
  GrantPrivilegeResponse,
  WSMessage,
  WSUpdateMessage,
  WSPresenceMessage,
  Env,
} from './types';

const MAX_DO_JSON_BODY_BYTES = 272 * 1024;

interface InitializeRequest {
  calendarId: string;
  ownerId: string;
  data: CalendarData;
}

interface ReadRequest {
  userId?: string;
}

interface RevokeRequest {
  granterId: string;
  targetUserId: string;
}

interface ListPrivilegesRequest {
  requesterId: string;
}

interface DestroyRequest {
  requesterId: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): value is Record<string, string> {
  return typeof value[key] === 'string' && value[key].trim().length > 0;
}

function isValidPrivilegeLevel(value: string): value is PrivilegeLevel {
  return ['read', 'write', 'owner'].includes(value);
}

function isCalendarDataValid(data: unknown): data is CalendarData {
  return isObject(data)
    && Array.isArray(data.courses)
    && new TextEncoder().encode(JSON.stringify(data)).length <= MAX_DO_JSON_BODY_BYTES;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > MAX_DO_JSON_BODY_BYTES) {
    return Response.json({ success: false, message: 'Request body is too large' }, { status: 413 });
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_DO_JSON_BODY_BYTES) {
      return Response.json({ success: false, message: 'Request body is too large' }, { status: 413 });
    }

    const value = JSON.parse(text) as unknown;
    if (!isObject(value)) {
      return Response.json({ success: false, message: 'Request body must be a JSON object' }, { status: 400 });
    }
    return value;
  } catch {
    return Response.json({ success: false, message: 'Invalid JSON in request body' }, { status: 400 });
  }
}

/**
 * CalendarDO - Durable Object for managing a single calendar document
 *
 * Features:
 * - Mutex-based operation queuing for concurrent writes
 * - WebSocket support for real-time collaboration
 * - Privilege-based access control
 * - Version-based optimistic locking
 */
export class CalendarDO {
  private state: DurableObjectState;
  private env: Env;
  private document: CalendarDocument | null = null;
  private sessions: Set<WebSocket> = new Set();
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Block concurrent executions until initialization is complete
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<CalendarDocument>('document');
      if (stored) {
        this.document = stored;
      }
    });
  }

  /**
   * Mutex primitive - ensures operations are executed sequentially
   */
  private async withMutex<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation = this.operationQueue;
    let release!: () => void;

    this.operationQueue = new Promise((resolve) => {
      release = resolve;
    });

    try {
      await previousOperation;
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * Check if a user has a specific privilege level
   */
  private hasPrivilege(userId: string, requiredLevel: PrivilegeLevel): boolean {
    if (!this.document) return false;

    const privilege = this.document.privileges.find(p => p.userId === userId);
    if (!privilege) return false;

    // Privilege hierarchy: owner > write > read
    const levels: PrivilegeLevel[] = ['read', 'write', 'owner'];
    const userLevelIndex = levels.indexOf(privilege.level);
    const requiredLevelIndex = levels.indexOf(requiredLevel);

    return userLevelIndex >= requiredLevelIndex;
  }

  /**
   * Initialize a new calendar document
   */
  async initialize(calendarId: string, ownerId: string, data: CalendarData): Promise<void> {
    return this.withMutex(async () => {
      if (this.document) {
        throw new Error('Document already initialized');
      }

      const now = Date.now();
      this.document = {
        id: calendarId,
        data,
        privileges: [
          {
            userId: ownerId,
            level: 'owner',
            grantedAt: now,
            grantedBy: ownerId,
          },
        ],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      await this.state.storage.put('document', this.document);
      await this.purgeCache();
    });
  }

  /**
   * Read calendar data
   */
  async read(userId?: string): Promise<ReadCalendarResponse> {
    if (!this.document) {
      throw new Error('Document not found');
    }

    if (userId && !this.hasPrivilege(userId, 'read')) {
      throw new Error('Insufficient privileges');
    }

    const hasWriteAccess = userId ? this.hasPrivilege(userId, 'write') : false;

    return {
      data: this.document.data,
      version: this.document.version,
      hasWriteAccess,
      updatedAt: this.document.updatedAt,
    };
  }

  private async managePublicLink(requesterId: string, action: string): Promise<Response> {
    return this.withMutex(async () => {
      if (!this.document) return Response.json({ error: 'Calendar not found' }, { status: 404 });
      if (!this.hasPrivilege(requesterId, 'owner')) {
        return Response.json({ error: 'Only owners can manage public links' }, { status: 403 });
      }
      let token = await this.state.storage.get<string>('publicToken');
      let publicId = await this.state.storage.get<string>('publicId');
      const revokedPublicId = action === 'revoke' ? publicId : undefined;
      if (token && !publicId && action !== 'revoke') {
        const idBytes = crypto.getRandomValues(new Uint8Array(32));
        publicId = btoa(String.fromCharCode(...idBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        await this.state.storage.put('publicId', publicId);
      }
      if (action === 'create' && !token) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        const idBytes = crypto.getRandomValues(new Uint8Array(32));
        publicId = btoa(String.fromCharCode(...idBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        await this.state.storage.put('publicToken', token);
        await this.state.storage.put('publicId', publicId);
      } else if (action === 'revoke') {
        await this.state.storage.delete(['publicToken', 'publicId', 'publicSnapshot']);
        token = undefined;
        publicId = undefined;
      } else if (action === 'purge') {
        await this.state.storage.delete('publicSnapshot');
      }
      return Response.json({ token: token ?? null, publicId: publicId ?? null, revokedPublicId: revokedPublicId ?? null });
    });
  }

  private async readPublic(token: string): Promise<Response> {
    return this.withMutex(async () => {
      const expected = await this.state.storage.get<string>('publicToken');
      // Authorization always precedes the snapshot cache, including after revocation.
      let difference = expected ? expected.length ^ token.length : 1;
      for (let index = 0; index < 43; index++) {
        difference |= (expected?.charCodeAt(index) || 0) ^ (token.charCodeAt(index) || 0);
      }
      if (!this.document || difference !== 0) {
        return Response.json({ error: 'Public link unavailable' }, { status: 404 });
      }
      let snapshot = await this.state.storage.get<{ response: ReadCalendarResponse; expiresAt: number }>('publicSnapshot');
      if (!snapshot || snapshot.expiresAt <= Date.now()) {
        snapshot = {
          response: { data: this.document.data, version: this.document.version, updatedAt: this.document.updatedAt, hasWriteAccess: false },
          expiresAt: Date.now() + 60_000,
        };
        await this.state.storage.put('publicSnapshot', snapshot);
      }
      return Response.json(snapshot.response);
    });
  }

  /**
   * Write calendar data with optimistic locking
   */
  async write(request: WriteCalendarRequest): Promise<WriteCalendarResponse> {
    return this.withMutex(async () => {
      if (!this.document) {
        throw new Error('Document not found');
      }

      // Check write privilege
      if (!this.hasPrivilege(request.userId, 'write')) {
        return {
          success: false,
          version: this.document.version,
          updatedAt: this.document.updatedAt,
          message: 'Insufficient privileges',
        };
      }

      // Optimistic locking check
      if (request.version !== this.document.version) {
        return {
          success: false,
          version: this.document.version,
          updatedAt: this.document.updatedAt,
          message: 'Version conflict - document has been modified',
        };
      }

      // Update document
      const now = Date.now();
      this.document.data = request.data;
      this.document.version += 1;
      this.document.updatedAt = now;

      await this.state.storage.put('document', this.document);

      await this.purgeCache();

      // Broadcast update to connected WebSocket clients
      this.broadcastUpdate();

      return {
        success: true,
        version: this.document.version,
        updatedAt: this.document.updatedAt,
      };
    });
  }

  /**
   * Grant privilege to another user
   */
  async grantPrivilege(request: GrantPrivilegeRequest): Promise<GrantPrivilegeResponse> {
    return this.withMutex(async () => {
      if (!this.document) {
        throw new Error('Document not found');
      }

      // Only owners can grant privileges
      if (!this.hasPrivilege(request.granterId, 'owner')) {
        return {
          success: false,
          message: 'Only owners can grant privileges',
        };
      }

      // Check if privilege already exists
      const existingIndex = this.document.privileges.findIndex(
        p => p.userId === request.targetUserId
      );

      const newPrivilege: Privilege = {
        userId: request.targetUserId,
        level: request.level,
        grantedAt: Date.now(),
        grantedBy: request.granterId,
      };

      if (existingIndex >= 0) {
        // Update existing privilege
        this.document.privileges[existingIndex] = newPrivilege;
      } else {
        // Add new privilege
        this.document.privileges.push(newPrivilege);
      }

      await this.state.storage.put('document', this.document);

      return {
        success: true,
        message: 'Privilege granted successfully',
      };
    });
  }

  /**
   * Revoke privilege from a user
   * - Owners can revoke any privilege
   * - Users can revoke themselves (self-revoke)
   * - If last owner leaves, transfer ownership or destroy calendar
   */
  async revokePrivilege(granterId: string, targetUserId: string): Promise<GrantPrivilegeResponse> {
    return this.withMutex(async () => {
      if (!this.document) {
        throw new Error('Document not found');
      }

      const isSelfRevoke = granterId === targetUserId;
      const isOwner = this.hasPrivilege(granterId, 'owner');

      // Only owners can revoke others, anyone can revoke themselves
      if (!isSelfRevoke && !isOwner) {
        return {
          success: false,
          message: 'Only owners can revoke other users privileges',
        };
      }

      // Check if target has privilege
      const targetIndex = this.document.privileges.findIndex(p => p.userId === targetUserId);
      if (targetIndex === -1) {
        return {
          success: false,
          message: 'User does not have access to this calendar',
        };
      }

      // Check if this is the last owner
      const owners = this.document.privileges.filter(p => p.level === 'owner');
      const isLastOwner = owners.length === 1 && owners[0].userId === targetUserId;

      if (isLastOwner) {
        // Try to transfer ownership to another user
        const otherUsers = this.document.privileges.filter(p => p.userId !== targetUserId);

        if (otherUsers.length > 0) {
          // Prefer an existing writer before promoting a read-only collaborator.
          const newOwner = otherUsers.find(p => p.level === 'write') || otherUsers[0];
          newOwner.level = 'owner';
          newOwner.grantedAt = Date.now();

          // Remove the leaving owner
          this.document.privileges.splice(targetIndex, 1);

          await this.state.storage.put('document', this.document);

          return {
            success: true,
            message: 'Ownership transferred to another user',
            ownershipTransferred: true,
            newOwnerId: newOwner.userId,
          };
        } else {
          // No other users - calendar should be destroyed
          return {
            success: false,
            message: 'Cannot revoke - you are the last user. Please delete the calendar instead.',
            shouldDestroy: true,
          };
        }
      }

      // Normal revoke
      this.document.privileges.splice(targetIndex, 1);
      await this.state.storage.put('document', this.document);

      return {
        success: true,
        message: isSelfRevoke ? 'Successfully removed yourself from calendar' : 'Privilege revoked successfully',
      };
    });
  }

  /**
   * List all users with access to this calendar
   * - Owners can see all privileges
   * - Non-owners can only see their own privilege
   */
  async listPrivileges(requesterId: string): Promise<{ success: boolean; privileges?: Privilege[]; message?: string }> {
    if (!this.document) {
      throw new Error('Document not found');
    }

    const requesterPrivilege = this.document.privileges.find(p => p.userId === requesterId);
    if (!requesterPrivilege) {
      return {
        success: false,
        message: 'User does not have access to this calendar',
      };
    }

    // Owners can see all privileges, non-owners can only see themselves
    if (requesterPrivilege.level === 'owner') {
      return {
        success: true,
        privileges: this.document.privileges,
      };
    } else {
      return {
        success: true,
        privileges: [requesterPrivilege],
      };
    }
  }

  /**
   * Destroy the calendar completely
   * - Only owners can destroy
   * - Deletes DO storage and KV cache
   * - Closes all WebSocket connections
   */
  async destroy(requesterId: string): Promise<{ success: boolean; message?: string }> {
    return this.withMutex(async () => {
      if (!this.document) {
        return {
          success: false,
          message: 'Calendar not found',
        };
      }

      // Only owners can destroy
      if (!this.hasPrivilege(requesterId, 'owner')) {
        return {
          success: false,
          message: 'Only owners can delete calendars',
        };
      }

      const calendarId = this.document.id;

      // Close all WebSocket connections
      this.sessions.forEach(ws => {
        try {
          ws.close(1000, 'Calendar deleted');
        } catch (error) {
          console.error('Failed to close WebSocket:', error);
        }
      });
      this.sessions.clear();

      // Delete from KV cache
      try {
        await this.env.CALENDAR_CACHE.delete(`calendar:${calendarId}`);
      } catch (error) {
        console.error('Failed to delete from cache:', error);
      }

      // Delete from DO storage
      await this.state.storage.deleteAll();
      this.document = null;

      return {
        success: true,
        message: 'Calendar deleted successfully',
      };
    });
  }

  /**
   * Remove legacy anonymous cache entries; live reads require authentication.
   */
  private async purgeCache(): Promise<void> {
    if (!this.document) return;

    try {
      await this.state.storage.delete('publicSnapshot');
      await this.env.CALENDAR_CACHE.delete(`calendar:${this.document.id}`);
    } catch (error) {
      console.error('Failed to update cache:', error);
      // Don't throw - cache update failure shouldn't break the write operation
    }
  }

  /**
   * Broadcast update to all connected WebSocket clients
   */
  private broadcastUpdate(): void {
    if (!this.document) return;

    const message: WSUpdateMessage = {
      type: 'update',
      calendarId: this.document.id,
      version: this.document.version,
      data: this.document.data,
      timestamp: Date.now(),
    };

    const messageStr = JSON.stringify(message);

    this.sessions.forEach(ws => {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        this.sessions.delete(ws);
      }
    });
  }

  /**
   * Handle WebSocket connections for real-time collaboration
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket upgrade for real-time collaboration
    if (path === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const userId = url.searchParams.get('userId');
      if (!userId || !this.hasPrivilege(userId, 'read')) {
        return new Response('Unauthorized', { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleWebSocket(server, userId);

      return new Response(null, {
        status: 101,
        headers: { 'Sec-WebSocket-Protocol': request.headers.get('Sec-WebSocket-Protocol') || '' },
        webSocket: client,
      });
    }

    // HTTP API endpoints
    if (request.method === 'POST') {
      try {
        const body = await readJsonObject(request);
        if (body instanceof Response) return body;

        switch (path) {
          case '/public/read': {
            if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
              return Response.json({ error: 'Invalid public link' }, { status: 400 });
            }
            return await this.readPublic(body.token);
          }
          case '/public/manage': {
            if (!hasString(body, 'requesterId') || typeof body.action !== 'string' || !['status', 'create', 'revoke', 'purge'].includes(body.action)) {
              return Response.json({ error: 'Invalid public link action' }, { status: 400 });
            }
            return await this.managePublicLink(body.requesterId, body.action);
          }
          case '/initialize':
            {
              if (!hasString(body, 'calendarId') || !hasString(body, 'ownerId') || !isCalendarDataValid(body.data)) {
                return Response.json({ success: false, message: 'Missing or invalid initialize request' }, { status: 400 });
              }
              const init: InitializeRequest = {
                calendarId: body.calendarId,
                ownerId: body.ownerId,
                data: body.data,
              };
              await this.initialize(init.calendarId, init.ownerId, init.data);
            }
            return Response.json({ success: true });

          case '/read': {
            if (body.userId !== undefined && typeof body.userId !== 'string') {
              return Response.json({ success: false, message: 'Missing or invalid read request' }, { status: 400 });
            }
            const readRequest: ReadRequest = { userId: body.userId };
            const readResult = await this.read(readRequest.userId);
            return Response.json(readResult);
          }

          case '/write': {
            if (!hasString(body, 'calendarId') || !hasString(body, 'userId') || !isCalendarDataValid(body.data) || typeof body.version !== 'number') {
              return Response.json({ success: false, message: 'Missing or invalid write request' }, { status: 400 });
            }
            const writeResult = await this.write({
              calendarId: body.calendarId,
              userId: body.userId,
              data: body.data,
              version: body.version,
            });
            return Response.json(writeResult);
          }

          case '/grant': {
            if (!hasString(body, 'calendarId') || !hasString(body, 'granterId') || !hasString(body, 'targetUserId') || !hasString(body, 'level') || !isValidPrivilegeLevel(body.level)) {
              return Response.json({ success: false, message: 'Missing or invalid grant request' }, { status: 400 });
            }
            const grantRequest: GrantPrivilegeRequest = {
              calendarId: body.calendarId,
              granterId: body.granterId,
              targetUserId: body.targetUserId,
              level: body.level,
            };
            const grantResult = await this.grantPrivilege(grantRequest);
            return Response.json(grantResult);
          }

          case '/revoke': {
            if (!hasString(body, 'granterId') || !hasString(body, 'targetUserId')) {
              return Response.json({ success: false, message: 'Missing or invalid revoke request' }, { status: 400 });
            }
            const revokeRequest: RevokeRequest = {
              granterId: body.granterId,
              targetUserId: body.targetUserId,
            };
            const revokeResult = await this.revokePrivilege(revokeRequest.granterId, revokeRequest.targetUserId);
            return Response.json(revokeResult);
          }

          case '/listPrivileges': {
            if (!hasString(body, 'requesterId')) {
              return Response.json({ success: false, message: 'Missing or invalid list privileges request' }, { status: 400 });
            }
            const listRequest: ListPrivilegesRequest = { requesterId: body.requesterId };
            const listResult = await this.listPrivileges(listRequest.requesterId);
            return Response.json(listResult);
          }

          case '/destroy': {
            if (!hasString(body, 'requesterId')) {
              return Response.json({ success: false, message: 'Missing or invalid destroy request' }, { status: 400 });
            }
            const destroyRequest: DestroyRequest = { requesterId: body.requesterId };
            const destroyResult = await this.destroy(destroyRequest.requesterId);
            return Response.json(destroyResult);
          }

          default:
            return new Response('Not found', { status: 404 });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal error';
        const status = message.toLowerCase().includes('not found')
          ? 404
          : message.toLowerCase().includes('privilege')
            ? 403
            : 500;
        return Response.json({ success: false, message }, { status });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }

  /**
   * Handle WebSocket connection
   */
  private async handleWebSocket(ws: WebSocket, userId: string): Promise<void> {
    ws.accept();
    this.sessions.add(ws);

    // Send presence notification
    const presenceMessage: WSPresenceMessage = {
      type: 'presence',
      calendarId: this.document?.id || '',
      userId,
      action: 'join',
      timestamp: Date.now(),
    };

    this.broadcastMessage(presenceMessage, ws);

    // Send initial state
    if (this.document) {
      const initialMessage: WSUpdateMessage = {
        type: 'update',
        calendarId: this.document.id,
        version: this.document.version,
        data: this.document.data,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(initialMessage));
    }

    ws.addEventListener('close', () => {
      this.sessions.delete(ws);

      // Send leave notification
      const leaveMessage: WSPresenceMessage = {
        type: 'presence',
        calendarId: this.document?.id || '',
        userId,
        action: 'leave',
        timestamp: Date.now(),
      };

      this.broadcastMessage(leaveMessage);
    });
  }

  /**
   * Broadcast a message to all connected clients except the sender
   */
  private broadcastMessage(message: WSMessage, excludeWs?: WebSocket): void {
    const messageStr = JSON.stringify(message);

    this.sessions.forEach(ws => {
      if (ws !== excludeWs) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Failed to send WebSocket message:', error);
          this.sessions.delete(ws);
        }
      }
    });
  }
}
