# Calendrier Worker

Cloudflare Worker backend for Calendrier multi-user calendar application.

## Features

- **Durable Objects** for document storage with mutex-based concurrency control
- **KV Storage** for caching, user data, and activation tokens
- **WebSocket Support** for real-time collaboration
- **Privilege-based Access Control** (owner, write, read)
- **Optimistic Locking** to prevent concurrent edit conflicts

## Architecture

### Durable Objects

Each calendar document is stored in a separate Durable Object instance, providing:
- Strong consistency
- Automatic geographic distribution
- Built-in state persistence
- WebSocket connection handling

### KV Namespaces

1. **CALENDAR_CACHE**: Stores cached calendar data for anonymous readers
2. **ACTIVATION_TOKENS**: Stores activation tokens for user registration
3. **USERS**: Stores user data and calendar associations

## API Endpoints

### Authentication

#### POST /api/user/create
Create a new user ID.

**Request:**
```json
{
  "displayName": "John Doe"
}
```

**Response:**
```json
{
  "userId": "uuid",
  "createdAt": 1234567890
}
```

#### POST /api/user/register
Register a user with an activation token.

**Request:**
```json
{
  "userId": "uuid",
  "activationToken": "WELCOME2024"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully"
}
```

### Calendar Management

#### POST /api/calendar/create
Create a new calendar (requires registered user).

**Request:**
```json
{
  "userId": "uuid",
  "data": {
    "title": "My Calendar",
    "courses": [],
    "settings": {}
  }
}
```

**Response:**
```json
{
  "calendarId": "uuid",
  "createdAt": 1234567890
}
```

#### POST /api/calendar/read
Read a calendar (authenticated or anonymous).

**Request:**
```json
{
  "calendarId": "uuid",
  "userId": "uuid"  // Optional
}
```

**Response:**
```json
{
  "data": { /* CalendarData */ },
  "version": 1,
  "hasWriteAccess": true,
  "updatedAt": 1234567890
}
```

#### POST /api/calendar/write
Write to a calendar (requires write access).

**Request:**
```json
{
  "calendarId": "uuid",
  "userId": "uuid",
  "data": { /* CalendarData */ },
  "version": 1
}
```

**Response:**
```json
{
  "success": true,
  "version": 2,
  "updatedAt": 1234567890
}
```

#### POST /api/calendar/list
List calendars for a user.

**Request:**
```json
{
  "userId": "uuid"
}
```

**Response:**
```json
{
  "calendars": [
    {
      "id": "uuid",
      "title": "My Calendar",
      "privilegeLevel": "owner",
      "updatedAt": 1234567890
    }
  ]
}
```

### Privilege Management

#### POST /api/privilege/grant
Grant access to another user (requires owner access).

**Request:**
```json
{
  "calendarId": "uuid",
  "granterId": "uuid",
  "targetUserId": "uuid",
  "level": "write"  // "owner", "write", or "read"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Privilege granted successfully"
}
```

#### POST /api/privilege/revoke
Revoke access from a user (requires owner access).

**Request:**
```json
{
  "calendarId": "uuid",
  "granterId": "uuid",
  "targetUserId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Privilege revoked successfully"
}
```

### WebSocket

#### GET /api/calendar/{calendarId}/ws?userId={userId}
Connect to WebSocket for real-time updates.

**Messages:**

Update message:
```json
{
  "type": "update",
  "calendarId": "uuid",
  "version": 2,
  "data": { /* CalendarData */ },
  "timestamp": 1234567890
}
```

Presence message:
```json
{
  "type": "presence",
  "calendarId": "uuid",
  "userId": "uuid",
  "displayName": "John Doe",
  "action": "join",  // or "leave"
  "timestamp": 1234567890
}
```

### Admin

#### POST /api/admin/token/create
Create an activation token (should be protected in production).

**Request:**
```json
{
  "token": "WELCOME2024",  // Optional, generates UUID if not provided
  "maxUses": 100,          // Optional
  "expiresAt": 1735689600000,  // Optional Unix timestamp
  "createdBy": "admin"     // Optional
}
```

**Response:**
```json
{
  "success": true,
  "token": "WELCOME2024",
  "createdAt": 1234567890
}
```

## Development

### Setup

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`.

### Deploy

```bash
npm run deploy
```

### View Logs

```bash
npm run tail
```

## Configuration

Edit `wrangler.toml` to configure:
- Worker name
- KV namespace bindings
- Durable Object bindings
- Compatibility date

## Testing

### Create a Test User

```bash
curl -X POST http://localhost:8787/api/user/create \
  -H "Content-Type: application/json" \
  -d '{"displayName": "Test User"}'
```

### Create an Activation Token

```bash
curl -X POST http://localhost:8787/api/admin/token/create \
  -H "Content-Type: application/json" \
  -d '{"token": "TEST123", "maxUses": 10}'
```

### Register User

```bash
curl -X POST http://localhost:8787/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID", "activationToken": "TEST123"}'
```

### Create a Calendar

```bash
curl -X POST http://localhost:8787/api/calendar/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "data": {
      "title": "Test Calendar",
      "courses": [],
      "settings": {"timeFormat": "24h", "weekStart": "Monday"}
    }
  }'
```

## Security Notes

1. **Admin Endpoint**: The `/api/admin/token/create` endpoint is currently unprotected. In production, add authentication middleware.

2. **Rate Limiting**: Consider implementing rate limiting to prevent abuse.

3. **CORS**: Currently allows all origins (`*`). In production, restrict to your frontend domain.

4. **Input Validation**: Add comprehensive input validation for all endpoints.

## Performance Considerations

### Caching Strategy

- Anonymous readers get cached data from KV (5-minute TTL)
- Registered users get live data from Durable Objects
- Cache is updated after each write operation

### Concurrency Control

- Mutex primitive ensures sequential operation execution
- Optimistic locking prevents concurrent edit conflicts
- WebSocket broadcasts updates to all connected clients

### Cost Optimization

- Use KV cache to reduce Durable Object requests
- Implement debouncing on client side to reduce write frequency
- Monitor usage in Cloudflare Dashboard

## Troubleshooting

### Durable Object Not Found

Ensure migrations are applied:
```bash
wrangler deploy
```

### KV Namespace Errors

Verify namespace IDs in `wrangler.toml` match your Cloudflare Dashboard.

### WebSocket Connection Issues

Check that:
1. User is registered
2. User has read access to the calendar
3. CORS headers are correct

## License

Unlicense (Public Domain)
