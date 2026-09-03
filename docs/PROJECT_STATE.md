# Project State

## Current Phase

Final Release Candidate completion pass (post-M9). No further milestones planned — this is the terminal engineering phase before Marketplace submission.

## Branch

`feature/release-candidate`

## Test Results (Fresh Run — 2026-09-03)

- **414 tests, 39 test files, all passing**
- `npm run build` (`tsc -b && vite build`) — clean
- `npm run build:server` (`tsc -p tsconfig.server.json`) — clean
- `npm run lint` — 0 errors
- `git diff --check` — clean
- `npm audit --registry=https://registry.npmjs.org/` (one-shot override; the configured mirror registry doesn't implement the audit endpoint) — 13 advisories, all in dev-only tooling (`vite`/`vitest`/`esbuild`, used only by `npm test`/`npm run dev`) or deep inside `@mondaycom/apps-sdk`'s own Google Cloud dependency chain (`uuid`, `google-gax`) — nothing in the app's own runtime request path. Not force-fixed; see Known Limitations.
- Secret scan (tracked files, `dist/`, `dist-server/`): no literal secret values anywhere — only `process.env['MONDAY_CLIENT_SECRET']` / `MONDAY_SIGNING_SECRET` name references.

## What Changed In This Pass

This pass audited the actual runtime behavior of everything M1–M9 claimed as "done" against what the code does, and fixed what didn't hold up. In order of how they were found:

1. **`mapps` CLI was non-functional** — every invocation failed on an `update-notifier` config-store permission error. Fixed with `NO_UPDATE_NOTIFIER=1` and invoking `node bin/run.js` directly instead of through `npx`, bypassing the broken update check entirely — no OS permission changes needed. The CLI is confirmed fully working (verified `app:list`, `app-version:list`, `app-features:list`).
2. **`dist-server/` (compiled output) was committed to git** and linted by ESLint (24 false-positive errors). Untracked, gitignored, excluded from ESLint.
3. **Object Storage was a complete stub** — `initiateUpload` returned a hardcoded fake URL, there was no download route, and the portal (supplier) document router existed but was never mounted and referenced a `req.portalTenantId` no middleware ever set. Replaced with a real `@mondaycom/apps-sdk` `ObjectStorage` adapter (selected via `OBJECT_STORAGE_BUCKET`, same pattern as Document DB) with an in-memory dev fallback; added the missing download routes; rewrote the portal router to use token-based auth like the rest of the portal API; mounted it.
4. **The buyer-facing app never actually called its own backend.** `createBuyerApiClient` was defined but never instantiated in `App.tsx` — `apiClient` was hardcoded `null` everywhere, so invitations/quotes/comparisons were silently no-ops in the real running app (tests passed because they inject a client directly into components, bypassing `App.tsx`). Root cause: no `monday.get("sessionToken")` call existed anywhere in the frontend, and there was no same-origin story for reaching the backend. Fixed: added `getSessionToken()` to the monday runtime adapter, made the server serve the built frontend from the same origin (`app.ts` now serves `./dist` with an SPA fallback), and wired a real `BuyerApiClient` into `App.tsx`.
5. **Helmet's default `X-Frame-Options: SAMEORIGIN`** was still active with no CSP `frame-ancestors` — since monday.com embeds this app in an iframe from a different origin, this would have silently blocked the app from ever rendering in production. Fixed (`frameguard: false` + `frame-ancestors https://*.monday.com`).
6. **Tenant Settings had zero backend persistence** — the Settings UI was pure local `useState`, resetting on every reload. Built a full Mongo-backed (+ in-memory dev fallback) `TenantSettingsRepository`/service/routes with optimistic-concurrency version checks, and wired the UI to it.
7. **Split award was never actually implemented** despite the M7 commit message — `awardService.awardLine` replaced a line's allocations wholesale, with a code comment admitting "split comes later." Implemented real per-supplier upsert allocation, `removeLineAllocation`, and `markNoAward` (a line with zero bidders had no way to leave PENDING before finalizing).
8. **Bid Matrix and the entire Award Workspace were unreachable in the UI** — `BidMatrix.tsx` was a fully-built component never rendered anywhere, and the "Awards" nav item rendered a generic "Coming soon" placeholder despite the backend being fully built and tested. Built `ComparisonPanel.tsx` (new "Comparison" tab on the event drawer) and `AwardWorkspacePage.tsx` (replaces the Awards placeholder).
9. **Audit log was write-only** — no read endpoint, no export, no UI, despite docs claiming an "audit log" feature. Added `eventId` to every audit call site, a query API, CSV export, and an "Activity" tab.
10. **Invitation delivery UX** relabeled from "Send invitation" (implied automated email) to "Generate invitation link," with an explicit "Link generated — not automatically sent" banner, copy-message and mailto actions.
11. **No status-freshness mechanism** — added manual refresh + 20s visibility-aware polling on the invitations panel.
12. **Tenant data export/deletion did not exist** (`PRIVACY_DATA_MAP.md` admitted "requires contacting support"). Implemented both, gated behind a typed confirmation phrase for deletion, with `audit_events` deliberately preserved through a deletion as the compliance record.
13. Found and fixed a **shared-mutable-state bug** in four in-memory repositories (award/quote/comparison/settings): a shallow `{ ...doc }` copy left nested arrays/objects shared by reference with the stored document, so an unrelated later write could silently mutate an object a caller already held. Fixed with `structuredClone`. Never affected the Mongo-backed repos (each read deserializes fresh).

## Deployment State

- **`mapps` CLI:** Working (see fix above). App ID `12049778` ("Ariavel Sourcing"), current draft `17506248` (status: `draft`, single-region), feature `123330040` ("Ariavel Sourcing Hub", `AppFeatureObject`, active) — all confirmed via authenticated CLI, no duplicates.
- **Frontend/Backend hosting:** now unified — see architecture change above. Deployed the whole project (built `dist/` + `dist-server/` + source, via a new `.mappsignore` since `.gitignore`-based excludes would otherwise have stripped the build output from the deploy tarball) as ONE server-side `mapps code:push -d . -i 17506248 -s`; the separate `--client-side` CDN push used for M2–M5 is retired.
- **Server deployed twice this pass**, both with 0 security-scan findings, to `https://a3622-service-36719779-d5e6fb88.us.monday.app`:
  1. First push: all the functional work in this document.
  2. Found in the live console logs immediately after: `express-rate-limit` was logging a `ValidationError` on every single request (monday Code's reverse proxy sets `X-Forwarded-For`; Express's `trust proxy` defaults to `false`). Fixed (`app.set('trust proxy', 1)`), tested, redeployed.
- **Post-deploy verification:** `GET /health` → `{"status":"ok","checks":{"api":true,"db":true}}` (Document DB genuinely connected in production). `GET /` → 200 `text/html` (static frontend serving confirmed working). CSP header confirmed includes `frame-ancestors https://*.monday.com`, no `X-Frame-Options` sent. `PUT /api/dev-storage/...` → Express's default "Cannot PUT" 404 (the dev-storage router is not mounted, confirming `OBJECT_STORAGE_BUCKET` is genuinely set and the real Object Storage adapter is in use). HTTP access logs after the fix show clean 200s, including monday's own health-check probe (`MondayHealth` user agent). Console logs after the fix show no more rate-limit errors.
- **`MONDAY_CLIENT_SECRET` — genuine finding, not fixed by this session:** `code:secret -i 12049778 -m list-keys` confirms the KEY `MONDAY_CLIENT_SECRET` is registered at the app level in Developer Center. However, every authenticated buyer route on the live deployment returns `503 {"error":"Service not configured — MONDAY_CLIENT_SECRET is missing"}` — meaning `process.env['MONDAY_CLIENT_SECRET']` is empty in the actual running container, even after a fresh redeploy. The secret's *value* was never requested, retrieved, or inspected by this session, only its key presence. **This needs the owner's attention**: re-verify the secret is actually saved against this exact app/environment/region in Developer Center, or re-save and redeploy.
- **Stop condition — Developer Center manual action required:** the frontend previously lived at a separate CDN URL (`https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app`, from the M2–M5 client-side pushes). It now lives at the server URL above instead (same-origin architecture change). **The "Ariavel Sourcing Hub" Custom Object feature's view/build URL in Developer Center needs to be manually updated to `https://a3622-service-36719779-d5e6fb88.us.monday.app`** — this is a Developer Center UI action with no CLI equivalent (`app-features:list` doesn't expose or let you set this field).

