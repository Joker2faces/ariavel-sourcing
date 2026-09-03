# Ariavel Sourcing

Milestones 1–3 of the Ariavel Technologies monday.com Marketplace application: a polished Sourcing Hub, tenant-aware Supplier Master, and real monday runtime with persistent supplier storage.

## Prerequisites

- Node.js 20+
- npm 10+
- An existing monday Developer Center app (Ariavel Sourcing, app ID `12049778`)

## Install and run

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

No secrets are required for local development. In local mode the UI uses in-memory repositories and a mock monday board provider. In the monday runtime the app uses real monday SDK context, `monday.storage` (global scope) for durable supplier persistence, and `monday.api()` for live board discovery — all seamlessly authenticated via the monday postMessage proxy with no token management required.

## Milestone 2 — Supplier Master

The **Suppliers** navigation opens a complete supplier workspace with:

- meaningful total, active, preferred and incomplete-profile metrics;
- dynamic search plus status, category and country filters;
- responsive desktop table and mobile supplier cards;
- accessible details and add/edit workflows;
- `ACTIVE`, `PENDING`, `INACTIVE` and `BLOCKED` lifecycle states;
- manual preferred-supplier metadata and optional 1–5 rating;
- reusable supplier validation and normalization;
- tenant-scoped repository/service operations and cross-tenant protection;
- Ariavel-managed and existing-monday-board source modes with column mapping validation.

## Milestone 3 — Real Monday Runtime & Persistent Data Foundation

Milestone 3 connects the app to the live monday environment:

- **Runtime detection**: `RuntimeMode.MONDAY` (iframe), `LOCAL_DEVELOPMENT` (top-level), `TEST` (process.env). Graceful local fallback uses mock providers so development workflow is unchanged.
- **Trusted tenant identity**: account ID read exclusively from `monday.get('context')`. Never accepted from form input, URL params, localStorage, or user-supplied JSON.
- **Real board discovery**: `monday.api()` with `boards:read` scope via `MondayApiBoardProvider`. Lists active boards, resolves column descriptors, paginates board items using `items_page(limit: 500)` cursor pagination with a 20-page guard.
- **Durable supplier storage**: `monday.storage` (global scope) via `MondayStorageSupplierRepository`. Per-supplier keys plus an index key. Optimistic concurrency via `previous_version`. Lazy schema-version initialization. Corrupt-record resilience.
- **Capability gating**: `RuntimeCapabilities` derived from monday context user object (`isAdmin`, `isGuest`, `isViewOnly`). Board-mode suppliers are read-only; add/edit/deactivate buttons are hidden.
- **Loading and error states**: professional spinner during SDK initialization and board discovery; permission and initialization error states with recovery prompts.
- **API version pinned**: `2026-07` (stable, current).

Not implemented: supplier invitations, public supplier access, RFQ/quotation workflows, bid comparison, awards, ERP integrations, billing, Marketplace submission or production promotion.

## monday setup

Do not create another app. In the existing app `12049778`, inspect the current draft and reuse the existing **Ariavel Sourcing Hub** Object feature. Build the frontend, deploy/connect it only to that draft feature, and test it in the development environment. Do not promote a version to live without explicit approval.

The current monday CLI is `@mondaycom/apps-cli`:

```bash
npm install -g @mondaycom/apps-cli
mapps init
```

See [docs/MONDAY_SETUP.md](docs/MONDAY_SETUP.md) for the manual Developer Center checklist.
