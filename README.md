# Ariavel Sourcing

Milestones 1 and 2 of the Ariavel Technologies monday.com Marketplace application: a polished Sourcing Hub and tenant-aware Supplier Master for procurement teams.

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

No secrets are required for local development. The current UI uses replaceable in-memory repositories and a normalized mock monday board provider. Supplier records and source configuration reset on reload; real board discovery and durable Document DB storage remain future adapters.

## Milestone 2 — Supplier Master

The **Suppliers** navigation now opens a complete supplier workspace with:

- meaningful total, active, preferred and incomplete-profile metrics;
- dynamic search plus status, category and country filters;
- responsive desktop table and mobile supplier cards;
- accessible details and add/edit workflows;
- `ACTIVE`, `PENDING`, `INACTIVE` and `BLOCKED` lifecycle states;
- manual preferred-supplier metadata and optional 1–5 rating;
- reusable supplier validation and normalization;
- tenant-scoped repository/service operations and cross-tenant protection;
- Ariavel-managed and existing-monday-board source modes;
- normalized mock board discovery, column compatibility, required mapping validation and fictional preview data.

The source setup is intentionally provider-driven. It does not query monday from React and does not use a personal API token as runtime authorization. A later adapter can implement authenticated read-only board discovery behind `MondayBoardProvider`.

Not implemented: durable storage, real board reads, supplier invitations, public supplier access, RFQ/quotation workflows, extraction, bid comparison, awards, ERP integrations, billing, Marketplace submission or production promotion.

## monday setup

Do not create another app. In the existing app `12049778`, inspect the current draft and reuse the existing **Ariavel Sourcing Hub** Object feature. Build the frontend, deploy/connect it only to that draft feature, and test it in the development environment. Do not promote a version to live without explicit approval.

The current monday CLI is `@mondaycom/apps-cli`:

```bash
npm install -g @mondaycom/apps-cli
mapps init
```

See [docs/MONDAY_SETUP.md](docs/MONDAY_SETUP.md) for the manual Developer Center checklist.
