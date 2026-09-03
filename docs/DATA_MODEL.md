# Data Model Reference — Milestone 5

## Storage Layers

| Layer | Contents | Technology |
|-------|----------|-----------|
| `monday.storage` (global scope) | Supplier records, Sourcing Events (RFQs) | monday client-side KV |
| Document DB | Invitations, Quotes, Audit events | MongoDB via `MNDY_MONGODB_CONNECTION_STRING` |

## Document DB Collections

### `supplier_invitations`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | BSON ObjectId as hex |
| `tenantId` | string | `monday-account-{accountId}` from verified JWT |
| `eventId` | string | References SourcingEvent ID in monday.storage |
| `eventReference` | string | Human-readable reference snapshot (e.g. `RFQ-2026-001`) |
| `eventTitleSnapshot` | string | Event title at time of invitation |
| `supplierId` | string | References Supplier ID in monday.storage |
| `supplierNameSnapshot` | string | Supplier name at time of invitation |
| `supplierEmailSnapshot` | string | Email at time of invitation |
| `supplierCodeSnapshot` | string? | Supplier code at time of invitation |
| `tokenHash` | string | SHA-256 of raw token; indexed; never raw token |
| `status` | enum | `CREATED \| OPENED \| SUBMITTED \| EXPIRED \| REVOKED` |
| `createdAt` | ISO string | |
| `updatedAt` | ISO string | |
| `createdByUserId` | string | monday userId from JWT |
| `openedAt` | ISO string? | First time supplier opens portal |
| `submittedAt` | ISO string? | Time of quote submission |
| `expiresAt` | ISO string? | Optional expiry; checked server-side |
| `revokedAt` | ISO string? | |
| `revokedByUserId` | string? | |
| `regeneratedAt` | ISO string? | Last token regeneration |
| `regeneratedByUserId` | string? | |

**Indexes:** `{ tenantId, eventId }`, `{ tokenHash }` (unique)

### `supplier_quotes`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | BSON ObjectId as hex |
| `tenantId` | string | From verified JWT |
| `invitationId` | string | References `supplier_invitations.id` |
| `eventId` | string | Denormalized for list queries |
| `supplierId` | string | |
| `supplierNameSnapshot` | string | |
| `status` | enum | `DRAFT \| SUBMITTED` |
| `lines` | QuoteLine[] | Array of line-level responses |
| `commercialTerms` | string? | |
| `paymentTerms` | string? | |
| `validityDays` | number? | |
| `supplierNotes` | string? | Visible to buyer after submission |
| `internalBuyerNotes` | string? | Never exposed to supplier portal |
| `version` | number | Incremented on every upsert/submit |
| `createdAt` | ISO string | |
| `updatedAt` | ISO string | |
| `submittedAt` | ISO string? | Set on final submission; quote becomes read-only |

**QuoteLine:**
```typescript
{
  lineId: string;         // references SourcingLine.id
  lineDescription: string;
  unitPrice?: number;
  currency?: string;
  leadTimeDays?: number;
  moq?: number;           // minimum order quantity
  notes?: string;
}
```

**Indexes:** `{ tenantId, invitationId }` (unique-ish; one active quote per invitation), `{ tenantId, eventId }`

### `audit_events`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | BSON ObjectId as hex |
| `tenantId` | string | |
| `action` | enum | See below |
| `entityId` | string | ID of invitation or quote |
| `entityType` | enum | `invitation \| quote` |
| `actorType` | enum | `buyer \| supplier` |
| `actorId` | string | userId (buyer) or supplierId (supplier) |
| `timestamp` | ISO string | |
| `metadata` | object? | Additional context |

**Actions:** `INVITATION_CREATED`, `INVITATION_OPENED`, `INVITATION_REVOKED`, `INVITATION_REGENERATED`, `INVITATION_EXPIRED`, `QUOTE_DRAFT_SAVED`, `QUOTE_SUBMITTED`

**Indexes:** `{ tenantId, entityId }`, `{ tenantId, timestamp }`

## Immutability Rules

- A `SUBMITTED` quote cannot be modified (HTTP 409 if attempted)
- A `REVOKED` invitation cannot be opened (HTTP 410)
- An `EXPIRED` invitation cannot be opened (HTTP 410)
- A `SUBMITTED` invitation cannot be revoked (HTTP 409)
- Submitted quotes are read-only; `internalBuyerNotes` can be added by buyers via a future milestone

## Snapshot Rationale

Invitation and quote records store name/email snapshots because buyer data in monday.storage can be edited after invitations are sent. Snapshots preserve the audit trail and ensure quotes remain coherent even if supplier records are updated.
