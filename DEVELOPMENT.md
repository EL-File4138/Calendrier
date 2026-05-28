# Development Reference

Comprehensive development guide for Calendrier, covering local environment setup, API reference, and implementation details.

## Development Environment Setup

### Prerequisites

- Node.js 18+ and npm
- Wrangler CLI: `npm install -g wrangler`

### Frontend Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Frontend runs at http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview

# Code quality
npm run lint
```

### Worker Setup

```bash
# Navigate to worker directory
cd worker

# Install dependencies
npm install

# Configure development secrets
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add a development admin token:

```bash
# Generate secure token
openssl rand -hex 32

# Add to .dev.vars
ADMIN_MASTER_TOKEN=your-generated-token-here
```

Start the worker:

```bash
npm run dev
# Worker runs at http://localhost:8787
```

### Full Stack Local Development

**Terminal 1 - Worker:**
```bash
cd worker
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

Configure frontend `.env`:

```env
VITE_WORKER_URL=http://localhost:8787
```

---

## API Reference

### User Management

#### POST /api/user/create

Create a new user ID and register with activation token in one step.

**Request:**
```json
{
  "activationToken": "TEST123",
  "displayName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "uuid-here",
  "createdAt": 1234567890,
  "message": "User created and registered successfully"
}
```

**Error Responses:**
- 400: Invalid or expired activation token
- 500: Internal server error

---

### Calendar Management

#### POST /api/calendar/create

Create a new calendar document.

**Authentication:** Requires registered user.

**Request:**
```json
{
  "userId": "user-uuid",
  "data": {
    "title": "My Academic Calendar",
    "courses": [],
    "settings": {
      "timeFormat": "24h",
      "weekStart": "Monday"
    }
  }
}
```

**Response:**
```json
{
  "calendarId": "calendar-uuid",
  "createdAt": 1234567890
}
```

---

#### GET /api/calendar/read?calendarId={id}&userId={userId}

Read calendar data.

**Authentication:** Requires `Authorization: Bearer <sessionToken>` and read access.

Pass `calendarId` and optional `userId` as query parameters.

**Response:**
```json
{
  "data": {
    "title": "My Calendar",
    "courses": [...],
    "settings": {...}
  },
  "version": 5,
  "hasWriteAccess": true,
  "updatedAt": 1234567890
}
```

**Registered readers:**
- Get live data from Durable Object when the user has read access.
- `hasWriteAccess` depends on privilege level
- Can establish WebSocket connection

---

#### POST /api/calendar/write

Write calendar data with optimistic locking.

**Authentication:** Requires write access.

Send `Authorization: Bearer <sessionToken>`.

**Request:**
```json
{
  "calendarId": "calendar-uuid",
  "userId": "user-uuid",
  "version": 5,
  "data": {
    "title": "Updated Calendar",
    "courses": [...],
    "settings": {...}
  }
}
```

**Response:**
```json
{
  "success": true,
  "version": 6,
  "updatedAt": 1234567890
}
```

**Error Responses:**
- 409: Version conflict (stale data)
- 403: User lacks write access
- 404: Calendar not found

---

#### POST /api/calendar/delete

Delete a calendar (owner only).

**Authentication:** Requires owner privilege.

Send `Authorization: Bearer <sessionToken>`.

**Request:**
```json
{
  "calendarId": "calendar-uuid",
  "requesterId": "user-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Calendar deleted successfully"
}
```

**Error Responses:**
- 403: User is not owner
- 404: Calendar not found

**Side Effects:**
- Calendar removed from all users' lists
- All privileges revoked
- WebSocket connections closed
- KV cache deleted

---

### Privilege Management

#### POST /api/privilege/grant

Grant access to another user.

**Authentication:** Requires owner privilege.

Send `Authorization: Bearer <sessionToken>`.

**Request:**
```json
{
  "calendarId": "calendar-uuid",
  "granterId": "owner-user-uuid",
  "targetUserId": "target-user-uuid",
  "level": "write"
}
```

**Privilege Levels:**
- `owner` - Full control, can grant/revoke access
- `write` - Can edit calendar
- `read` - View-only with real-time updates

**Response:**
```json
{
  "success": true,
  "message": "Privilege granted successfully"
}
```

**Error Responses:**
- 403: Granter is not owner
- 404: Calendar or user not found

---

#### POST /api/privilege/revoke

Revoke access from a user.

**Authentication:** Requires owner privilege OR user revoking their own access.

Send `Authorization: Bearer <sessionToken>`.

**Request:**
```json
{
  "calendarId": "calendar-uuid",
  "granterId": "owner-user-uuid",
  "targetUserId": "target-user-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Privilege revoked successfully"
}
```

**Special Cases:**
- Owner can revoke any user's access
- Users can revoke their own access (self-removal)
- Cannot revoke owner's own privilege

---

### WebSocket

#### GET /api/calendar/{calendarId}/ws?userId={userId}

Establish WebSocket connection for real-time updates.

**Authentication:** Requires registered user with read access.

**Connection:**
```javascript
const ws = new WebSocket(
  'wss://your-worker.workers.dev/api/calendar/abc123/ws?userId=user-uuid'
);
```

**Server Messages:**

Update message (calendar data changed):
```json
{
  "type": "update",
  "calendarId": "calendar-uuid",
  "version": 6,
  "data": {
    "title": "Updated Title",
    "courses": [...],
    "settings": {...}
  },
  "timestamp": 1234567890
}
```

Presence message (user joined/left):
```json
{
  "type": "presence",
  "calendarId": "calendar-uuid",
  "userId": "user-uuid",
  "displayName": "John Doe",
  "action": "join",
  "timestamp": 1234567890
}
```

**Client Handling:**
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'update') {
    // Update local state with message.data
  } else if (message.type === 'presence') {
    // Update active users list
  }
};
```

