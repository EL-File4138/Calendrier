# Production Deployment

This document provides procedures for deploying Calendrier to production.

Release candidates: frontend `0.1.0-rc.2`, Worker `1.0.1-rc.2`.

## Prerequisites

**Required:**
- Node.js 22.12+ and npm
- Cloudflare account (for backend)
- Wrangler CLI is installed from the Worker lockfile (`4.95.0`); use the local script instead of a global install.

**Optional:**
- Vercel/Netlify account (for frontend hosting)
- OpenSSL (for generating secure tokens)

---

## Backend Deployment (Cloudflare Workers)

### 1. Authenticate with Cloudflare (CLI workflow)

```bash
wrangler login
```

Follow the browser prompt to authorize Wrangler.

### 2. Create KV Namespaces (new environments only)

```bash
cd worker

# Create production namespaces
wrangler kv namespace create "CALENDAR_CACHE"
wrangler kv namespace create "ACTIVATION_TOKENS"
wrangler kv namespace create "USERS"

# Create preview namespaces
wrangler kv namespace create "CALENDAR_CACHE" --preview
wrangler kv namespace create "ACTIVATION_TOKENS" --preview
wrangler kv namespace create "USERS" --preview
```

Copy the namespace IDs from the output.

This repository already has production IDs in `worker/wrangler.toml`. Do not create replacement namespaces during a routine release. Preserve the existing Durable Object migrations (`v1` and `v2`) and bindings.

### 3. Configure KV Namespace IDs

For a new environment, edit `worker/wrangler.toml` and update the namespace IDs:

```toml
[[kv_namespaces]]
binding = "CALENDAR_CACHE"
id = "your-production-id-here"
preview_id = "your-preview-id-here"

[[kv_namespaces]]
binding = "ACTIVATION_TOKENS"
id = "your-production-id-here"
preview_id = "your-preview-id-here"

[[kv_namespaces]]
binding = "USERS"
id = "your-production-id-here"
preview_id = "your-preview-id-here"
```

### 4. Set Admin Master Token

Generate a secure token:

```bash
openssl rand -hex 32
```

Set it as a Cloudflare secret only when provisioning a new environment or rotating the existing secret:

```bash
wrangler secret put ADMIN_MASTER_TOKEN
```

Paste the generated token when prompted. The token must be at least 32 characters.

### 5. Deploy Worker

```bash
cd worker
npm ci
npm test
npm run deploy
```

The current deployment target is `https://calendrier-worker.elfile4138.workers.dev`. Confirm the URL after deployment if the account subdomain changes.

If Wrangler reports multiple available accounts in non-interactive mode, configure `account_id` in `worker/wrangler.toml` or set `CLOUDFLARE_ACCOUNT_ID` for the target account before deploying.

### 6. Create Initial Activation Token

Create a token for initial user registration:

```bash
curl -X POST https://your-worker-url.workers.dev/api/admin/token/create \
  -H "Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "maxUses": 10,
    "expiresAt": 1893456000000,
    "createdBy": "admin"
  }'
```

Save the returned token value for user registration.

---

## Frontend Deployment

Deploy the Worker before building the frontend. Upload the resulting `dist/` directory to the frontend host.

### 1. Configure Environment

Update `.env` with your worker URL:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_WORKER_URL=https://your-worker-url.workers.dev
```

### 2. Build Frontend

```bash
npm ci
npm run build
```

The build output is `dist/`. Set `VITE_WORKER_URL` to the deployed Worker URL at build time. The service worker caches static shell assets under a release-specific cache name and excludes `/api/` requests; public snapshot refreshes therefore require network access.

### 3. Deploy to Hosting Platform

**Vercel:**

```bash
vercel deploy --prod
```

**Netlify:**

Drag the `dist/` folder to the Netlify dashboard, or connect your Git repository with:
- Build command: `npm run build`
- Publish directory: `dist`

**Cloudflare Pages:**

```bash
wrangler pages deploy dist
```

**GitHub Pages:**

```bash
npm run build
# Push dist/ folder to gh-pages branch
```

---

## Post-Deployment Verification

### Backend Verification

Test the worker is responding:

```bash
curl https://your-worker-url.workers.dev/api/admin/token/create \
  -H "Authorization: Bearer WRONG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response: `{"success":false,"error":"Unauthorized - Invalid admin token"}`

Also verify public input handling:

```bash
curl -i https://calendrier-worker.elfile4138.workers.dev/api/public/read \
  -H 'Content-Type: application/json' \
  -d '{}'
```

