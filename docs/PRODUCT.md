# Product scope

## Goal

Ariavel Sourcing helps procurement teams compare supplier quotations correctly without rebuilding another Excel spreadsheet. As of this Release Candidate, the full loop is built: RFQs, secure supplier invitations and a public portal, quote submission, normalized bid matrices with landed cost, award scenarios (including split awards), and document/CSV quote exchange with suppliers — all described milestone by milestone below.

## Milestone 1 boundary

This release delivers the Sourcing Hub as a monday Custom Object: summary metrics, recent sourcing events, status/deadline/response visibility, navigation, responsive behavior and a create-event entry point. It intentionally uses a mock data provider.

Not included yet: true `.xlsx` binary import (quote import accepts CSV only — a real Excel workbook must be exported/saved as CSV first), PDF quote extraction, automation, or live promotion. Persistence, supplier invitations, quote entry, real bid normalization, awards write-back, and split awards have since shipped — see docs/PROJECT_STATE.md for current status, not this line.

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

## Milestone 4 — Sourcing Events & RFQ Builder

Milestone 4 replaces the M1 mock hub with a complete procurement event workflow. Buyers can create, edit, save, and manage Sourcing Events (RFQs) with:

- **Multi-step Create Wizard**: Details → Line Items → Suppliers → Review
- **Line Item Management**: add, remove, duplicate lines with description, SKU, quantity, unit, category, specification, target unit price, and requested delivery date
- **Supplier Selection**: only ACTIVE suppliers are eligible; a snapshot of supplier name, code, and email is captured at selection time
- **Lifecycle**: `DRAFT → READY_FOR_INVITATION | CANCELLED`; `READY_FOR_INVITATION → DRAFT | CANCELLED`; `CANCELLED` is terminal
- **READY validation**: requires title, reference, currency, ≥1 line, ≥1 supplier; warns on missing supplier email
- **Reference format**: `RFQ-YYYY-XXXXX` (5 unambiguous alphanumeric characters, auto-generated)
- **Search and filters**: by reference/title/category/description, status, currency, category, deadline state
- **Event Detail Drawer**: tabbed Overview / Lines / Suppliers; inline status transitions; Edit and Cancel actions
- **Summary cards**: Draft, Ready for Invitation, Closing Soon, Cancelled
- **Persistence**: `monday.storage` global scope, `ariavel:sourcing-event:*` namespace, optimistic concurrency (see ADR-002)

Milestone 4 does not collect supplier quotations, normalize bids, calculate landed cost, create awards, or integrate with ERPs.

## Milestone 5 — Supplier Invitations & Portal

Buyers generate a secure, single-use invitation per supplier from a sourcing event (a cryptographically random 256-bit token, hashed with SHA-256 before storage — the raw token is returned exactly once and never persisted or logged). Delivery is deliberately manual, not automated email: the buyer gets a "Link generated — not automatically sent" banner with Copy link, Copy invitation message (a ready-to-paste templated message), and an Open email draft (`mailto:`) action. Invitations progress `CREATED → OPENED → SUBMITTED`, or `REVOKED`/`EXPIRED`; regenerating a token immediately invalidates the previous one.

Suppliers open their invitation at a public portal URL with no monday account required. They see only their own RFQ snapshot, their own quote, and public buyer/company information — never other suppliers, other RFQs, or internal buyer notes. They can save a draft quote (line prices, currency, lead time, MOQ, no-bid per line, commercial terms) and reload it later; submission is one-way and makes the quote immutable evidence for the comparison stage.

## Milestone 6 — Bid Intelligence

Once suppliers submit quotes, the buyer builds a comparison snapshot: pick a base currency, a freight allocation policy (proportional to line value / equal per line / manual), and manual FX rates for every currency quoted. The snapshot is immutable once built — rebuilding creates a new snapshot rather than mutating history, so a later FX change never silently recalculates a comparison someone already acted on. Per line, per supplier: normalized unit price, landed cost (price + freight + duty + handling − discount), and exception flags (no-bid, missing price, MOQ exceeds request, partial quantity, late delivery, long lead time, missing commercial terms, expired quote validity). The Bid Matrix renders this as a sticky-header, internally-scrollable comparison table on the event's Comparison tab.

## Milestone 7 — Award Workspace

From a comparison snapshot, the buyer creates an award scenario — either a recommendation (lowest landed cost per line, computed deterministically) or a blank one built up manually. Per line, the buyer awards to a supplier; overriding the lowest-cost bidder requires a written reason. A line can be split across multiple suppliers (the combined quantity is validated against what was requested), and a line with zero bidders can be explicitly marked no-award so the scenario can still be finalized. Finalizing is a one-way transition to an immutable award record with total cost, savings vs. target, and supplier concentration.

## Milestone 8 — Documents & Quote Ingestion

RFQ and quote attachments are stored via monday's real Object Storage (presigned upload URLs, size/MIME/magic-byte validation, 25 MB limit, server-generated object keys — never the raw filename or a user-supplied path). Downloads are proxied through an authenticated backend route (the platform has no presigned-GET equivalent), scoped so a supplier can only ever reach their own event's RFQ attachments or their own quote attachments. Suppliers can also download a CSV quote template pre-filled with the RFQ's lines, fill it offline, and import it back — validated against the RFQ's actual line IDs, always landing as a DRAFT, never auto-submitting.

## Milestone 9 — Release Candidate

Onboarding wizard (persisted per-tenant, not just per-browser), a fully backend-persisted Settings page (organization, sourcing defaults, comparison policy, security policy — with optimistic-concurrency conflict detection), a React error boundary, and the security hardening described in `docs/SECURITY_OVERVIEW.md`.

## Final Release Candidate Completion Pass

A truth audit against the actual running app (not just tests, which can pass against components that are never wired into the real UI) found and fixed several completeness gaps before this could genuinely be called release-ready: the buyer app never actually called its own backend (no session-token retrieval existed, and there was no same-origin story for reaching it); Object Storage was a hardcoded fake URL with no download route; split award was coded as a comment ("split comes later") rather than actually working; the Bid Matrix and the entire Award Workspace were built but unreachable from the UI; the audit log could be written but never read. All of these are now real. See `docs/PROJECT_STATE.md` for the full list and `docs/RELEASE_CHECKLIST.md` for current test/quality-gate results.

Tenant data export and self-service deletion were also added — previously the only path was "contact support."