---

### Admin Endpoints

#### POST /api/admin/token/create

Create activation token.

**Authentication:** Requires ADMIN_MASTER_TOKEN.

**Headers:**
```
Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN
Content-Type: application/json
```

**Request:**
```json
{
  "token": "CUSTOM_TOKEN",
  "maxUses": 100,
  "expiresAt": 1735689600000,
  "createdBy": "admin@example.com"
}
```

**All fields are optional:**
- `token` - If not provided, generates UUID
- `maxUses` - If not provided, unlimited uses
- `expiresAt` - Unix timestamp in milliseconds
- `createdBy` - Identifier for audit logs

**Response:**
```json
{
  "success": true,
  "token": "CUSTOM_TOKEN",
  "createdAt": 1234567890
}
```

**Error Responses:**
- 401: Invalid admin token
- 400: Invalid parameters (e.g., negative maxUses, past expiration)

**Validation:**
- `expiresAt` must be future timestamp
- `maxUses` must be positive integer
- ADMIN_MASTER_TOKEN must be at least 32 characters

---

#### POST /api/admin/token/revoke

Revoke (delete) activation token.

**Authentication:** Requires ADMIN_MASTER_TOKEN.

**Request:**
```json
{
  "token": "TOKEN_TO_REVOKE"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Activation token revoked successfully",
  "token": "TOKEN_TO_REVOKE"
}
```

**Error Responses:**
- 401: Invalid admin token
- 404: Token not found
- 400: Missing token parameter

---

## Architecture Details

### Durable Objects (CalendarDO)

Each calendar is stored in a separate Durable Object instance.

**Key Features:**
- Strong consistency within a document
- Geographic distribution
- Built-in persistence
- WebSocket connection management
- Mutex-based concurrency control

**Methods:**

**initialize(owner: string, data: CalendarData)**
- Creates new calendar document
- Sets owner as initial privilege holder
- Initializes version to 1

**read(userId?: string)**
- Returns calendar data
- Checks user privileges
- Returns hasWriteAccess flag

**write(userId: string, data: CalendarData, version: number)**
- Updates calendar data
- Validates version for optimistic locking
- Updates KV cache
- Broadcasts to WebSocket clients