The deployed router currently returns `404` for `/api/public/read` without a valid link body; management input validation returns `400` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Use the public-link flow in the frontend for an authenticated end-to-end check.

Test token creation works:

```bash
curl -X POST https://your-worker-url.workers.dev/api/admin/token/create \
  -H "Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxUses": 1}'
```

Expected response: `{"success":true,"token":"...","createdAt":...}`

### Frontend Verification

Open your deployed frontend URL in a browser and verify:

1. Application loads without errors
2. All static assets load via HTTPS
3. Server-mode account creation accepts a valid activation token
4. Calendar create/read/write actions work with the returned `sessionToken`
5. Public links render read-only data without loading the viewer's private account or calendar

### Integration Testing

Test the full stack:

1. Open your frontend in a browser
2. Click the User Status button
3. Create account with activation token
4. Create a server calendar
5. Reload the page and verify the calendar is restored from the Worker
6. Open a second browser session with another registered user, grant access, and verify WebSocket updates

---

## Security Configuration

### Update CORS (Optional)

By default, the Worker allows all origins. To restrict to your frontend domain, edit the `corsHeaders` object in `worker/src/index.ts`:

```typescript
'Access-Control-Allow-Origin': 'https://your-frontend-domain.com',
```

### Configure Rate Limiting (Recommended)

Consider implementing rate limiting for production. Add to `worker/src/index.ts`:

```typescript
// Example: Track requests per IP
const rateLimitKey = request.headers.get('cf-connecting-ip');
// Implement rate limiting logic
```

---

## Monitoring

### Enable Cloudflare Analytics

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. Enable Analytics

### Monitor Error Rates

View real-time logs:

```bash
cd worker
npm run tail
```

Set up alerts for high error rates in the Cloudflare dashboard.

---

## Maintenance

### Rotate Admin Master Token

Generate a new token:

```bash
openssl rand -hex 32
```

Update the secret:

```bash
wrangler secret put ADMIN_MASTER_TOKEN
```

### Manage Activation Tokens

Create new tokens:

```bash
curl -X POST https://your-worker-url.workers.dev/api/admin/token/create \
  -H "Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "maxUses": 100,
    "expiresAt": 1893456000000,
    "createdBy": "admin@example.com"
  }'
```

Revoke compromised tokens:

```bash
curl -X POST https://your-worker-url.workers.dev/api/admin/token/revoke \
  -H "Authorization: Bearer YOUR_ADMIN_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "TOKEN_TO_REVOKE"}'
```

---

## Rollback Procedures

### Rollback Worker

```bash
cd worker
wrangler rollback
```

Or deploy a specific version:

```bash
wrangler versions list
wrangler versions deploy <version-id>
```

### Rollback Frontend

**Vercel:**
Use the Vercel dashboard to rollback to a previous deployment.

**Netlify:**
Deploy a previous build from the dashboard.

**Cloudflare Pages:**
```bash
wrangler pages deployment list
wrangler pages deployment rollback <deployment-id>
```

---

## Troubleshooting

### Worker Not Responding

Check the Cloudflare dashboard for errors. Verify:
- KV namespace IDs are correct in `wrangler.toml`
- ADMIN_MASTER_TOKEN secret is set
- Worker deployed successfully

### Authentication Failing

Verify:
- ADMIN_MASTER_TOKEN is at least 32 characters
- Authorization header format: `Bearer <token>`
- Token matches what was set in secrets

### Frontend Cannot Connect

Verify:
- `.env` has correct worker URL
- Worker URL uses HTTPS
- CORS headers allow your frontend domain

### WebSocket Issues

Check:
- User is registered
- User has read access to calendar
- Client sends `Sec-WebSocket-Protocol: calendrier-session.<sessionToken>`
- Worker supports WebSocket upgrade

---

## Environment Variables Reference

**Frontend (.env):**
```env
VITE_WORKER_URL=https://your-worker-url.workers.dev
```

**Backend (Cloudflare Secret):**
```bash
ADMIN_MASTER_TOKEN=<64-character-hex-string>
```

**Backend (wrangler.toml):**
- CALENDAR_DO (Durable Object binding)
- CALENDAR_CACHE (KV namespace)
- ACTIVATION_TOKENS (KV namespace)
- USERS (KV namespace)

---

## Support

For issues or questions:
- Review logs: `wrangler tail`
- Check Cloudflare dashboard for errors
- Verify all configuration matches this guide
- Consult [DEVELOPMENT.md](./DEVELOPMENT.md) for API reference
