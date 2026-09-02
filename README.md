# Ariavel Sourcing

Milestone 1 of the Ariavel Technologies monday.com Marketplace application: a polished Sourcing Hub Custom Object UI for procurement teams.

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

The current UI uses a mock repository. No secrets are required for local Milestone 1 development. Copy `.env.example` only when adding the backend/monday integration.

## monday setup

Do not create another app. In the existing app `12049778`, create an `Object` feature named **Ariavel Sourcing Hub** if the draft does not already have one. Build the frontend, upload/connect the build URL on that feature, and test it in the development environment. Do not promote a version to live without explicit approval.

The current monday CLI is `@mondaycom/apps-cli`:

```bash
npm install -g @mondaycom/apps-cli
mapps init
```

See [docs/MONDAY_SETUP.md](docs/MONDAY_SETUP.md) for the manual Developer Center checklist.
