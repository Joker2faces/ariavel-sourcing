# Architecture

The app is a React + TypeScript + Vite client designed to run as a monday Custom Object. `App` composes the shell and feature UI; domain types and validation live under `src/shared`; data access is behind `SourcingRepository` and consumed by `sourcingService`.

The current `mockSourcingRepository` is replaceable with a monday Document DB repository or a backend API without coupling React components to GraphQL. Backend credentials and tenant-aware operations belong in `src/backend` only. Every persisted record must carry a tenant boundary derived from authenticated monday context; a client-supplied account ID must never be trusted as authorization.

The initial repository contract is intentionally small. As RFQs mature, add use-case services and repository methods around the domain model rather than placing monday queries in components.
