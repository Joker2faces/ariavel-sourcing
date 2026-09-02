# Milestone 2 Supplier Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tenant-safe Supplier Master and provider-driven supplier-source setup while preserving the Milestone 1 Sourcing Hub.

**Architecture:** Extend the existing shared domain, repository, service, and state-driven React layers. Keep tenant identity, persistence, monday board discovery, mapping logic, and presentation behind focused interfaces so mock adapters can later be replaced without changing frontend business logic.

**Tech Stack:** React 18, TypeScript 5, Vite 6, Vitest, Testing Library, Playwright, existing CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-m2-supplier-master-design.md`

## Global Constraints

- Extend the existing Milestone 1 project; do not scaffold or rewrite it.
- Work only on `feature/m2-supplier-master`; do not merge or force-push `main`.
- Use `DevelopmentTenantContextProvider` as the only development tenant source.
- Keep business, mapping, and validation rules outside React components.
- Add no router, global state library, form framework, or UI framework.
- Use fictional suppliers and reserved `.example` email domains only.
- Do not implement real monday reads without trusted authenticated context.
- Do not create a monday app or feature, promote live, release, or submit to Marketplace.
- Never expose, write, or commit credentials.

---

### Task 1: Supplier domain and mapping rules

**Files:**
- Modify: `src/shared/types/domain.ts`
- Create: `src/shared/validation/supplierValidation.ts`
- Create: `src/shared/mapping/supplierMapping.ts`
- Test: `tests/supplierDomain.test.ts`
- Test: `tests/supplierMapping.test.ts`

**Interfaces:**
- Produces: `Supplier`, `SupplierInput`, `SupplierStatus`, `SupplierSource`, `SupplierSourceConfiguration`, `MondayBoardDescriptor`, `SupplierFieldKey`, `normalizeSupplierInput`, `validateSupplierInput`, `validateSupplierBoardMapping`, `previewMappedSuppliers`.

- [ ] Write literal, table-driven failing tests for required name, email, currency, rating, status, normalization, required name mapping, optional mappings, incompatible columns, and preview transformation.
- [ ] Run `npm test -- tests/supplierDomain.test.ts tests/supplierMapping.test.ts` and confirm failures are caused by missing domain behavior.
- [ ] Extend the shared domain and implement the smallest pure validation/mapping functions that satisfy the tests.
- [ ] Re-run the focused tests and refactor only while green.

### Task 2: Tenant context, repository, provider, and service

**Files:**
- Create: `src/backend/tenancy/tenantContext.ts`
- Create: `src/backend/repositories/supplierRepository.ts`
- Create: `src/backend/repositories/inMemorySupplierRepository.ts`
- Create: `src/backend/providers/mondayBoardProvider.ts`
- Create: `src/backend/providers/mockMondayBoardProvider.ts`
- Create: `src/backend/services/supplierService.ts`
- Test: `tests/supplierRepository.test.ts`
- Test: `tests/supplierService.test.ts`

**Interfaces:**
- Consumes: Task 1 supplier and mapping types/functions.
- Produces: `TenantContextProvider`, `developmentTenantContextProvider`, `SupplierRepository`, `createInMemorySupplierRepository`, `MondayBoardProvider`, `mockMondayBoardProvider`, and `createSupplierService`.

- [ ] Write failing repository tests for tenant-scoped list/get/create/update/status/configuration and cross-tenant denial.
- [ ] Run `npm test -- tests/supplierRepository.test.ts` and verify expected failures.
- [ ] Implement the tenant provider and defensive-copying in-memory repository; re-run until green.
- [ ] Write failing service tests for search normalization, combined filters, summaries, validated create/update, status, mapping validation, and provider access.
- [ ] Run `npm test -- tests/supplierService.test.ts` and verify expected failures.
- [ ] Implement the service and normalized fictional board provider; re-run focused and existing tests.

### Task 3: Supplier Master presentation

**Files:**
- Modify: `src/frontend/App.tsx`
- Modify: `src/frontend/components/Icon.tsx`
- Create: `src/frontend/suppliers/SuppliersPage.tsx`
- Create: `src/frontend/suppliers/SupplierFormDrawer.tsx`
- Create: `src/frontend/suppliers/SupplierDetailsDrawer.tsx`
- Modify: `src/frontend/styles.css`
- Test: `tests/app.test.tsx`
- Test: `tests/suppliersUi.test.tsx`

**Interfaces:**
- Consumes: `createSupplierService`, `developmentTenantContextProvider`, and the supplier service methods from Task 2.
- Produces: functional Suppliers navigation, search/filter/reset, summary metrics, responsive table/cards, details, create/edit, and status change workflows.

- [ ] Add failing UI tests for Supplier navigation, search, status/category/country filters, reset, details, add validation/success, edit, and status change.
- [ ] Run `npm test -- tests/app.test.tsx tests/suppliersUi.test.tsx` and confirm the missing Supplier UI causes the failures.
- [ ] Split the shell from the Supplier page only as needed, wire service-driven state, and implement accessible drawers and feedback.
- [ ] Add responsive styles that hide the desktop table and show supplier cards below 650px.
- [ ] Re-run focused tests and Milestone 1 regression tests; refactor expensive derived lists behind `useMemo` with primitive dependencies.

### Task 4: Supplier Source Setup

**Files:**
- Create: `src/frontend/suppliers/SupplierSourceDrawer.tsx`
- Modify: `src/frontend/suppliers/SuppliersPage.tsx`
- Modify: `src/frontend/styles.css`
- Modify: `tests/suppliersUi.test.tsx`

**Interfaces:**
- Consumes: normalized board provider, source-configuration service, compatibility/validation/preview functions.
- Produces: Ariavel/monday choice, board selection, mapping table, required-name validation, compatibility feedback, preview, and saved tenant-scoped configuration.

- [ ] Add failing UI tests for opening setup, choosing monday board, blocking save without Supplier Name, warning on incompatible mapping, rendering preview, and saving valid configuration.
- [ ] Run the focused UI test and verify failures reflect the absent workflow.
- [ ] Implement the accessible stepped drawer without embedding mock board data or compatibility rules in JSX.
- [ ] Re-run focused and full tests.

### Task 5: Documentation, quality gate, and runtime QA

**Files:**
- Modify: `README.md`
- Modify: `docs/PRODUCT.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/MONDAY_SETUP.md`

**Interfaces:**
- Consumes: completed implementation and current official monday deployment guidance.
- Produces: Milestone 2 usage, architecture, limitations, and authenticated draft-deployment instructions.

- [ ] Document implemented behavior, tenant boundary, provider seams, in-memory limitation, deferred real monday reads, and strict deployment boundary.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`; record exact test totals and fix only test-proven defects.
- [ ] Start Vite locally and use the Browser plugin to test Sourcing Hub and Suppliers at 1440, 1024, 768, and 390 pixels, including interaction flows, console health, and horizontal overflow.
- [ ] Review `git status`, `git diff --check`, `git diff --stat`, tracked/untracked files, and staged content for credentials or build artifacts.
- [ ] Commit logical Milestone 2 changes on `feature/m2-supplier-master` and push that branch to origin if GitHub authentication succeeds.
- [ ] Re-check Apps Framework authentication. If unavailable, perform no monday write and report the minimal supported Apps MCP or `mapps init` setup for app `12049778`.
