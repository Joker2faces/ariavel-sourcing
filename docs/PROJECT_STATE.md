# Project State

## Current Phase
M9 — Release Candidate (complete)

## Branch Stack
```
main (never merged into)
  └── feature/m2-supplier-master
        └── feature/m3-sourcing-events
              └── feature/m4-sourcing-events
                    └── feature/m5-supplier-portal
                          └── feature/m6-bid-intelligence
                                └── feature/m7-award-scenarios
                                      └── feature/m8-document-management
                                            └── feature/release-candidate  ← current branch
```

## Latest Commit
`2751a81a55e4fcda611052edf5ba3959916266d3` — fix(build): stop tracking compiled dist-server output

## Working Tree State
Clean (tracked files). Two untracked local-only files present (not committed): `code.tar.gz` (a prior packaging artifact) and `security-scan-17506248-*.json` (an earlier empty scan result), both harmless and left in place.

## Test Results (Fresh Run — 2026-09-03, post-secret-configuration)
- **338 tests, 28 test files, all passing**
- `npx tsc --noEmit -p tsconfig.app.json` — 0 errors
- `npx tsc --noEmit -p tsconfig.server.json` — 0 errors
- `npm run lint` — 0 errors (previously 24 false-positive errors from linting committed `dist-server/` output; fixed by untracking it and excluding it in `eslint.config.js`)
- `npm run build` — clean (259.55 kB JS / 41.14 kB CSS)
- `npm run build:server` — clean
- `git diff --check` — clean
- `npm audit` — **could not run**: npm registry is configured to `registry.npmmirror.com`, which returns `501 NOT_IMPLEMENTED` for the audit endpoint. Not fixed (registry config is an environment choice, not touched without explicit instruction).
- Secret scan (tracked files, dist/, dist-server/): no literal secret values found; only `process.env['MONDAY_CLIENT_SECRET']` / `MONDAY_SIGNING_SECRET` name references.

## What Was Built (M9)

### Frontend
- `src/frontend/ErrorBoundary.tsx` — React class error boundary, structured JSON error logging
- `src/frontend/onboarding/OnboardingFlow.tsx` — 4-step first-run wizard (localStorage-keyed)
- `src/frontend/settings/SettingsPage.tsx` — Full 6-section settings: Organization, Sourcing, Comparison, Security, Data & Privacy, Billing
- `src/frontend/styles.css` — Design system tokens + dark theme + responsive breakpoints
- `src/frontend/App.tsx` — ErrorBoundary wrapper, OnboardingFlow (Monday-only), onboarding skipped in test/dev mode

### Backend
- `src/server/middleware/requestId.ts` — X-Request-ID on every response
- `src/server/middleware/noSqlInjection.ts` — Blocks `$`-prefix operator keys in request body
- `src/server/app.ts` — Strict CSP via Helmet, 256 KB body limit, enhanced /health endpoint
- `src/backend/entitlement/entitlementService.ts` — Feature gate abstraction (dev: all enabled)

### Tests
- `tests/tenantIsolation.test.ts` — 12 security tests (cross-tenant isolation, NoSQL injection, CSP, X-Request-ID, body size)
- `tests/masterE2E.test.ts` — 29-step end-to-end scenario covering full lifecycle

### Documentation
- `docs/MARKETPLACE_READINESS.md`
- `docs/SECURITY_OVERVIEW.md`
- `docs/PRIVACY_DATA_MAP.md`
- `docs/SUPPORT_RUNBOOK.md`
- `docs/USER_GUIDE.md`
- `docs/INSTALLATION_GUIDE.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/MONETIZATION_PLAN.md`

## Deployment State
- **MONDAY_CLIENT_SECRET:** Configured by owner (2026-09-03). Value never retrieved/printed by this session.
- **`mapps` CLI:** **Non-functional in this environment.** Every invocation (`app:list`, `--help`, even bare `mapps`) fails silently — `~/.config/configstore` is access-denied to the current OS user (`icacls` also returns "Access is denied" on it), so the CLI cannot read/write its auth/config store. This blocked all of: verifying the current draft App Version ID, listing app features, and redeploying server/client code to monday Code. Not resolved — fixing OS-level ownership/permissions on that directory requires elevated access this session did not attempt (privilege escalation is out of scope without explicit user instruction).
- **Frontend:** Not deployed this session (blocked by the CLI issue above, in addition to the pre-existing Developer Center stop condition).
- **Backend (monday Code):** Not redeployed this session (same CLI blocker). Last known deployed server build predates `MONDAY_CLIENT_SECRET` being set, so the running instance (if any) will still 503 buyer routes until redeployed.
- **Marketplace:** Not submitted (owner action — STOP CONDITION, unchanged).

## Manual Blockers (Genuine Owner Action Required)
1. **Fix `mapps` CLI access** — grant the current Windows user ownership/permissions on `C:\Users\thodo\.config\configstore` (or reset/relocate that config store), then re-run `mapps app:list` to confirm auth still holds.
2. **monday Code server redeploy** — once the CLI works, push server code to the current draft so the runtime picks up `MONDAY_CLIENT_SECRET`.
3. **monday Code frontend redeploy** — push `./dist` to the same draft.
4. **App listing** — Screenshots, description, icon
5. **Legal** — Privacy policy URL, Terms of service URL
6. **Monetization** — Decide free vs. paid before submission (see MONETIZATION_PLAN.md)
7. **Marketplace submission** — Click Submit in Developer Center

## Security Architecture
- JWT auth: `{ dat: { account_id, user_id } }` signed with `MONDAY_CLIENT_SECRET`
- Tenant ID: `monday-account-{account_id}` — derived from JWT only
- NoSQL injection: `noSqlInjectionMiddleware` blocks `$`-prefix keys
- Body size: 256 KB hard limit
- CSP: `default-src 'self'`, `frame-src 'none'`, `object-src 'none'`
- Rate limits: 200 req/min buyers, 60 req/min portal
- Request tracing: X-Request-ID on every response

## Known Technical Debt (Post-M9)
1. Invitations/quotes/comparisons/awards are in-memory — reset on server restart
2. Email delivery for portal links is not implemented
3. Audit log export (CSV) not implemented
4. No real-time quote status push