**grantPrivilege(granterId: string, targetUserId: string, level: PrivilegeLevel)**
- Adds or updates privilege
- Only owner can grant
- Validates user IDs

**revokePrivilege(granterId: string, targetUserId: string)**
- Removes privilege
- Owner can revoke any user
- Users can revoke themselves

**Mutex Implementation:**
```typescript
private async withMutex<T>(fn: () => Promise<T>): Promise<T> {
  while (this.mutex) {
    await this.mutex;
  }

  let resolve: () => void;
  this.mutex = new Promise(r => resolve = r);

  try {
    return await fn();
  } finally {
    resolve!();
    this.mutex = null;
  }
}
```

This ensures sequential execution of operations, preventing race conditions.

---

### KV Namespaces

**CALENDAR_CACHE:**
- Legacy namespace retained for cleanup of old cached calendar data
- Key format: `calendar:{calendarId}`
- New writes delete this key; authenticated live reads use Durable Objects directly.

**ACTIVATION_TOKENS:**
- Stores activation tokens
- Key format: `token:{tokenString}`
- Value: `ActivationToken` JSON
- No TTL (manual deletion via revoke)

**USERS:**
- Stores user metadata
- Key format: `user:{userId}`
- Value: `User` JSON
- Also stores calendar associations:
  - `user:{userId}:calendars` - List of calendar IDs

---

### Optimistic Locking

Prevents concurrent edit conflicts using version numbers.

**Flow:**
1. Client reads calendar (version: 5)
2. Client makes edits locally
3. Client sends write request (version: 5)
4. Server checks current version
   - If still 5: Accept write, increment to 6
   - If now 6: Reject with 409 Conflict
5. On conflict, client reloads and retries

**Implementation:**
```typescript
async write(userId: string, data: CalendarData, version: number) {
  if (version !== this.doc.version) {
    throw new Error('Version conflict');
  }

  this.doc.data = data;
  this.doc.version++;
  this.doc.updatedAt = Date.now();

  await this.saveState();
  await this.updateCache();
  this.broadcastUpdate();

  return { version: this.doc.version };
}
```

---

### Security Implementation

#### Constant-Time Token Comparison

Prevents timing attacks on admin token authentication:

```typescript
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

#### Admin Token Validation

```typescript
function verifyAdminToken(request: Request, env: Env): boolean {
  if (!env.ADMIN_MASTER_TOKEN || env.ADMIN_MASTER_TOKEN.length < 32) {
    console.error('ADMIN_MASTER_TOKEN not properly configured');
    return false;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  return constantTimeCompare(token, env.ADMIN_MASTER_TOKEN);
}
```

#### Input Validation

All admin endpoints validate:
- Parameter types
- Value ranges
- Token length
- Future timestamps

Example:
```typescript
if (body.expiresAt && typeof body.expiresAt !== 'number') {
  return Response.json(
    { success: false, error: 'expiresAt must be a number' },
    { status: 400 }
  );
}

if (body.expiresAt && body.expiresAt <= Date.now()) {
  return Response.json(
    { success: false, error: 'expiresAt must be a future timestamp' },
    { status: 400 }
  );
}
```

---

## Testing Procedures

### Create Test User

```bash
curl -X POST http://localhost:8787/api/user/create \
  -H "Content-Type: application/json" \
  -d '{
    "activationToken": "TEST123",
    "displayName": "Test User"
  }'
```

Save the returned `userId`.

### Create Activation Token

```bash
curl -X POST http://localhost:8787/api/admin/token/create \
  -H "Authorization: Bearer your-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TEST123",
    "maxUses": 100
  }'
```

### Create Calendar

```bash
curl -X POST http://localhost:8787/api/calendar/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "data": {
      "title": "Test Calendar",
      "courses": [],
      "settings": {
        "timeFormat": "24h",
        "weekStart": "Monday"
      }
    }
  }'
