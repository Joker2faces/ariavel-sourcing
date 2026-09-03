# Project State

## Current Phase

Final Release Candidate completion pass (post-M9). No further milestones planned — this is the terminal engineering phase before Marketplace submission.

## Branch

`feature/release-candidate`

## Test Results (Fresh Run — 2026-09-03)

- **437 tests, 41 test files, all passing**
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

## Deployment State — both critical defects from the previous pass are now fixed and verified live

- **`mapps` CLI:** Working. App ID `12049778` ("Ariavel Sourcing"), current draft `17506248` (status: `draft`, single-region), feature `123330040` ("Ariavel Sourcing Hub", `AppFeatureObject`, active) — all confirmed via authenticated CLI, no duplicates.
- **Frontend/Backend hosting:** unified — the server serves the built frontend from `./dist` with an SPA fallback. Deployed the whole project (built `dist/` + `dist-server/` + source, via `.mappsignore`) as ONE server-side `mapps code:push -d . -i 17506248 -s`.
- **Fixed: `MONDAY_CLIENT_SECRET` 503.** Root cause: monday Code Secrets and Environment Variables are separate facilities — a value saved under Secrets is never injected into `process.env`; it must be read via the SDK's `SecretsManager`, which reads a mounted secrets file in a real deployed container (detected via the `K_SERVICE` env var Cloud Run sets). The code was reading `process.env['MONDAY_CLIENT_SECRET']` directly. Fixed with a `SecretProvider` abstraction (`src/server/secrets/secretProvider.ts`) that uses `SecretsManager` in production, plain `process.env` locally. **Verified live**: `GET /api/buyer/settings` with no `Authorization` header went from `503 {"error":"...MONDAY_CLIENT_SECRET is missing"}` to `401 {"error":"Missing Authorization header"}` — proof the secret now resolves and the middleware reaches the auth-header check. The secret's value was never requested, retrieved, printed, or logged.
- **Fixed: feature still pointed at the retired CDN.** `mapps app-features:build -a 12049778 -i 17506248 -d 123330040 -t monday_code` rebound the EXISTING feature (123330040 — no duplicate) directly to the monday Code deployment, with an empty subroute. CLI output: `"App feature 123330040 was updated successfully with url: https://a3622-service-36719779-d5e6fb88.us.monday.app"`. No manual Developer Center action was needed after all — the CLI supports this safely.
- **Implemented: app lifecycle webhook.** `POST /api/lifecycle/events` — verifies the JWT (Client Secret, confirmed against current monday docs; NOT the Signing Secret, which is a different mechanism for board/item webhooks) and calls the existing `deleteTenantData` on `type: "uninstall"`. Not registered as a webhook URL in Developer Center by this session — see Manual Actions below for the exact URL and field.
- **Fixed: `express-rate-limit` ValidationError** on every request (monday Code's reverse proxy sets `X-Forwarded-For`; `app.set('trust proxy', 1)` added).
- **Server redeployed 4 times this pass**, all with 0 security-scan findings, to `https://a3622-service-36719779-d5e6fb88.us.monday.app`. Final verification: `GET /health` → `{"status":"ok","checks":{"api":true,"db":true}}`; `GET /` → 200 `text/html`; `POST /api/lifecycle/events` (no auth) → 401; `GET /api/buyer/settings` (no auth) → 401 (not 503); CSP includes `frame-ancestors https://*.monday.com`; no `X-Frame-Options`; `PUT /api/dev-storage/...` → Express's default 404 (confirms the real Object Storage adapter is in use, not the dev fallback); console logs after each fix show no errors; HTTP logs show clean 200s including monday's own health probe.

## OAuth Scopes — audited against actual API usage

The app makes exactly one class of monday API call: read-only board/column/item queries in `src/backend/providers/mondayApiBoardProvider.ts` (`boards`, board columns, `items_page`). No mutation query, no `me`/`account`/`users` query exists anywhere in the codebase — tenant/user identity comes exclusively from the verified JWT, never from an API call.

- **Required:** `boards:read` — the only scope any code path actually calls.
- **Not required, deliberately not requested:** `boards:write`, `users:read/write`, `account:read/write`, `me:read`, `workspaces:write`, `docs:write`, `updates:write`, `notifications:write`, `webhooks:write`, `ai:consume`. `me:read`/`account:read` were considered per the completion program's instructions but neither is called anywhere — least privilege.

## OAuth Flow — "New OAuth flow" should stay OFF

The buyer UI authenticates seamlessly via `monday.get("sessionToken")` (verified server-side against the Client Secret) and calls `monday.api()` through the SDK, which runs on-behalf-of the viewing user — there is no separate authorization-code flow, no stored OAuth access/refresh token, and nothing in this codebase would use one. Recommend leaving the "New OAuth Flow" Developer Center toggle off unless a future feature genuinely needs a stored, long-lived API token independent of the viewing session.

## Onboarding — recommended Developer Center starting point

Ariavel has its own complete in-app onboarding (`OnboardingFlow.tsx`, tenant-persisted via Settings). Recommend Developer Center's app start point be set directly to the "Ariavel Sourcing Hub" feature (123330040) rather than any separate monday-side onboarding flow, to avoid presenting the user with two onboarding experiences back to back. Not changed automatically — a Developer Center setting.

## Monitoring — recommendations for a future release (not configured; would create dev noise)

- 5xx error-rate threshold on `/api/buyer/*` and `/api/portal/*` (a sustained spike would mean either a real bug or `MONDAY_CLIENT_SECRET` regressing to unresolved).
- p95 latency threshold on `/api/buyer/events/:id/comparisons` and `/api/buyer/award-scenarios/*` (the most computation-heavy routes).
- A dedicated alert on any `503` from the buyer auth middleware specifically (distinct from generic 5xx) — that's the exact signature of the secret-resolution regression this pass just fixed.

## Visual / Dark Mode — genuine scope limitation, stated honestly

No browser or screenshot tool is available in this environment, so no actual rendered-pixel verification of any screen, breakpoint, or theme occurred this pass — every UI claim in this document is verified by reading source/CSS, not by looking at it. One concrete, verified-from-code defect was found and fixed: the app shell (sidebar/topbar/nav — the most persistently visible chrome) used hardcoded hex colors that bypassed the design-token system entirely, so `@media (prefers-color-scheme: dark)` changed the tokens but the shell never consumed them. Fixed with a like-for-like token substitution (values match exactly in light mode, so no regression risk). A full audit of every hardcoded color across the ~500-line stylesheet was not attempted — that carries real risk of a blind regression without visual feedback to verify against, and is exactly the kind of change that should be done with actual browser QA available.

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
4. **`MONDAY_SIGNING_SECRET` verification (`verifyMondaySignedRequest`, HMAC-based)** exists as a tested utility function but nothing calls it — no board/item integration webhook route exists in this app. (The separate app-lifecycle webhook, which uses the Client Secret not the Signing Secret, is now implemented — see Deployment State above.)
5. **No actual browser/visual QA was possible this pass** — no screenshot or browser automation tool was available in this environment. Every UI/dark-mode/responsive claim is verified by reading source, not by looking at rendered output. See the Visual/Dark Mode section above for the one concrete defect found and fixed this way, and what was deliberately not attempted without visual feedback.

## Manual Actions Still Required (genuinely cannot be done from code/CLI)

1. **Register the lifecycle webhook URL** in Developer Center: Developer Center → Ariavel Sourcing → current Draft → App Events (Webhooks) → set the endpoint to `https://a3622-service-36719779-d5e6fb88.us.monday.app/api/lifecycle/events` (verify this is still the current server URL first — it can change if the app version's deployment is recreated). Not configured automatically this pass, per instruction not to activate Developer Center webhooks without explicit authorization.
2. **App listing** — screenshots, description, icon.
3. **Legal** — privacy policy URL, terms of service URL.
4. **Monetization** — decide free vs. paid before submission.
5. **App installation** — required to verify the "Requires installation QA" items in `docs/MARKETPLACE_READINESS.md` (real `monday.get("sessionToken")` round-trip, iframe rendering inside monday's own UI, role-based restrictions under real monday permissions).
6. **Marketplace submission** — click Submit in Developer Center.
7. **Onboarding starting point** — Developer Center setting recommended above (Ariavel Sourcing Hub feature directly), not changed automatically.
