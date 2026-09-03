# ADR-004: Invitation Token Security Design

**Status:** Accepted  
**Date:** 2026-09-03  
**Milestone:** M5 — Supplier Invitations & Portal

## Context

Supplier portal invitations must be accessible to external parties (suppliers without monday accounts) via a URL. The URL contains a secret that grants read-write access to a specific quote. This token must be:

1. Unguessable by brute force
2. Revocable by the buyer at any time
3. Replaceable (regenerate link) without leaving old token valid
4. Never stored in plaintext (defense-in-depth against DB compromise)
5. Not logged in server access logs

## Decision

**Token generation:** `crypto.randomBytes(32).toString('hex')` produces 64 hex characters = 256 bits of entropy. This is cryptographically secure and resistant to brute force at any realistic scale.

**Storage:** Only the SHA-256 hash of the raw token is stored in the `supplier_invitations` collection as `tokenHash`. The raw token is returned to the buyer exactly once at invitation creation time and is never stored or logged server-side.

**Lookup:** On every portal request, the server re-hashes the incoming token and queries `{ tokenHash: hash }`. This is an O(1) indexed lookup and reveals nothing about the raw token to an attacker with DB read access.

**Revocation:** Revoking sets `status: REVOKED` on the invitation row. The token itself is not invalidated in a blocklist; instead the status check gates all access.

**Regeneration:** Replacing the token writes a new `tokenHash` to the row. The old `tokenHash` is no longer present anywhere, making the old raw token permanently inaccessible.

**Expiry:** Optional `expiresAt` ISO timestamp. Checked server-side on every portal request. Expired invitations transition to `EXPIRED` status on first access after expiry.

## Token URL Format

```
https://<portal-host>/portal?token=<rawToken>
```

The portal SPA reads the `token` query parameter and passes it as the path segment to the API:
```
GET /api/portal/invitations/<rawToken>
```

The raw token never appears in server logs at the DB level because only the hash is written.

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Attacker brute-forces token | 256 bits of entropy → infeasible |
| Attacker reads DB and finds token | Only hash stored → cannot reverse |
| Attacker replays an old URL after regenerate | Old hash no longer in DB → 404 |
| Buyer sends link to wrong supplier | Revoke immediately → 410 on next access |
| Supplier submits multiple times | Status check blocks; 409 returned |
| Token in server access logs | Token is in URL path; access logs should be configured to mask/truncate URL beyond `/api/portal/invitations/` prefix |

## Consequences

- Buyers must copy and share the raw token URL themselves (e.g. via email or the "Copy link" button). The server never emails suppliers directly.
- Once an invitation is created and the buyer dismisses the token dialog, the raw token is gone. The buyer must use "New link" (regenerate) to get a fresh URL.
- This is a deliberate choice: it ensures the buyer controls delivery and timing, and the system never handles supplier email addresses beyond storing them as metadata.