## Security Architecture

- JWT auth: `{ dat: { account_id, user_id } }` signed with `MONDAY_CLIENT_SECRET`, verified via `monday.get("sessionToken")` client-side / `jsonwebtoken.verify` server-side
- Tenant ID: `monday-account-{account_id}` — derived from JWT only, never from body/query/params
- `MONDAY_SIGNING_SECRET`: defined (`verifyMondaySignedRequest`) but not yet wired to any route — no monday-originated webhook exists yet to verify. Introduce only when one is actually added.
- NoSQL injection: `noSqlInjectionMiddleware` blocks `$`-prefix / dotted keys
- Body size: 256 KB hard limit; file uploads: 25 MB, MIME allowlist + magic-byte + dangerous-extension checks
- CSP: `default-src 'self'`, `frame-ancestors https://*.monday.com` (required for monday to embed the app), `frame-src 'none'`, `object-src 'none'`
- CORS: `origin: false` — correct now that frontend and backend are same-origin
- Rate limits: 200 req/min buyers, 60 req/min portal
- Request tracing: `X-Request-ID` on every response

## Persistence (production, when `MNDY_MONGODB_CONNECTION_STRING` is set)

| Entity | Collection | In-memory fallback used only when |
|---|---|---|
| Supplier invitations | `supplier_invitations` | Mongo not connected |
| Supplier quotes | `supplier_quotes` | Mongo not connected |
| Comparison snapshots | `comparison_snapshots` | Mongo not connected |
| Award scenarios | `award_scenarios` | Mongo not connected |
| Attachment metadata | `attachments` | Mongo not connected |
| Tenant settings | `tenantSettings` | Mongo not connected |
| Audit events | `audit_events` | Mongo not connected |
| Attachment file bytes | monday Object Storage (`OBJECT_STORAGE_BUCKET`) | bucket not provisioned yet |

