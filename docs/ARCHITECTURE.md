# Architecture

The app is a React + TypeScript + Vite client designed to run as a monday Custom Object (AppFeatureObject). `App` composes the shell and feature UI; domain types and validation live under `src/shared`; data access is behind repository interfaces consumed by service layer; React components never touch GraphQL or storage directly.

## Runtime layer (Milestone 3)

`MondayRuntimeAdapter` is the single seam between browser code and the monday SDK. In the MONDAY runtime it wraps `monday-sdk-js@0.5.9`, pinning `apiVersion: '2026-07'`. In LOCAL_DEVELOPMENT and TEST modes a mock is injected; components and services are unaware of the difference.

`detectRuntimeMode()` resolves `RuntimeMode.TEST` (process.env.NODE_ENV === 'test'), `RuntimeMode.MONDAY` (window.self !== window.top), or `RuntimeMode.LOCAL_DEVELOPMENT`. This eliminates any SDK call in test environments.

`MondayTenantContextProvider` calls `runtime.getContext()` and extracts `context.account.id` as the canonical tenant identifier. It throws on missing or empty account ID. No path exists for a caller to supply a tenant ID directly.

`RuntimeCapabilities` derives `canViewSuppliers`, `canEditAriavelSuppliers`, and `canConfigureSupplierSource` from the monday context user object. Capability checks happen in `SuppliersPage` — no capability enforcement is placed in service or repository layers.

The initial repository contract is intentionally small. As RFQs mature, add use-case services and repository methods around the domain model rather than placing monday queries in components.

## Supplier domain

The existing `Supplier` domain type now carries a stable Ariavel ID, tenant ID, optional monday board/item references, procurement identity and contact fields, commercial defaults, lifecycle status, preferred metadata, manual rating, source type and timestamps. `normalizeSupplierInput` and `validateSupplierInput` keep domain rules independent from forms.

Statuses are `ACTIVE`, `PENDING`, `INACTIVE` and `BLOCKED`. Source types are `ARIAVEL`, `MONDAY_BOARD` and `IMPORT`; only Ariavel-managed and existing-board setup are exposed in Milestone 2.

## Tenant context and repository

`MondayTenantContextProvider` is the production tenant source. `DevelopmentTenantContextProvider` is the local-development mock. Both implement the same interface. Tenant IDs are never accepted from form values, query strings, URLs, or localStorage.

`SupplierRepository` requires a tenant context for list, get, create, update, status change, and source-configuration operations. `MondayStorageSupplierRepository` is the M3 production implementation: it uses `MondayRuntimeAdapter.storage` (global scope) with per-supplier keys (`ariavel:supplier:<id>`), a shared index key (`ariavel:supplier-index`), and optimistic concurrency via the `previous_version` token. A lazy schema-version key (`ariavel:schema-version`) guards future migrations. Corrupt JSON in storage is silently skipped. `createInMemorySupplierRepository` remains the local/test adapter.

`SupplierService` coordinates tenant resolution, validation, normalization, search/filtering, summaries, repository writes, board-provider access, mapping validation, previews, and board-item pagination. The `listBoardSuppliers()` method fetches up to 20 pages of `items_page(limit: 500)` results via the board provider and transforms each item through `transformMondayItemToInput`. React receives the service as a dependency and never knows which storage or board adapter is active.

## Board provider and mapping

`MondayBoardProvider` returns internal `MondayBoardDescriptor` and `MondayColumnDescriptor` values rather than raw GraphQL responses. `mockMondayBoardProvider` supplies fictional development boards and sample rows.

Column compatibility, mapping validation and preview transformation live in `src/shared/mapping`. Supplier Name is the only required mapping. Optional missing mappings do not block setup; potentially incompatible column types produce warnings. A future authenticated monday adapter can translate current API responses into the same descriptors without changing service or UI contracts.

## Board provider

`MondayApiBoardProvider` is the M3 production board provider. `listBoards()` calls `boards(state: active, limit: 100)`. `getBoard(id)` fetches columns via a second query and five sample items. `listBoardItems(boardId, cursor?)` uses `items_page(limit: 500)` with cursor pagination; the cursor is `null` on the final page. Column values are read from `column_values[].text` (the human-readable display string, not raw JSON). `mockMondayBoardProvider` is retained for local development.

`transformMondayItemToInput` normalises status aliases (Approved/Enabled → ACTIVE, Onboarding/New → PENDING, Disabled/Archived → INACTIVE, Suspended/Banned → BLOCKED), boolean columns (true/yes/1/checked → true), integer ratings (1–5 only), and emits `SourceWarning` for values that cannot be mapped cleanly. Items without a resolved name are skipped with a warning.

