# Existing monday application state

This file records non-secret Developer Center metadata for development safety. Verify it against Developer Center or authenticated CLI output before every deployment or destructive operation.

## Verification status (2026-09-03, final RC pass)

The `mapps` CLI was previously reported non-functional in this environment (an `update-notifier` config-store permission error on every invocation). Root cause found and fixed with no permission changes: invoke `node <npm-global>/node_modules/@mondaycom/apps-cli/bin/run.js` directly with `NO_UPDATE_NOTIFIER=1` set, bypassing `npx` and the broken update check entirely. The table below is freshly re-verified via authenticated CLI (`app:list`, `app-version:list -i 12049778`, `app-features:list -a 12049778 -i 17506248`) this session — no duplicate app or feature exists.

## Confirmed inventory

| Setting | Confirmed value |
| --- | --- |
| App | Ariavel Sourcing |
| App ID | `12049778` |
| Current draft App Version ID | `17506248` |
| Existing feature ID | `123330040` |
| Developer Center feature name | Object feature |
| Product-facing feature name | Ariavel Sourcing Hub |
| Feature type | `AppFeatureObject` / Object / Custom Object |
| Frontend | React, Vite, TypeScript |
| Build directory | `./dist` |
| Intended development hosting | monday client-side code / CDN deployment |

## Server-side deployment (current — final RC pass, 2026-09-03)

| Field | Value |
| --- | --- |
| Command | `mapps code:push -d . -i 17506248 -s` (server-side; no `--client-side`) |
| Server URL | `https://a3622-service-36719779-d5e6fb88.us.monday.app` |
| Security scan | Passed, 0 findings (all 4 deploys) |
| Deploys across both passes | 4 — trust-proxy fix, secret-provider fix, lifecycle webhook, dark-mode shell fix |
| `GET /health` | `{"status":"ok","checks":{"api":true,"db":true}}` |
| `GET /` | 200, `text/html` — static frontend served from this same URL |
| `GET /api/buyer/settings` (no auth) | 401 (was 503 "MONDAY_CLIENT_SECRET is missing" — fixed via SecretsManager, see `docs/PROJECT_STATE.md`) |
| Feature binding | Rebound via `mapps app-features:build -a 12049778 -i 17506248 -d 123330040 -t monday_code` to this exact server URL — confirmed by the CLI's own success message. No manual Developer Center action was needed. |
| Ignore file | New `.mappsignore` (mirrors `.gitignore` but does not exclude `dist/`/`dist-server/`, which `.gitignore` correctly excludes from git but which must be included in the deploy tarball) |
| **Manual action still required** | Register `https://a3622-service-36719779-d5e6fb88.us.monday.app/api/lifecycle/events` as the App Events webhook URL in Developer Center — not configured automatically, see `docs/PROJECT_STATE.md` |

This supersedes the client-side CDN deployment history below, which is kept only as a historical record of M2–M5.

## Client-side CDN deployment history (historical — superseded above)

### Milestone 5 (2026-09-03)

| Field | Value |
| --- | --- |
| Deployment date | 2026-09-03 |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| Command | `mapps code:push --client-side -s -d ./dist -i 17506248` |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Source archive | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app/source/13298178.zip` |
| Security scan | Passed (`-s` flag used) |
| Build size | 245.79 kB JS / 26.32 kB CSS |
| Tests at deploy | 201/201 passing (20 files) |
| Notes | Client-side only; server-side (monday Code) requires manual deploy after Document DB and signing secret setup |

### Milestone 2 (2026-09-02)

| Field | Value |
| --- | --- |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Source archive | `.../source/13296729.zip` |
| Security scan | Passed |

### Milestone 4 (2026-09-03)

| Field | Value |
| --- | --- |
| Deployment date | 2026-09-03 |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| Command | `mapps code:push --client-side -s -d ./dist -i 17506248` |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Source archive | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app/source/13298105.zip` |
| Security scan | Passed (`-s` flag used) |
| Build size | 238.90 kB JS / 24.11 kB CSS |
| Tests at deploy | 162/162 passing (16 files) |
| Feature binding | Bound to feature `123330040` via Developer Center |

### Milestone 3 (2026-09-03)

| Field | Value |
| --- | --- |
| Deployment date | 2026-09-03 |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| Command | `mapps code:push --client-side -s -d ./dist -i 17506248` |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Build category | `view` (client-side CDN) |
| Source archive | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app/source/13297670.zip` |
| Security scan | Passed (`-s` flag used) |
| Feature binding | Bound to feature `123330040` via Developer Center (same URL as M2) |

## Deployment boundary

- The canonical target is the existing draft version `17506248`, after verifying it is still current.
- Reuse feature `123330040`; never create a duplicate Object feature.
- Never create another Ariavel Sourcing app.
- **Architecture change (this pass):** the app is no longer deployed as a separate client-side CDN push. `src/server/app.ts` now serves the built frontend (`./dist`) directly from the same Express app as the API — deploy the whole project as ONE server-side push (built `dist/` + `dist-server/` + source), not `--client-side`. This was necessary because there was previously no working same-origin story for the frontend to call its own backend, and monday's own guidance is to co-host frontend and backend for exactly this reason.
- Never promote a draft to live without separate explicit approval.
- App Version IDs can change when new drafts are created. Always re-run authenticated inspection before deployment.
- Verify App IDs and Feature IDs against Developer Center or the CLI before destructive operations.

## Authenticated inspection and deployment

The `mapps` CLI works in this environment via: `NO_UPDATE_NOTIFIER=1 node <npm global root>/node_modules/@mondaycom/apps-cli/bin/run.js <command>` (bypasses a broken `npx`/update-notifier interaction — see `docs/PROJECT_STATE.md`). Find `<npm global root>` with `npm root -g`.

```bash
mapps app:list
mapps app-version:list -i 12049778
mapps app-features:list -a 12049778 -i 17506248
npm run build && npm run build:server
mapps code:push -d . -i 17506248 -s
# After a fresh server-side deploy, rebind the EXISTING feature (never create a new one) to it:
mapps app-features:build -a 12049778 -i 17506248 -d 123330040 -t monday_code
# (prompts "Add your route to monday-code base url" — press Enter for none)
```

The final command (server-side push, security-scanned, no `--client-side`) is permitted only for the verified development draft. It does not authorize promotion, release, or Marketplace submission.

Never store personal developer tokens, client secrets, signing secrets, or `.mappsrc` in Git. If a manifest is exported, inspect it for credentials before committing it.