None of these use in-memory storage in production — the fallback exists only for local dev, tests, and the first-boot window before monday Code provisions the Document DB / bucket.

## Known Limitations (Genuine, Not Owner-Fixable By This Session)

1. **No optimistic concurrency on quotes/comparisons/award-line edits** (settings and award finalization do have version/state guards). Quotes and comparisons are effectively single-writer in practice (a supplier writes only their own quote; comparisons are buyer-only within one tenant), so the risk is low, but it is not enforced. A future pass should add the same version-check pattern already used for tenant settings.
2. **No per-RFQ automated "line has zero bidders" detection beyond the manual "Mark as no-award" button** — a buyer must notice and click it; nothing surfaces it proactively.
3. **`npm audit` advisories** in `vite`/`vitest`/`esbuild` (dev-only) and deep in `@mondaycom/apps-sdk`'s own dependency chain — not fixable from this repo without either a breaking `vitest` major bump or an upstream SDK release.
4. **Uninstall/deauthorization webhook** is not implemented — `MONDAY_SIGNING_SECRET` verification exists as a utility function but nothing calls it yet, per the instruction to only wire it when a real signed-request path is added.
5. **Full visual design system audit / dark-theme pass across every new screen** (Comparison tab, Award Workspace, Activity tab, Settings Data & Privacy) was done functionally but not verified pixel-by-pixel in a live browser at every breakpoint — see the final report's UX section for what was and wasn't checked.
