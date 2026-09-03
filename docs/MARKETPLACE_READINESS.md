# Marketplace Readiness Checklist

## Status: Release Candidate (M9) — Pre-Submission

This document tracks the readiness of the Ariavel Sourcing app for monday.com Marketplace submission.

---

## App Identity

| Field | Value |
|---|---|
| App Name | Ariavel Sourcing |
| App ID | 12049778 |
| Feature ID | 123330040 |
| Draft Version | 17506248 |
| Type | Custom Object (monday Code) |
| Category | Procurement & Supply Chain |

---

## Functional Completeness

Status categories used below (per instruction, not "complete because tests exist"): **Implemented** (code exists), **Verified locally** (tests + manual reasoning confirm it works end-to-end), **Verified on monday Draft** (actually exercised against the deployed draft), **Requires installation QA** (needs the app installed in a real workspace to fully verify), **Requires owner/legal action**.

| Milestone | Feature | Status |
|---|---|---|
| M1 | App scaffolding, monday SDK integration | Verified locally |
| M2 | Supplier Master — CRUD, validation, monday board sync | Verified locally |
| M3 | Sourcing Events — create, manage, lifecycle | Verified locally |
| M4 | Sourcing Events — filtering, search, deadline tracking | Verified locally |
| M5 | Supplier portal — invitation tokens, quote submission | Verified locally (backend + UI wired; buyer session-token path only reachable inside monday — see Requires installation QA below) |
| M6 | Bid comparison — normalised quote matrix, now reachable via a Comparison tab | Verified locally |
| M7 | Award scenarios — recommended + manual override + **real split award** (previously stubbed), now reachable via the Award Workspace | Verified locally |
| M8 | Document management — real monday Object Storage adapter (previously a hardcoded fake URL), supplier-side router now mounted | Verified locally |
| M9 | Onboarding, Settings (now backend-persisted), security hardening | Verified locally |
| Final RC pass | Same-origin frontend/backend hosting, iframe-embedding fix, audit log read/export, tenant data export/deletion, invitation delivery UX, status polling | Verified locally |

**Requires installation QA** (cannot be fully verified until the app is installed in a live monday workspace): the actual `monday.get("sessionToken")` round-trip end to end, iframe rendering inside monday's own UI, board-mode role restrictions (Admin/Member/Viewer/Guest) under real monday permissions, Document DB and Object Storage behavior with a real provisioned bucket/connection string.

---

## Security Checklist

- [x] JWT authentication on all buyer API routes (`monday-account-{id}` tenancy)
- [x] Tenant identity derived from verified JWT only — never from request body
- [x] NoSQL injection middleware (blocks `$`-prefix operator keys)
- [x] Request body size limit: 256 KB; file upload limit 25 MB with MIME/magic-byte/extension checks
- [x] Strict Content Security Policy via Helmet, including `frame-ancestors https://*.monday.com` (fixed this pass — was missing, which combined with Helmet's default `X-Frame-Options` would have blocked monday from ever embedding the app)
- [x] Same-origin hosting: frontend served from the same Express app as the API (fixed this pass — previously there was no working story for the frontend to reach its own backend at all)
- [x] Rate limiting: 200 req/min buyers, 60 req/min supplier portal
- [x] Request ID tracing (`X-Request-ID` on every response)
- [x] No secrets committed to repository
- [x] Portal DTO hides `tenantId`, `tokenHash`, `targetPrice`, internal notes
- [x] Attachment/document routes tenant- and invitation-scoped (buyer and portal download routes added this pass, with cross-tenant and cross-supplier isolation tests)
- [x] Tenant data export and deletion implemented (previously "contact support")

---

## Test Coverage

**414 tests, 39 test files, all passing** (fresh run, 2026-09-03) — up from 338/28 at the start of this pass. New coverage added this pass: Object Storage adapter + document routes, tenant settings service + routes, split-award service logic, Award Workspace and Comparison Panel components, audit query/export service + routes + Activity tab, invitation delivery UX, tenant data export/deletion service + routes. Historical per-suite breakdowns are not reproduced here — they drift too fast to keep accurate; run `npm test` for the current count.

---

## Pre-Submission Tasks (Owner Actions Required)

The following tasks require owner decisions or credentials and cannot be automated:

1. ~~Enter MONDAY_CLIENT_SECRET~~ — done (2026-09-03)
2. **Enter MONDAY_SIGNING_SECRET** — only needed once an actual monday-originated webhook/lifecycle route is added (none exists yet; the verification function is written and tested but unwired)
3. **App listing copy** — screenshots, description, icon
4. **Legal review** — privacy policy URL, terms of service URL
5. **Monetization decision** — free tier vs. paid plan configuration
6. **Support email** confirmation
7. **Multi-region** — decide whether to enable (requires monday support)
8. **App installation** — required for the installation-QA items above
9. **Marketplace submission** — final Submit click in Developer Center

---

## Documentation Status

| Document | Status |
|---|---|
| USER_GUIDE.md | ✅ Complete |
| INSTALLATION_GUIDE.md | ✅ Complete |
| SECURITY_OVERVIEW.md | ✅ Complete |
| PRIVACY_DATA_MAP.md | ✅ Complete |
| SUPPORT_RUNBOOK.md | ✅ Complete |
| RELEASE_CHECKLIST.md | ✅ Complete |
| MONETIZATION_PLAN.md | ✅ Complete |
| ARCHITECTURE.md | ✅ Complete |
