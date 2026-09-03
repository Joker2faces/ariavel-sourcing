# Release Checklist — M9 Release Candidate

## Release: M9 Release Candidate

**Branch:** `feature/release-candidate`
**Date:** 2026-09-03
**Target:** Pre-marketplace submission

---

## Code Quality Gates

- [x] `npx tsc --noEmit -p tsconfig.app.json` — 0 errors
- [x] `npx tsc --noEmit -p tsconfig.server.json` — 0 errors
- [x] `npm test` — 338/338 passing
- [x] `npm run build` — clean Vite production build
- [ ] `npm audit` — run before submission, address high/critical advisories

---

## Feature Completeness

- [x] M1: App shell, monday SDK integration
- [x] M2: Supplier Master (CRUD, validation, board sync)
- [x] M3: Sourcing Events (create, manage lifecycle)
- [x] M4: Sourcing Events (filter, search, deadline tracking)
- [x] M5: Supplier portal (token-based, quote submission)
- [x] M6: Bid comparison (normalised matrix)
- [x] M7: Award scenarios (recommended + manual override)
- [x] M8: Document management (upload/download)
- [x] M9: Onboarding wizard, Settings page, security hardening

---

## Security Validation

- [x] Tenant isolation: cross-tenant access blocked (12 tests)
- [x] NoSQL injection: `$` operator keys rejected
- [x] JWT: string `user_id` rejected with 401
- [x] Body size limit: >256 KB returns 413
- [x] CSP headers: `default-src 'self'`, `frame-src 'none'`, `object-src 'none'`
- [x] X-Request-ID: present on every response
- [x] Portal DTO: `tenantId`, `tokenHash`, `targetPrice` not exposed
- [x] `tenantId` injection from body: ignored (JWT wins)

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

- [ ] Set `MONDAY_CLIENT_SECRET` in monday Code environment
- [ ] Set `MONDAY_SIGNING_SECRET` in monday Code environment
- [ ] Upload build to monday Code (Developer Center)
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

## Known Technical Debt (Post-M9)

| Item | Priority |
|---|---|
| Persistent storage for invitations/quotes (currently in-memory) | High |
| Email delivery for portal links | High |
| Real-time quote status updates (websocket / monday push) | Medium |
| Supplier portal mobile UI polish | Medium |
| Audit log export (CSV) | Low |
| Performance test: 500 suppliers, 100 concurrent RFQs | Low |
