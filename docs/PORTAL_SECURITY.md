# Portal Security Reference

This document describes the security model for the supplier-facing portal in Milestone 5.

## Access Model

The supplier portal grants access to exactly one invitation via a cryptographic token. There are no accounts, passwords, or sessions. A supplier navigates to:

```
https://<app-host>/portal?token=<64-char-hex>
```

The token grants read-write access to:
- The invitation metadata (event name, their own company name, deadline)
- Their own quote (create/update draft, submit final)

The token grants NO access to:
- Other suppliers' quotes or invitations
- Buyer internal notes, target prices, or scoring
- Any other RFQ in the system
- The buyer's monday account details

## What the Portal API Returns

### `GET /api/portal/invitations/:token`
Returns `InvitationPublicDTO`:
```typescript
{
  id: string;
  eventReference: string;
  eventTitle: string;
  supplierName: string;      // their own name only
  status: InvitationStatus;
  expiresAt?: string;
  submittedAt?: string;
}
```

Never returns: `tokenHash`, `tenantId`, `createdByUserId`, `supplierId`, `mondayAccountId`, or any other internal/buyer field.

### `GET /api/portal/invitations/:token/quote`
Returns `QuotePublicDTO` or null:
```typescript
{
  id: string;
  status: QuoteStatus;
  lines: QuoteLine[];
  commercialTerms?: string;
  paymentTerms?: string;
  validityDays?: number;
  supplierNotes?: string;
  submittedAt?: string;
}
```

Never returns: `internalBuyerNotes`, `supplierId`, `tenantId`.

## Invitation Lifecycle

```
CREATED → OPENED → SUBMITTED
                ↘ EXPIRED (if expiresAt in the past)
CREATED/OPENED/SUBMITTED ← REVOKED (buyer action, any time before SUBMITTED)
```

HTTP status codes for portal consumers:
- `200` — invitation valid and accessible
- `404` — token not found (wrong or garbage token)
- `409` — quote already submitted
- `410` — invitation revoked or expired (Gone — permanent)
- `500` — server error (retry safe)

## Token Security Properties

- 256 bits of entropy (`crypto.randomBytes(32).toString('hex')`)
- SHA-256 hash stored in DB; raw token never persisted
- Old token permanently invalidated on regenerate (hash replaced in same row)
- Revocation: status check gates all access

## Rate Limiting

Portal endpoints: 60 requests/minute per IP (configured in Express middleware).

## Data Minimization

The server never:
- Logs raw invitation tokens
- Returns other suppliers' information to a portal request
- Returns buyer internal fields (notes, target price, internal scores)
- Returns full `SupplierInvitation` objects to portal clients (always mapped to `InvitationPublicDTO`)
- Accepts `tenantId`, `supplierId`, or `eventId` from portal requests as authorization inputs — the token determines access entirely

## Secrets Management

All secrets are stored in monday Developer Center Secrets Manager, not in source code or environment files:
- `MONDAY_SIGNING_SECRET` — used to verify buyer JWT from `monday.get("sessionToken")`
- `MNDY_MONGODB_CONNECTION_STRING` — Document DB connection (provisioned by monday; not a user secret)

No secrets are bundled in client-side JavaScript or committed to Git.
