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
  private operationQueue: Promise<unknown> = Promise.resolve();

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
    let resolver: (value: T) => void;
    let rejecter: (error: unknown) => void;

    this.operationQueue = new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });

    try {
      await previousOperation;
      const result = await operation();
      resolver!(result);
      return result;
    } catch (error) {
      rejecter!(error);
      throw error;
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

      // Cache for anonymous readers
      await this.updateCache();
    });
  }

  /**
   * Read calendar data
   */
  async read(userId?: string): Promise<ReadCalendarResponse> {
    if (!this.document) {
      throw new Error('Document not found');
    }

    const hasWriteAccess = userId ? this.hasPrivilege(userId, 'write') : false;

    return {
      data: this.document.data,
      version: this.document.version,
      hasWriteAccess,
      updatedAt: this.document.updatedAt,
    };
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

      // Update KV cache for anonymous readers
      await this.updateCache();

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
          // Transfer ownership to the first other user
          const newOwner = otherUsers[0];
          newOwner.level = 'owner';
          newOwner.grantedAt = Date.now();

          // Remove the leaving owner
          this.document.privileges.splice(targetIndex, 1);

          await this.state.storage.put('document', this.document);

          return {
            success: true,
            message: `Ownership transferred to user ${newOwner.userId.substring(0, 8)}...`,
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
   * Update KV cache for anonymous readers
   */
  private async updateCache(): Promise<void> {
    if (!this.document) return;

    try {
      // Cache the calendar data without privileges (indefinitely until updated)
      const cacheData = {
        data: this.document.data,
        version: this.document.version,
        updatedAt: this.document.updatedAt,
      };

      // No expiration - cache persists until explicitly updated on write
      await this.env.CALENDAR_CACHE.put(
        `calendar:${this.document.id}`,
        JSON.stringify(cacheData)
      );
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
        webSocket: client,
      });
    }

    // HTTP API endpoints
    if (request.method === 'POST') {
      const body = await request.json();

      switch (path) {
        case '/initialize':
          await this.initialize(body.calendarId, body.ownerId, body.data);
          return Response.json({ success: true });

        case '/read': {
          const readResult = await this.read(body.userId);
          return Response.json(readResult);
        }

        case '/write': {
          const writeResult = await this.write(body as WriteCalendarRequest);
          return Response.json(writeResult);
        }

        case '/grant': {
          const grantResult = await this.grantPrivilege(body as GrantPrivilegeRequest);
          return Response.json(grantResult);
        }

        case '/revoke': {
          const revokeResult = await this.revokePrivilege(body.granterId, body.targetUserId);
          return Response.json(revokeResult);
        }

        case '/listPrivileges': {
          const listResult = await this.listPrivileges(body.requesterId);
          return Response.json(listResult);
        }

        case '/destroy': {
          const destroyResult = await this.destroy(body.requesterId);
          return Response.json(destroyResult);
        }

        default:
          return new Response('Not found', { status: 404 });
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
