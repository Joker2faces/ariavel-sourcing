# Product scope

## Goal

Ariavel Sourcing helps procurement teams compare supplier quotations correctly without rebuilding another Excel spreadsheet. It will grow toward RFQs, supplier responses, normalized bid matrices, commercial terms, supplier evaluation and award decisions.

## Milestone 1 boundary

This release delivers the Sourcing Hub as a monday Custom Object: summary metrics, recent sourcing events, status/deadline/response visibility, navigation, responsive behavior and a create-event entry point. It intentionally uses a mock data provider.

Not included yet: persistence, supplier invitations, quote entry, PDF/Excel import, real bid normalization, awards write-back, split awards, automation or live promotion.

## Milestone 2 — Supplier Master

Milestone 2 establishes the supplier foundation used by later sourcing workflows. Procurement users can browse a professional Supplier Master, search and filter records, inspect complete supplier details, create or edit supplier profiles, change lifecycle status, and maintain manual preferred and 1–5 rating metadata.

Supplier status semantics are:

- `ACTIVE`: eligible for future sourcing participation.
- `PENDING`: onboarding or profile completion is in progress.
- `INACTIVE`: retained historically but not currently used.
- `BLOCKED`: must not be automatically selected for sourcing.

Customers can select an Ariavel-managed source or connect an existing monday supplier board. The monday-board path includes board selection, explicit column mapping with required Supplier Name validation, compatibility guidance, and preview.

## Milestone 3 — Real Monday Runtime & Persistent Data Foundation

Milestone 3 makes the app fully functional inside a real monday workspace:

- Supplier records are persisted durably in `monday.storage` (global scope). Records survive page reloads and are shared across all app instances within the workspace.
- Tenant identity comes exclusively from the authenticated monday context (`account.id`). No form input, URL parameter, or localStorage value is ever accepted as a tenant identifier.
- Real monday boards are discovered and read via `monday.api()` with the `boards:read` OAuth scope. Board items are paginated using `items_page` cursors.
- Role-based access: admins can configure the supplier source; view-only and guest users have progressively restricted access. Board-mode views are read-only for all users.
- Graceful local development fallback: when running outside monday (or in tests), mock providers are substituted transparently with no code change.
- Professional loading, error, and permission states are shown during SDK initialization and board discovery.

Milestone 3 does not invite suppliers, collect quotations, normalize bids, calculate landed cost, create awards, integrate with ERPs, monetize the app, submit to Marketplace, or promote a production version.
