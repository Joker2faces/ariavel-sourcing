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

| Milestone | Feature | Status |
|---|---|---|
| M1 | App scaffolding, monday SDK integration | ✅ Done |
| M2 | Supplier Master — CRUD, validation, monday board sync | ✅ Done |
| M3 | Sourcing Events — create, manage, lifecycle | ✅ Done |
| M4 | Sourcing Events — filtering, search, deadline tracking | ✅ Done |
| M5 | Supplier portal — invitation tokens, quote submission | ✅ Done |
| M6 | Bid comparison — normalised quote matrix | ✅ Done |
| M7 | Award scenarios — recommended + manual | ✅ Done |
| M8 | Document management — upload/download, per-event library | ✅ Done |
| M9 | Release candidate — onboarding, settings, security hardening | ✅ Done |

---

## Security Checklist

- [x] JWT authentication on all buyer API routes (`monday-account-{id}` tenancy)
- [x] Tenant identity derived from verified JWT only — never from request body
- [x] NoSQL injection middleware (blocks `$`-prefix operator keys)
- [x] Request body size limit: 256 KB
- [x] Strict Content Security Policy via Helmet
- [x] Cross-origin headers: `cors({ origin: false })`
- [x] Rate limiting: 200 req/min buyers, 60 req/min supplier portal
- [x] Request ID tracing (`X-Request-ID` on every response)
- [x] No secrets committed to repository
- [x] Portal DTO hides `tenantId`, `tokenHash`, `targetPrice`, internal notes

---

## Test Coverage

| Suite | Tests | Status |
|---|---|---|
| Domain validation | 12 | ✅ |
| Supplier domain | 8 | ✅ |
| Supplier mapping | 6 | ✅ |
| Supplier repository | 10 | ✅ |
| Supplier service | 12 | ✅ |
| Repository | 4 | ✅ |
| App UI (SourcingHub) | 3 | ✅ |
| Suppliers UI | 8 | ✅ |
| Sourcing events UI | 12 | ✅ |
| Invitation service | ~20 | ✅ |
| Quote service | ~15 | ✅ |
| Bid comparison service | ~12 | ✅ |
| Award service | ~15 | ✅ |
| Document service | ~10 | ✅ |
| Tenant isolation | 12 | ✅ |
| Master E2E (29 steps) | 29 | ✅ |
| **Total** | **338** | **✅ All passing** |

---

## Pre-Submission Tasks (Owner Actions Required)

The following tasks require owner decisions or credentials and cannot be automated:

1. **Enter MONDAY_CLIENT_SECRET** in monday Developer Center
2. **Enter MONDAY_SIGNING_SECRET** for webhook verification
3. **Connect monday Code** to the server environment
4. **App listing copy** — screenshots, description, icon
5. **Legal review** — privacy policy URL, terms of service URL
6. **Monetization decision** — free tier vs. paid plan configuration
7. **Support email** confirmation
8. **Multi-region** — decide whether to enable (requires monday support)

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
