# Architecture

The app is a React + TypeScript + Vite client designed to run as a monday Custom Object. `App` composes the shell and feature UI; domain types and validation live under `src/shared`; data access is behind `SourcingRepository` and consumed by `sourcingService`.

The current `mockSourcingRepository` is replaceable with a monday Document DB repository or a backend API without coupling React components to GraphQL. Backend credentials and tenant-aware operations belong in `src/backend` only. Every persisted record must carry a tenant boundary derived from authenticated monday context; a client-supplied account ID must never be trusted as authorization.

The initial repository contract is intentionally small. As RFQs mature, add use-case services and repository methods around the domain model rather than placing monday queries in components.

## Supplier domain

The existing `Supplier` domain type now carries a stable Ariavel ID, tenant ID, optional monday board/item references, procurement identity and contact fields, commercial defaults, lifecycle status, preferred metadata, manual rating, source type and timestamps. `normalizeSupplierInput` and `validateSupplierInput` keep domain rules independent from forms.

Statuses are `ACTIVE`, `PENDING`, `INACTIVE` and `BLOCKED`. Source types are `ARIAVEL`, `MONDAY_BOARD` and `IMPORT`; only Ariavel-managed and existing-board setup are exposed in Milestone 2.

## Tenant context and repository

`DevelopmentTenantContextProvider` is the single mock tenant source. It is deliberately named as development-only and must later be replaced by a provider derived from verified monday authentication/context. Tenant IDs are never accepted from form values, query strings, URLs or local storage.

`SupplierRepository` requires a tenant context for list, get, create, update, status change, source-configuration read and source-configuration write. `createInMemorySupplierRepository` filters every operation by tenant, prevents cross-tenant reads/updates, and returns defensive copies. Its reset-on-reload behavior is intentional for this milestone.

`SupplierService` coordinates tenant resolution, validation, normalization, search/filtering, summaries, repository writes, board-provider access, mapping validation and previews. React receives the service as a dependency and never knows which storage or board adapter is active.

## Board provider and mapping

`MondayBoardProvider` returns internal `MondayBoardDescriptor` and `MondayColumnDescriptor` values rather than raw GraphQL responses. `mockMondayBoardProvider` supplies fictional development boards and sample rows.

Column compatibility, mapping validation and preview transformation live in `src/shared/mapping`. Supplier Name is the only required mapping. Optional missing mappings do not block setup; potentially incompatible column types produce warnings. A future authenticated monday adapter can translate current API responses into the same descriptors without changing service or UI contracts.

## Future adapters

- Replace `DevelopmentTenantContextProvider` with authenticated monday account context.
- Replace the in-memory repository with a Document DB or secured backend adapter.
- Replace the mock board provider with least-privilege read-only board discovery.
- Keep GraphQL, tokens, credentials and authorization enforcement outside React.
