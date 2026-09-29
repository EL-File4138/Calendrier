# Development Reference

Comprehensive development guide for Calendrier, covering local environment setup, API reference, and implementation details.

Current release candidates: frontend `0.1.0-rc.2` and Worker `1.0.1-rc.2`.

## Development Environment Setup

### Prerequisites

- Node.js 22.12+ and npm
- Install the lockfile-pinned Wrangler through `npm ci` in `worker/`; scripts use the local CLI.

### Frontend Setup

```bash
# Install dependencies
npm ci

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
npm ci

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
  "activationToken": "TEST_ACTIVATION_TOKEN_32_CHARS_MIN",
  "displayName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "uuid-here",
  "createdAt": 1234567890,
  "sessionToken": "bearer-token-for-subsequent-requests",
  "message": "User created and registered successfully"
}
```

Save both `userId` and `sessionToken`. The session token is required as `Authorization: Bearer <sessionToken>` for subsequent authenticated requests.

**Error Responses:**
- 400: Missing activation token or invalid JSON
- 401: Invalid, expired, or exhausted activation token
- 500: Internal server error

---

### Session Logout

`POST /api/user/logout` takes `{ "userId": "user-uuid" }` and the current `Authorization: Bearer <sessionToken>`. It deletes the stored session hash and returns `{ "success": true }`. The frontend clears credentials and closes its WebSocket after attempting this request, including when the request fails. Failure is reported to the caller; it does not prove server revocation succeeded. The endpoint does not terminate already connected remote WebSockets.

### Public Read-Only Links

`POST /api/public/manage` requires an owner session. Send `{ "calendarId": "calendar-uuid", "requesterId": "owner-user-uuid", "action": "create" }`. Actions are `status`, `create`, `revoke`, and `purge`. The response contains `token` and `publicId`, or null values when disabled. Creation reuses an enabled link; revoke before creating to replace it.

`POST /api/public/read` takes `{ "publicId": "43-character-base64url-id", "token": "43-character-base64url-token" }` without account credentials. It returns the same snapshot shape as private reads, with `hasWriteAccess: false`. Invalid inputs return 400; unavailable links return 404. Management requires owner access (403 otherwise).

The UI stores link credentials in `#public=<publicId>.<token>`, then sends them in a POST body with no account credentials or referrer. Public responses use `Cache-Control: no-store`. The Durable Object checks the token on every read before serving its snapshot, cached for up to 60 seconds. Writes, manual purge, and revocation invalidate that snapshot. The public viewer polls every 60 seconds and mounts `PublicCalendarProvider` before any private calendar context is initialized.

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

Pass `calendarId` and `userId` as query parameters.

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

**Write failures:**
- Version conflicts and insufficient privileges currently return HTTP 200 with `success: false`, the current `version`, `updatedAt`, and a `message`.
- Authentication failures return 401.
- Malformed requests return 400.

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
- Public snapshot and legacy KV cache deleted; stale public routing cannot read a deleted document

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
- If the last owner leaves while other collaborators remain, ownership is transferred to another user; if no other users remain, the user must delete the calendar instead.

---

### Privilege Listing

`POST /api/privilege/list` takes `{ "calendarId": "calendar-uuid", "requesterId": "user-uuid" }` with a session bearer token. Owners see all privileges; other members see only their own.

### WebSocket

#### GET /api/calendar/{calendarId}/ws?userId={userId}

Establish WebSocket connection for real-time updates.

**Authentication:** Requires registered user with read access.

