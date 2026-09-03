# ADR-001: Persistent supplier storage — monday.storage vs Document DB

**Status:** Accepted
**Date:** 2026-09-03
**Milestone:** M3 — Real Monday Runtime & Persistent Data Foundation

## Context

Ariavel Sourcing needs a place to persist supplier records and source configuration across sessions for each customer tenant. Two options were available inside the monday Apps Framework:

1. **monday.storage** — a key-value store exposed to client-side apps via the `monday-sdk-js` SDK with `getItem`, `setItem`, and `deleteItem`. Global scope is available (not bound to a specific board instance). Supports optimistic concurrency via a `previous_version` identifier returned by every `setItem` and passed as an argument to the next write.

2. **monday Document DB** — a structured document store with collection-level queries, indexing, and richer filtering. Exposed through a backend API or server-side SDK (`@mondaycom/apps-sdk`). Requires a server-side runtime (Node.js). Not available to client-side bundle code.

## Decision

Use **monday.storage (global scope)** for M3.

## Rationale

### monday.storage advantages

- Works directly inside a client-side Custom Object — no server runtime needed, no Ariavel-managed backend infrastructure to stand up.
- Seamlessly authenticated through the monday postMessage proxy; no personal token, no OAuth exchange, no secret management for data reads/writes.
- Global scope means supplier records are available to every instance of the app within the workspace regardless of which board it is embedded on.
- `previous_version` gives lightweight optimistic concurrency protection sufficient for the current single-writer-per-tenant usage pattern.
- Per-supplier keys (`ariavel:supplier:<id>`) plus an index key (`ariavel:supplier-index`) keeps reads granular — no need to deserialize the full supplier roster for single-record operations.
- Schema version key (`ariavel:schema-version`) enables forward-compatible migrations without downtime.

### Document DB trade-offs not worth taking in M3

- Document DB requires a server-side Node.js process, meaning Ariavel would need to stand up, secure, and operate a backend service before a single record can be written.
- Server-side authentication introduces a new secret management surface (Client ID, Client Secret, Signing Secret handling on backend) outside the scope of what has been approved and designed for M3.
- Query complexity (collection-level filtering, indexing) exceeds what M3 supplier operations require: list-all, get-by-id, create, update, delete, count.

### Accepted limitations

- Storage is key-value; complex filtering (multi-column sort, cross-tenant aggregate reports) will require fetching all supplier keys and sorting in memory. This is acceptable for tenant populations expected in the marketplace launch window.
- Global storage keys must be namespaced carefully. All keys use `ariavel:` prefix to avoid collisions.
- Storage quota limits apply. If a tenant exceeds the storage quota for a single app, records at the tail will fail to write. This is logged as `StorageVersionConflictError` and surfaced to the service layer.
- Document DB remains the correct choice when query complexity or record volume grows to warrant it. The `SupplierRepository` interface isolates React and the service layer from the adapter; replacing `MondayStorageSupplierRepository` with a Document DB adapter requires no component changes.

## Consequences

- `MondayStorageSupplierRepository` implements the existing `SupplierRepository` interface using `MondayRuntimeAdapter.storage`.
- The `StorageVersionConflictError` is thrown on concurrent-write detection and propagates to the service layer for caller handling.
- Lazy schema initialization writes `ariavel:schema-version = "1"` on first use; future schema changes can increment this value and migrate records on read.
- Future Document DB migration is a straight interface swap with no React changes required.
