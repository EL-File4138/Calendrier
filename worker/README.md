# Calendrier Worker

Cloudflare Worker backend for Calendrier multi-user calendar synchronization.

## Features

- Durable Objects for per-calendar document authority and WebSocket coordination.
- KV Storage for activation tokens, users, sessions, and user calendar lists.
- Session-token authenticated calendar CRUD and privilege management.
- WebSocket updates authenticated with `Sec-WebSocket-Protocol`.
- Privilege-based access control: `owner`, `write`, and `read`.
- Optimistic locking using document versions.

## Architecture

### Durable Objects

Each calendar document is stored in a separate `CalendarDO` instance keyed by calendar ID. The Durable Object owns document state, privilege checks, optimistic locking, persistence, cache cleanup, and WebSocket broadcasts.

Activation token consumption is serialized through `ActivationTokenDO`, keyed by activation token value, so limited-use tokens cannot be consumed concurrently beyond their configured limit.

### KV Namespaces

- `CALENDAR_CACHE`: Legacy namespace retained to delete stale anonymous-cache entries on calendar write/delete. New reads require authentication and go directly to Durable Objects.
- `ACTIVATION_TOKENS`: Stores activation-token records at `token:{token}`.
- `USERS`: Stores user records, session token hashes, registration markers, and user calendar metadata at `user-calendars:{userId}`.

## API Endpoints

All authenticated HTTP endpoints use `Authorization: Bearer <sessionToken>`.

### User Management

#### POST `/api/user/create`

Create a registered user using an activation token. The response includes the session token needed for subsequent authenticated requests.

Request:

```json
{
  "activationToken": "TEST_ACTIVATION_TOKEN_32_CHARS_MIN",
  "displayName": "Test User"
}
```

Response:

```json
{
  "success": true,
  "userId": "uuid",
  "createdAt": 1234567890,
  "sessionToken": "bearer-token",
  "message": "User created and registered successfully"
}
```

#### POST `/api/user/logout`

Delete the current user's session token.

Request:

```json
{
  "userId": "uuid"
}
```

### Calendar Management

#### POST `/api/calendar/create`

Create a new calendar. Requires a registered user session.

```bash
curl -X POST http://localhost:8787/api/calendar/create \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "data": {
      "title": "Test Calendar",
      "courses": [],
      "settings": {"timeFormat": "24h", "weekStart": "Monday"}
    }
  }'
```

Response:

```json
{
  "calendarId": "uuid",
  "createdAt": 1234567890
}
```

#### GET `/api/calendar/read?calendarId={id}&userId={userId}`

Read a calendar. Requires a registered user session and read access. Anonymous reads are not supported.

```bash
curl -X GET "http://localhost:8787/api/calendar/read?calendarId=CALENDAR_ID&userId=USER_ID" \
  -H "Authorization: Bearer SESSION_TOKEN"
```

Response:

```json
{
  "data": { "title": "Test Calendar", "courses": [] },
  "version": 1,
  "hasWriteAccess": true,
  "updatedAt": 1234567890
}
```

#### POST `/api/calendar/write`

Write calendar data. Requires `write` or `owner` access.

```json
{
  "calendarId": "uuid",
  "userId": "uuid",
  "data": { "title": "Updated Calendar", "courses": [] },
  "version": 1
}
```

Version conflicts currently return HTTP 200 with `success: false`, the current server version, and a conflict message.

#### POST `/api/calendar/delete`

Delete a calendar. Requires owner access. The Worker removes the calendar from user calendar lists, destroys Durable Object storage, deletes legacy cache entries, and closes WebSocket connections.

### Privilege Management

#### POST `/api/privilege/grant`

Grant access to a registered user. Requires owner access.

```json
{
  "calendarId": "uuid",
  "granterId": "owner-user-id",
  "targetUserId": "target-user-id",
  "level": "write"
}
```

#### POST `/api/privilege/revoke`

Revoke access. Owners can revoke others; users can revoke their own access.

```json
{
  "calendarId": "uuid",
  "granterId": "owner-or-self-user-id",
  "targetUserId": "target-user-id"
}
```

#### POST `/api/privilege/list`

List privileges visible to the requester. Owners see all privileges; non-owners see only their own privilege.

## WebSocket

#### GET `/api/calendar/{calendarId}/ws?userId={userId}`

Connect to calendar updates. Requires a registered session and read access. Pass the session token as a WebSocket subprotocol:

```js
const ws = new WebSocket(
  'ws://localhost:8787/api/calendar/CALENDAR_ID/ws?userId=USER_ID',
  'calendrier-session.SESSION_TOKEN'
);
```

Server messages include `update` and `presence` payloads.

## Admin Endpoints

Admin endpoints require `Authorization: Bearer <ADMIN_MASTER_TOKEN>`. The token must be at least 32 characters and should be configured as a Wrangler secret in production.

#### POST `/api/admin/token/create`

```bash
curl -X POST http://localhost:8787/api/admin/token/create \
  -H "Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"TEST_ACTIVATION_TOKEN_32_CHARS_MIN","maxUses":10}'
```

#### POST `/api/admin/token/revoke`

```bash
curl -X POST http://localhost:8787/api/admin/token/revoke \
  -H "Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"TEST_ACTIVATION_TOKEN_32_CHARS_MIN"}'
```

## Development

```bash
npm install
npm run dev
```

The local Worker runs at `http://localhost:8787`.

Use `.dev.vars` for development secrets:

```env
ADMIN_MASTER_TOKEN=<at-least-32-characters>
```

## Configuration

Edit `wrangler.toml` to configure Durable Object bindings, migrations, KV namespace IDs, compatibility settings, and observability.

Installed Wrangler version checked during M2: `4.95.0`. Worker bundling uses `esbuild` `0.28.0`. The config schema includes `build`, `compatibility_flags`, `new_classes`, `new_sqlite_classes`, and `observability`; `build.upload` is deprecated and is not used by this project.

`npm exec -- wrangler deploy --dry-run` succeeds locally with Wrangler 4 and exits before upload.

## Testing Flow

1. Create an activation token with the admin endpoint.
2. Create a user with `/api/user/create` and save both `userId` and `sessionToken`.
3. Create a calendar with `/api/calendar/create`.
4. Read/write using the returned `calendarId`, `userId`, and `sessionToken`.
5. Create a second user, grant access, verify privilege list/revoke behavior.
6. Connect WebSocket clients with the `calendrier-session.<token>` subprotocol and verify update messages.

## Security Notes

- Admin endpoints require `ADMIN_MASTER_TOKEN` using a bearer token.
- Custom activation tokens must be 32-512 bytes; omit `token` to generate a UUID.
- Session tokens are stored as SHA-256 hashes in KV and refreshed on HTTP authentication.
- WebSocket session tokens are sent through `Sec-WebSocket-Protocol`, not URL query strings.
- CORS currently allows all origins. Restrict this before production if a fixed frontend origin is known.
- Rate limiting is not implemented yet.

## License

Unlicensed.
