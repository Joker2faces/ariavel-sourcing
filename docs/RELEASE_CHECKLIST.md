# Release Checklist — M9 Release Candidate

## Release: M9 Release Candidate

**Branch:** `feature/release-candidate`
**Date:** 2026-09-03
**Target:** Pre-marketplace submission

---

## Code Quality Gates

- [x] `npm run build` (`tsc -b && vite build`) — 0 errors
- [x] `npm run build:server` (`tsc -p tsconfig.server.json`) — 0 errors
- [x] `npm test` — 414/414 passing (39 files)
- [x] `npm run lint` — 0 errors
- [x] `git diff --check` — clean
- [x] `npm audit --registry=https://registry.npmjs.org/` (one-shot override — the configured mirror doesn't implement the audit endpoint) — 13 advisories, all in dev-only tooling or `@mondaycom/apps-sdk`'s own dependency chain, none in the app's runtime path; not force-fixed

---

## Feature Completeness

- [x] M1: App shell, monday SDK integration
- [x] M2: Supplier Master (CRUD, validation, board sync)
- [x] M3: Sourcing Events (create, manage lifecycle)
- [x] M4: Sourcing Events (filter, search, deadline tracking)
- [x] M5: Supplier portal (token-based, quote submission), invitation delivery UX polished (manual link/message/mailto, no false "email sent"), status-freshness polling
- [x] M6: Bid comparison (normalised matrix), now reachable via a Comparison tab on the event drawer (previously built but never mounted)
- [x] M7: Award scenarios (recommended + manual override + **real split award**, previously a stub), now reachable via the Award Workspace (previously a "Coming soon" placeholder)
- [x] M8: Document management — real monday Object Storage adapter (previously a hardcoded fake URL, no download route), supplier-side router now mounted with token-based auth
- [x] M9: Onboarding wizard (now also tenant-persisted, not just localStorage), Settings page (now backend-persisted with optimistic concurrency), security hardening
- [x] Final pass: same-origin frontend/backend hosting + iframe-embedding fix, audit log read/CSV export/Activity tab, tenant data export/deletion

---

## Security Validation

- [x] Tenant isolation: cross-tenant access blocked (12 tests)
- [x] NoSQL injection: `$` operator keys rejected
- [x] JWT: string `user_id` rejected with 401
- [x] Body size limit: >256 KB returns 413
- [x] CSP headers: `default-src 'self'`, `frame-ancestors https://*.monday.com`, `frame-src 'none'`, `object-src 'none'` (frame-ancestors added this pass — was missing, which would have blocked monday from embedding the app)
- [x] X-Request-ID: present on every response
- [x] Portal DTO: `tenantId`, `tokenHash`, `targetPrice` not exposed
- [x] `tenantId` injection from body: ignored (JWT wins)
- [x] Document/attachment routes: tenant- and invitation-scoped, cross-tenant and cross-supplier download attempts return 404 (new tests this pass)

---

## Documentation

- [x] USER_GUIDE.md
- [x] INSTALLATION_GUIDE.md
- [x] SECURITY_OVERVIEW.md
- [x] PRIVACY_DATA_MAP.md
- [x] SUPPORT_RUNBOOK.md
- [x] RELEASE_CHECKLIST.md (this file)
- [x] MONETIZATION_PLAN.md
- [x] MARKETPLACE_READINESS.md
- [x] ARCHITECTURE.md
- [x] MONDAY_SETUP.md

---

## Pre-Submission Owner Actions (Not Automated)

These items require manual action by the app owner and are outside the scope of the code release:

- [x] Set `MONDAY_CLIENT_SECRET` in monday Code environment (done 2026-09-03)
- [ ] Set `MONDAY_SIGNING_SECRET` — only once an actual monday-originated webhook route is added (none exists yet)
- [ ] Upload build to monday Code (Developer Center) — server-side push of the whole project (built `dist/` + `dist-server/`), not a separate client-side CDN push (see architecture change: frontend is now served by the same server)
- [ ] Verify `/health` returns `status: "ok"` post-deploy
- [ ] Smoke test: add supplier → create event → send invitation → submit quote → compare → award
- [ ] Review and finalize app listing copy (name, tagline, description, screenshots)
- [ ] Upload app icon (SVG, 200×200)
- [ ] Confirm privacy policy URL
- [ ] Confirm terms of service URL
- [ ] Configure support email
- [ ] Review MONETIZATION_PLAN.md and configure pricing (or leave free)
- [ ] Submit for marketplace review

---

## Rollback Plan

If a critical bug is found post-deploy:

1. In Developer Center → monday Code, roll back to the previous deployed build
2. The previous build is retained for 30 days
3. Notify affected users via in-app notice (update the `PlaceholderPage` component with a banner)

---

## Known Technical Debt (Current)

| Item | Priority | Notes |
|---|---|---|
| Optimistic concurrency on quotes/comparisons/award-line edits | Medium | Settings and award finalization already have version/state guards; quotes and comparisons are effectively single-writer in practice but not enforced |
| Uninstall/deauthorization webhook | Medium | `MONDAY_SIGNING_SECRET` verification function exists and is tested, but nothing calls it yet — no monday-originated webhook route exists |
| Performance test: 500 suppliers, 100 concurrent RFQs | Low | Not exercised against real data volumes yet |
| Pixel-level visual QA of new screens (Comparison, Award Workspace, Activity, Data & Privacy) across breakpoints/dark mode | Low | Built to the existing design-token system and functionally tested; not verified in a live browser at every breakpoint |

**Resolved this pass** (previously listed as technical debt): persistent storage for invitations/quotes/comparisons/awards/settings (all now Mongo-backed with in-memory dev fallback only), email delivery for portal links (deliberate manual-delivery UX, not automated — see Phase 5 of the completion program), real-time-ish quote status updates (20s visibility-aware polling), audit log export (CSV).