**Connection:**
```javascript
const ws = new WebSocket(
  'wss://your-worker.workers.dev/api/calendar/abc123/ws?userId=user-uuid',
  'calendrier-session.SESSION_TOKEN'
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
  "token": "CUSTOM_ACTIVATION_TOKEN_32_CHARS_MIN",
  "maxUses": 100,
  "expiresAt": 1893456000000,
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
  "token": "CUSTOM_ACTIVATION_TOKEN_32_CHARS_MIN",
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
- Custom activation tokens must be 32-512 bytes when provided; omit `token` to generate a UUID

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
  "message": "Activation token revoked successfully"
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

**initialize(calendarId: string, ownerId: string, data: CalendarData)**
- Creates new calendar document
- Sets owner as initial privilege holder
- Initializes version to 1

**read(userId?: string)**
- Returns calendar data
- Checks user privileges
- Returns hasWriteAccess flag

**write(request: WriteCalendarRequest)**
- Updates calendar data
- Validates version for optimistic locking
- Invalidates the public snapshot and deletes any legacy anonymous-cache entry for the calendar
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
The implementation uses a promise-chain operation queue to serialize mutating operations. See `worker/src/CalendarDO.ts` for the current implementation.

---

### KV Namespaces

**CALENDAR_CACHE:**
- Public route mapping: `public-link:{publicId}` -> calendar ID
- Legacy cache key: `calendar:{calendarId}`; new writes delete this key
- Authenticated reads use Durable Objects directly; public snapshots live in Durable Object storage.

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
  - `user-calendars:{userId}` - List of calendar metadata objects
- Session hashes at `session:{userId}` expire and are refreshed by HTTP authentication; logout deletes the hash.

---

### Optimistic Locking

Prevents concurrent edit conflicts using version numbers.

**Flow:**
1. Client reads calendar (version: 5)
2. Client makes edits locally
3. Client sends write request (version: 5)
4. Server checks current version
   - If still 5: Accept write, increment to 6
   - If now 6: Return `success: false` with the current version and conflict message
5. On conflict, client reloads and retries

**Implementation:**
See `worker/src/CalendarDO.ts` for the current `write(request: WriteCalendarRequest)` implementation.

---

### Security Implementation

#### Constant-Time Token Comparison

Prevents timing attacks on admin token authentication:

```typescript
function constantTimeCompare(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
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

### Automated Checks

```bash
npm ci
npm --prefix worker ci
npm test
```

The root test command runs two ICS scheduling regression cases, the frontend TypeScript/Vite build, ESLint, Worker typecheck, and Worker bundling. Worker bundling alone does not typecheck. Browser and Worker API/WebSocket drills below are separate manual checks.

### Import and Calendar Model

JSON imports replace `{ title, courses, settings }` after confirmation and enforce a 256 KB limit. Optional session schedules retain bounded/one-off dates, intervals, exclusions, and per-date overrides. Academic settings retain year periods and special dates. The full schema is in `src/types/Course.ts`.

ICS file and URL imports parse timed events and supported recurrence rules. Imported dates are resolved in the source timezone and grouped into course sessions; unsupported, invalid, and all-day entries are reported. ATS4 sample behavior was checked; representative USOS iCalendar validation remains pending. The regression tests cover off-weekday occurrences and multiple slots on the same day.

### Public Link and Logout Checks

Create a link as owner, open it in another browser session, and verify read-only rendering with the snapshot's settings. Confirm edits appear after refresh, manual purge refreshes the snapshot, and revocation makes the link unavailable. Verify that opening a public link leaves the viewer's private local calendar and account untouched. After logout, HTTP requests with the former session must fail once KV invalidation propagates.

### Create Activation Token

```bash
curl -X POST http://localhost:8787/api/admin/token/create \
  -H "Authorization: Bearer your-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TEST_ACTIVATION_TOKEN_32_CHARS_MIN",
    "maxUses": 100
  }'
```

### Create Test User

Use the activation token from the previous step.

```bash
curl -X POST http://localhost:8787/api/user/create \
  -H "Content-Type: application/json" \
  -d '{
    "activationToken": "TEST_ACTIVATION_TOKEN_32_CHARS_MIN",
    "displayName": "Test User"
  }'
```

Save the returned `userId` and `sessionToken`.

### Create Calendar

```bash
curl -X POST http://localhost:8787/api/calendar/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
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
curl -X GET "http://localhost:8787/api/calendar/read?calendarId=YOUR_CALENDAR_ID&userId=YOUR_USER_ID" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

### Grant Access

```bash
curl -X POST http://localhost:8787/api/privilege/grant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
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
SESSION_TOKEN="your-session-token"
CALENDAR_ID="your-calendar-id"
VERSION=1

for i in {1..10}; do
  curl -X POST http://localhost:8787/api/calendar/write \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SESSION_TOKEN" \
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
    this.document.someField = param;
    await this.state.storage.put('document', this.document);
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
npm test
```

### View Worker Logs

```bash
cd worker
npm run tail
```

### Deploy Worker

```bash
cd worker
npm run deploy
```

### Deploy Frontend

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full procedures.

---

## Troubleshooting

### Worker Won't Start

Check the reported error, Node version, `worker/.dev.vars`, and bindings in `worker/wrangler.toml`. Restore dependencies with `npm ci` inside `worker/` if needed, then retry `npm run dev`.

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
