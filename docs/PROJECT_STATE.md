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
See `git log --oneline -5` for exact SHA.

## Working Tree State
Clean after M9 commit.

## Test Results (M9 Release Candidate)
- **338 tests, 28 test files, all passing**
- 0 TSC errors (frontend + server)
- Frontend build: OK

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
- **Frontend:** Not yet deployed (requires Developer Center action — STOP CONDITION)
- **Backend (monday Code):** Not yet deployed (requires Developer Center action — STOP CONDITION)
- **Marketplace:** Not submitted (requires owner action — STOP CONDITION)

## Manual Blockers (Genuine Owner Action Required)
1. **MONDAY_CLIENT_SECRET** — Must be set in monday Code environment
2. **MONDAY_SIGNING_SECRET** — Must be set in monday Code environment
3. **monday Code deployment** — Upload build via Developer Center
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
