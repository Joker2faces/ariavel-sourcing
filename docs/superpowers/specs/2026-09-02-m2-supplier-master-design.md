# Milestone 2 Supplier Master Design

## Purpose

Milestone 2 adds the supplier foundation for Ariavel Sourcing without changing the Milestone 1 sourcing-event behavior. It provides a production-oriented Supplier Master and a provider-driven Supplier Source Setup that supports Ariavel-managed records now and an existing monday supplier board through a replaceable adapter later.

## Scope

The milestone includes supplier search, filters, summary metrics, details, create/edit/status workflows, preferred metadata, manual rating, tenant-aware in-memory persistence, source configuration, normalized monday board descriptors, column mapping, compatibility validation, and mapping preview. It excludes invitations, RFQs, quotations, extraction, awards, ERP integrations, billing, live promotion, and Marketplace submission.

## Architecture

The existing shared-domain, repository, service, and React presentation layers remain in place. Supplier types and validation live under `src/shared`; repositories and tenant/provider adapters live under `src/backend`; services coordinate validation, tenant scoping, search/filtering, and source setup; React consumes only service interfaces and view models.

`DevelopmentTenantContextProvider` is the single development-only source of tenant identity. Repository methods require a `TenantContext`, and every read/write checks that boundary. The in-memory repository copies data at its boundaries so presentation code cannot mutate persisted records.

`MondayBoardProvider` returns normalized `MondayBoardDescriptor` values rather than raw GraphQL payloads. Milestone 2 uses a mock provider. Mapping compatibility, validation, and preview transformation are pure shared-domain functions so a later monday API adapter can replace the mock without changing React business logic.

## Domain

`Supplier` extends the existing type with stable Ariavel identity, optional monday board/item references, supplier code, `ACTIVE | PENDING | INACTIVE | BLOCKED` status, procurement/contact/commercial metadata, `preferred`, optional 1–5 rating, source metadata, and timestamps.

Supplier input normalization trims strings, uppercases currency and Incoterm codes, and converts empty optional strings to `undefined`. Validation requires a non-empty supplier name, valid status, optional syntactically valid email, three-letter uppercase currency, and optional integer rating from 1 through 5.

Source configuration supports `ARIAVEL` and `MONDAY_BOARD`. A monday-board configuration requires a board and a valid Supplier Name mapping. Optional mappings may be absent. Compatibility outcomes are `VALID`, `WARNING`, `MISSING_REQUIRED`, or `UNMAPPED`.

## Repository and services

`SupplierRepository` provides tenant-scoped list, get, create, update, status change, source configuration read, and source configuration save. Cross-tenant access returns no record or a typed not-found failure and never leaks record content.

`SupplierService` validates and normalizes create/update operations, derives search/filter results in one linear pass, computes summary metrics, coordinates status changes, and validates source configuration. Search covers name, code, contact, email, and category, using trimmed case-insensitive matching.

## User experience

The existing shell remains state-driven. Sourcing Events continues to render the Milestone 1 hub. Suppliers opens a dedicated page with a procurement-focused heading, summary cards, search, status/category/country filters, reset, desktop table, and mobile supplier cards.

Details, create/edit, and source setup use accessible modal drawers with labelled controls, keyboard-safe native elements, explicit close/cancel actions, status text, and non-color feedback. Supplier creation and editing show field-level validation and operation feedback. Status changes avoid deletion and require an explicit in-app choice.

Source setup is a compact stepped drawer: choose Ariavel or monday board, choose a normalized mock board, map Ariavel fields, review compatibility messages, preview fictional transformed rows, and save only when required mapping validation succeeds.

## Responsive behavior

Desktop uses a compact table. At narrow widths the table is replaced with supplier cards; drawers occupy the viewport safely; controls wrap or stack; and the page must not create horizontal overflow at 1440, 1024, 768, or 390 CSS pixels.

## Errors and feedback

The Supplier page represents loading, repository failure, empty repository, empty filtered result, validation, and success states. Errors are surfaced in an alert region. Success notices use a status region and are not emitted for passive navigation.

## Testing

Pure tests cover normalization, supplier validation, mapping compatibility/validation/preview, repository CRUD/status/configuration and tenant isolation, and service search/filter/create/update behavior. UI tests cover navigation, filters/reset, create validation and success, edit/details, status change, source setup validation/preview/save, empty results, and Milestone 1 regression.

Runtime QA covers desktop, laptop/tablet, tablet, and mobile viewports, console errors, focusable actions, modal fit, and page-level overflow.

## monday integration and deployment

Real monday board reads are deferred because Apps Framework inspection and authenticated runtime context are unavailable. The mock provider preserves the future adapter seam. After the quality gate, deployment may target only existing app `12049778`, its existing draft version, and the existing Ariavel Sourcing Hub Custom Object. If authentication is still unavailable, no deployment write is attempted and the supported Apps MCP or `mapps` setup is reported.

No new app, duplicate feature, live promotion, release version, credential regeneration, or Marketplace submission is permitted.

## Security and dependencies

No credentials enter source, tests, docs examples, browser code, or commits. Tenant identity is never accepted from form input, query strings, URLs, local storage, or client JSON. No new runtime dependency is expected; React local state and existing testing tools are sufficient.

## Known Milestone 2 limitations

Data resets when the page reloads. Board discovery and mapped supplier reads use fictional provider data. No authenticated monday adapter or Document DB adapter is implemented. Source configuration is tenant-scoped in memory only.
