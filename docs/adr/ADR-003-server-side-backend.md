# ADR-003: Server-Side Node.js Backend with Monday Code

**Status:** Accepted  
**Date:** 2026-09-03  
**Milestone:** M5 — Supplier Invitations & Portal

## Context

Milestone 4 used `monday.storage` (client-side key-value store) as the sole persistence layer. That is adequate for buyer-owned draft data, but invitation tokens and supplier quotes require:

1. **Cryptographic token lifecycle** — raw tokens must never be stored; only SHA-256 hashes; tokens must be revocable and regeneratable per invitation.
2. **Persistent supplier portal access** — external suppliers have no monday accounts; they need a durable URL that survives browser sessions across multiple days.
3. **Quote versioning** — draft saves must be tracked with versions; submitted quotes must be immutable.
4. **Audit trail** — every state change (invitation opened, quote saved, quote submitted) must be permanently recorded for compliance.
5. **Tenant-authoritative writes** — tenant identity must come from a server-verified JWT, never from the client.

None of these are achievable with `monday.storage` alone.

## Decision

Introduce a **Node.js Express server** hosted via **monday Code**, listening on port 8080, backed by **monday Document DB** (`MNDY_MONGODB_CONNECTION_STRING`).

The server exposes two route groups:
- `/api/buyer/*` — authenticated buyer routes (JWT from `monday.get("sessionToken")`, verified with signing secret from SecretsManager)
- `/api/portal/*` — unauthenticated supplier portal routes (authenticated by raw invitation token in URL path)

## Architecture

```
Browser (buyer)
  → monday SDK → sessionToken JWT
  → POST /api/buyer/events/:id/invitations
  → [buyerAuth middleware] → verify JWT → derive tenantId = monday-account-{accountId}
  → InvitationService.create → SHA-256 hash stored in DB → raw token returned once

Supplier browser (no monday account)
  → GET /api/portal/invitations/:rawToken
  → hash incoming token → lookup in DB → transition CREATED → OPENED
  → never exposes tokenHash, tenantId, createdByUserId, or any other buyer/internal fields
```

## Consequences

**Positive:**
- Cryptographic separation: raw token exists only in URL, never in DB or logs.
- Tenant isolation is enforced server-side from verified JWT; no client-supplied tenantId is trusted.
- Document DB provides persistence, query capability, and versioning beyond `monday.storage` limits.
- Server deploy is independent from client deploy; each can update separately.

**Negative:**
- Adds operational complexity: server process, DB connection string secret, signing secret.
- Requires monday Developer Center action to set up Document DB and deploy server code.
- In development/testing, in-memory repositories substitute for real DB (no external dependency in tests).

## Alternatives Rejected

- **All-client approach:** Cannot store hashed tokens server-side; cannot enforce tenant isolation without server trust boundary.
- **Third-party backend (e.g. Supabase, Vercel):** Violates the constraint of not adding paid external services.
- **monday Storage with encrypted tokens:** Still requires secret management on client; does not solve audit trail or quote versioning.

## Implementation Notes

- Token generation: `crypto.randomBytes(32).toString('hex')` → 64-char hex string
- Token hashing: `createHash('sha256').update(rawToken).digest('hex')`
- JWT verification: `jwt.verify(token, signingSecret)` where secret comes from `SecretsManager().get("MONDAY_SIGNING_SECRET")`
- tenantId derivation: `monday-account-{accountId}` from verified JWT payload
- All DB queries include `tenantId` as a mandatory filter