## Sourcing Event domain (Milestone 4)

`SourcingEvent` is the core procurement workflow entity. Each event carries identity fields (`id`, `tenantId`, `reference`, `title`, `currency`), lifecycle status, an ordered array of `SourcingLine` items, an array of `SourcingSupplierSelection` snapshots capturing supplier state at selection time, deadline/delivery dates, notes, owner, and audit timestamps.

`SourcingEventStatus` lifecycle: `DRAFT → READY_FOR_INVITATION | CANCELLED`; `READY_FOR_INVITATION → DRAFT | CANCELLED`; `CANCELLED` is terminal. `changeStatus` to `READY_FOR_INVITATION` runs `validateReadyForInvitation` first (requires title, reference, currency, ≥1 line, ≥1 supplier).

References follow the format `RFQ-YYYY-XXXXX` with 5 characters from an unambiguous charset (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) — no sequential counter, no monotonic dependency.

`SourcingEventRepository` mirrors the supplier repository interface contract. `MondayStorageSourcingEventRepository` uses a separate key namespace (`ariavel:sourcing-event:*`) from suppliers, with the same optimistic concurrency pattern. See ADR-002 for the storage rationale and migration trigger conditions.

`SourcingEventService` provides: `list(filters)`, `get`, `getSummary`, `generateReference`, `create`, `update`, `changeStatus`, `addLine`, `updateLine`, `removeLine`, `duplicateLine`, `listEligibleSuppliers` (ACTIVE only), `buildSupplierSelection`, `validateReady`, `duplicate`.

`SourcingEventsPage` renders summary cards, a searchable/filterable desktop table and responsive mobile cards, a multi-step Create/Edit Wizard (Details → Line Items → Suppliers → Review), and an `EventDetailDrawer` with tabbed Overview/Lines/Suppliers view.

The Create Event Wizard uses `useReducer` for state management. Step 1 validates reference/title/currency before advancing. Step 2 manages line items with add/remove/duplicate. Step 3 loads `listEligibleSuppliers()` on mount, filtered to ACTIVE only. Step 4 shows a full review with `validateReadyForInvitation` preview errors and email-missing warnings.

## Server-side backend (Milestone 5)

`src/server/` is a Node.js Express application hosted via monday Code (port 8080). It has two route groups:
- `/api/buyer/*` — JWT-authenticated buyer routes. Every request must carry `Authorization: Bearer <monday-sessionToken>`. The `buyerAuth` middleware verifies the JWT using `MONDAY_SIGNING_SECRET` (from SecretsManager). `tenantId` is derived exclusively from the verified JWT (`monday-account-{accountId}`). No client-supplied tenantId is trusted.
- `/api/portal/*` — Token-authenticated supplier portal routes. The raw 64-char hex token in the URL path is hashed (SHA-256) and looked up in Document DB. No session or account is required.

`InvitationService` manages the full `SupplierInvitation` lifecycle (CREATED → OPENED → SUBMITTED | EXPIRED | REVOKED). It uses `generateRawToken` + `hashToken` from `src/server/utils/tokens.ts` for cryptographic token management. The raw token is returned to the caller once and never stored. See ADR-003 and ADR-004.

`QuoteService` manages `SupplierQuote` with upsert-draft and final-submit semantics. Submitted quotes are immutable (any further draft attempt returns `QuoteAlreadySubmittedError`). The `version` field increments on every upsert or submit.

`AuditRepository` logs all state changes to a dedicated `audit_events` collection with actor type, actor ID, entity type, and optional metadata.

Document DB collections: `supplier_invitations`, `supplier_quotes`, `audit_events`. Each query MUST include a `tenantId` filter — this is enforced in the repository methods. See DATA_MODEL.md for the full schema.

In-memory adapters (`inMemoryInvitationRepository`, `inMemoryQuoteRepository`, `inMemoryAuditRepository`) are used in all tests and local development. No real DB connection is required to run tests.

The buyer-side React app communicates with the server via `BuyerApiClient` (`src/frontend/api/buyerApiClient.ts`), which reads the sessionToken from `monday.get("sessionToken")` and sends it as a Bearer header.

## Future adapters

- Replace `MondayStorageSupplierRepository` or `MondayStorageSourcingEventRepository` with Document DB adapters if query complexity or record volume warrants it; no React or service changes are required (see ADR-001, ADR-002).
- Extend board discovery to support item-creation write-back once a write scope is added.
- Keep GraphQL, tokens, credentials, and authorization enforcement outside React.
- Add email delivery (via monday Webhooks or a provider) to notify suppliers of invitations; currently buyers copy/share the portal link manually.
