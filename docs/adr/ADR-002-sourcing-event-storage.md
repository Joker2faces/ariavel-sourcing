# ADR-002: Sourcing Event Persistence Strategy

**Status:** Accepted  
**Date:** 2026-09-02  
**Deciders:** Ariavel engineering

---

## Context

Milestone 4 introduces `SourcingEvent` — the core procurement workflow object. Each event contains identity fields, an ordered list of `SourcingLine` items, a list of `SourcingSupplierSelection` snapshots, lifecycle status, deadlines, notes, and audit fields. The data must persist across page loads within the monday Custom Object runtime.

Available persistence mechanisms inside the monday Apps Framework at this milestone:

| Option | Scope | Limit | Cost |
|---|---|---|---|
| `monday.storage` (global) | Account-wide | 25 MB total, 6 MB per value | Included |
| `monday.storage` (instance) | Board item | 25 MB total, 6 MB per value | Included |
| External Document DB | External | Unbounded | Requires backend service |
| monday WorkDoc / Custom Object fields | Board-level | Structured fields only | Schema locked |

---

## Decision

**Use `monday.storage` in global scope**, following the same pattern established in ADR-001 for suppliers.

Sourcing events use a separate namespace (`ariavel:sourcing-event:*`) to avoid key collision with the supplier namespace (`ariavel:supplier:*`):

- `ariavel:sourcing-event-schema-version` — lazy migration guard
- `ariavel:sourcing-event-index` — ordered list of event IDs for the tenant
- `ariavel:sourcing-event:<id>` — one key per event (JSON serialized `SourcingEvent`)

Optimistic concurrency reuses the `previous_version` token pattern from `MondayStorageSupplierRepository`.

---

## Consequences

**Good:**
- Zero backend infrastructure required at this milestone.
- Consistent with supplier storage pattern — same runtime seam, same test harness.
- Global scope ensures events are visible to all users in the account, matching RFQ collaboration semantics.
- Tenant ID from authenticated monday context prevents cross-tenant data leakage.

**Risks / limitations:**
- 6 MB per key limits event size. A single event with hundreds of lines and suppliers could approach the limit; mitigated by the expected p99 event size being well under 100 KB.
- 25 MB total storage is shared with suppliers. At ~50 KB per event, the account can hold ~400 events before nearing quota.
- monday.storage does not support server-side querying; all filtering happens client-side after fetching the full list.
- No real-time sync across browser tabs; page must be reloaded to see changes from other users.

---

## Migration trigger to Document DB

Migrate to an external Document DB when **any** of the following occur:

1. Total events per account reaches **300** (75% of practical 25 MB quota).
2. Any single event JSON exceeds **3 MB** (50% of per-value limit).
3. Filter/search latency exceeds **500 ms** consistently (indicative of list fetch size).
4. Multi-user real-time collaboration becomes a product requirement.
5. monday.storage global scope is deprecated by the platform.

The `InMemorySourcingEventRepository` and the repository interface remain the seam; only the adapter changes on migration.