```

Save the returned `calendarId`.

### Read Calendar

```bash
curl -X POST http://localhost:8787/api/calendar/read \
  -H "Content-Type: application/json" \
  -d '{
    "calendarId": "YOUR_CALENDAR_ID",
    "userId": "YOUR_USER_ID"
  }'
```

### Grant Access

```bash
curl -X POST http://localhost:8787/api/privilege/grant \
  -H "Content-Type: application/json" \
  -d '{
    "calendarId": "YOUR_CALENDAR_ID",
    "granterId": "OWNER_USER_ID",
    "targetUserId": "TARGET_USER_ID",
    "level": "write"
  }'
```

### Test Real-Time Collaboration

1. Open `http://localhost:5173` in two browser windows
2. Window 1: Create user and calendar
3. Window 2: Create different user
4. Window 1: Grant write access to Window 2 user
5. Window 2: Open shared calendar
6. Edit in Window 1, observe update in Window 2

### Test Concurrent Writes

Create `test-concurrent.sh`:

```bash
#!/bin/bash

USER_ID="your-user-id"
CALENDAR_ID="your-calendar-id"
VERSION=1

for i in {1..10}; do
  curl -X POST http://localhost:8787/api/calendar/write \
    -H "Content-Type: application/json" \
    -d "{
      \"calendarId\": \"$CALENDAR_ID\",
      \"userId\": \"$USER_ID\",
      \"version\": $VERSION,
      \"data\": {
        \"title\": \"Test $i\",
        \"courses\": [],
        \"settings\": {\"timeFormat\": \"24h\", \"weekStart\": \"Monday\"}
      }
    }" &
done

wait
```

Run: `bash test-concurrent.sh`

Expected: Only one request succeeds, others fail with version conflict.

---

## Common Development Tasks

### Add New Translation

Edit `src/i18n/locales/en.json`, `zh.json`, `pl.json`:

```json
{
  "newSection": {
    "newKey": "English text"
  }
}
```

Use in components:
```typescript
const { t } = useTranslation();
return <div>{t('newSection.newKey')}</div>;
```

### Add New API Endpoint

1. Define route in `worker/src/index.ts`:
```typescript
else if (path === '/api/new/endpoint') {
  response = await handleNewEndpoint(request, env);
}
```

2. Implement handler:
```typescript
async function handleNewEndpoint(request: Request, env: Env): Promise<Response> {
  const body = await request.json();
  // Implementation
  return Response.json({ success: true });
}
```

3. Update types in `worker/src/types.ts` and `src/api/types.ts`

### Extend Durable Object

Edit `worker/src/CalendarDO.ts`:

```typescript
async newMethod(param: string): Promise<Result> {
  return this.withMutex(async () => {
    // Implementation with mutex protection
    this.doc.someField = param;
    await this.saveState();
    return { success: true };
  });
}
```

### Modify Data Model

1. Update types in `src/types/Course.ts`
2. Update backend types in `worker/src/types.ts`
3. Update components that use the data
4. Consider migration strategy for existing data

---

## Build and Deploy

### Verify TypeScript Compilation

```bash
# Frontend
npm run build

# Worker
cd worker
npm run build
```

### View Worker Logs

```bash
cd worker
npm run tail
```

### Deploy Worker

```bash
cd worker
wrangler deploy
```

### Deploy Frontend

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full procedures.

---

## Troubleshooting

### Worker Won't Start

```bash
# Clear Wrangler cache
rm -rf ~/.wrangler

# Reinstall dependencies
cd worker
rm -rf node_modules package-lock.json
npm install

# Try again
npm run dev
```

### CORS Errors

Verify worker is running and `.env` has correct URL:
```env
VITE_WORKER_URL=http://localhost:8787
```

### WebSocket Connection Failed

Check:
- User is registered
- User has read access
- Calendar exists
- Worker logs for errors

### Version Conflict Errors

This is expected behavior when:
- Multiple users edit simultaneously
- Client has stale data

Client should reload and retry.

---

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [React 19 Documentation](https://react.dev/)
- [i18next Documentation](https://www.i18next.com/)
