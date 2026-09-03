# Security Overview

## Threat Model

Ariavel Sourcing is a multi-tenant SaaS app embedded in monday.com. The primary threats are:

1. **Cross-tenant data leakage** — tenant A reading tenant B's suppliers or sourcing events
2. **Supplier portal abuse** — a portal user accessing buyer-side data or other suppliers' quotes
3. **Injection attacks** — NoSQL operator injection via request payload
4. **Token forgery** — crafting JWTs to impersonate a buyer account
5. **Overly large payloads** — denial-of-service via body flooding

---

## Authentication & Authorisation

### Buyer API

All `/api/buyer/**` routes require a valid monday.com session JWT in the `Authorization: Bearer <token>` header.

The JWT must be signed with the `MONDAY_CLIENT_SECRET` and contain:

```json
{
  "dat": {
    "account_id": 12345678,
    "user_id": 42
  }
}
```

`user_id` must be a positive integer. String user IDs are rejected with 401.

Tenant ID is derived exclusively as `monday-account-{account_id}`. Any `tenantId` field in the request body is silently ignored.

### Supplier Portal

Portal routes (`/api/portal/**`) are authenticated via single-use invitation tokens. These are:
- Cryptographically random (128-bit hex)
- Stored as bcrypt hashes (`tokenHash`)
- Rate-limited to 60 requests/minute
- Never exposed in listing or audit APIs

---

## Tenant Isolation

Every data access is scoped to `tenantId`. In-memory and storage repositories filter by `tenantId` before returning results.

Key invariant: **tenant identity is set once from the verified JWT and never overridden by request body fields.**

Test coverage: `tests/tenantIsolation.test.ts` — 12 tests including cross-tenant read isolation and body injection resistance.

---

## Injection Protection

### NoSQL Injection

The `noSqlInjectionMiddleware` (`src/server/middleware/noSqlInjection.ts`) recursively scans request bodies and rejects any payload containing keys that start with `$` or contain `.` (MongoDB-style operators).

Depth-limited traversal (max 5 levels) prevents stack overflow on deeply nested payloads.

Returns HTTP 400 with `{ "error": "Invalid request payload" }`.

### SQL / Command Injection

The app has no SQL database and no shell command execution. Not applicable.

### XSS

Server responses are JSON only. The frontend is served as a static bundle from monday.com hosting infrastructure. The CSP `defaultSrc: 'self'` prevents inline script execution.

---

## Content Security Policy

```
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
connect-src 'self' https://*.monday.com
frame-src 'none'
object-src 'none'
base-uri 'self'
form-action 'self'
```

`crossOriginEmbedderPolicy` is disabled — required for monday.com iframe embedding.

---

## Transport Security

- All traffic in production uses HTTPS (enforced by monday.com hosting)
- CORS: `origin: false` — blocks cross-origin browser requests
- `X-Content-Type-Options: nosniff` via Helmet defaults
- `X-Frame-Options: SAMEORIGIN` via Helmet (overridden to allow monday iframe)

---

## Rate Limiting

| Route group | Window | Limit |
|---|---|---|
| `/api/buyer/**` | 60 seconds | 200 requests |
| `/api/portal/**` | 60 seconds | 60 requests |

---

## Request Size Limits

`express.json({ limit: '256kb' })` — requests exceeding 256 KB body size receive HTTP 413.

---

## Observability

Every response includes `X-Request-ID` (16-char hex, `randomBytes(8).toString('hex')`). This allows correlating client errors with server logs.

---

## Portal Data Exposure

The supplier portal `toPublicDTO()` function strips:

| Field | Reason |
|---|---|
| `tenantId` | Internal — must not be exposed to portal users |
| `tokenHash` | Credential — bcrypt hash of the portal token |
| `supplierNameSnapshot` | Renamed to `supplierName` in public DTO |
| `targetPrice` | Buyer-internal negotiation data |
| `buyerNotes` | Buyer-internal notes |
| Audit log entries | Internal compliance records |

---

## Secrets Management

Required secrets at runtime (never committed):

| Secret | Purpose |
|---|---|
| `MONDAY_CLIENT_SECRET` | JWT signature verification |
| `MONDAY_SIGNING_SECRET` | Webhook signature verification |

Both must be set as environment variables in the monday Code deployment environment.

---

## Dependency Security

Run `npm audit` before each release. The baseline audit result is documented in `RELEASE_CHECKLIST.md`.
