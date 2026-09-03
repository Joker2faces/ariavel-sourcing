# Installation Guide

## Prerequisites

- monday.com account with **Admin** role
- Access to the monday.com Developer Center
- Node.js 20+ (for local development only)

---

## Step 1 — Install from Marketplace

> **Note:** Do not install the app from this repository directly. The installation must be performed by the app owner via the Developer Center.

When the app is published to the monday Marketplace:

1. Go to **monday.com → Apps → Marketplace**
2. Search for **Ariavel Sourcing**
3. Click **Add to account**
4. Authorise the requested permissions:
   - `me:read` — identify the current user
   - `account:read` — account-level context
   - `boards:read` — read boards for supplier sync
   - `storage` — persist supplier and event data
5. Click **Install**

---

## Step 2 — Add to a Board

1. Open the monday.com board where you want to manage sourcing
2. Click **+ Add view** → **Apps** → **Ariavel Sourcing**
3. The app opens in a new board view

---

## Step 3 — First-Run Setup

On first open, the onboarding wizard walks through:

1. Welcome and feature overview
2. Adding your first supplier
3. Creating your first sourcing event
4. Using the bid comparison engine

Click **Get started** or **Skip** to proceed to the main interface.

---

## Step 4 — Configure Organisation Settings

1. Go to **Settings → Organization**
2. Set your **Company name** and **Default currency**
3. (Optional) Connect a monday board for supplier sync:
   - Select the board containing your supplier list
   - Map **Name column** and **Email column**
   - Click **Sync**

---

## Permissions Summary

| Permission | Why Required |
|---|---|
| `me:read` | Identify buyer user for audit logging |
| `account:read` | Derive tenant ID for data isolation |
| `boards:read` | Discover boards for supplier import |
| `storage` | Store supplier and event data persistently |

---

## For Developers — Local Development

```bash
git clone <repo>
cd ariavel-sourcing
npm install
npm run dev          # Vite dev server (frontend, port 5173)
npm run server:dev   # Express server (backend, port 3001)
npm test             # Run all 338 tests
```

Environment variables for the server:

```
MONDAY_CLIENT_SECRET=<from Developer Center>
MONDAY_SIGNING_SECRET=<from Developer Center>
PORT=3001
```

TypeScript checks:

```bash
npx tsc --noEmit -p tsconfig.app.json    # Frontend
npx tsc --noEmit -p tsconfig.server.json # Server
```

---

## Uninstalling

1. Go to **monday.com → Apps → Manage apps**
2. Find **Ariavel Sourcing** → **Uninstall**
3. Confirm removal

Uninstalling does not delete data from monday Storage. To purge tenant data, contact app support before uninstalling.
