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

Customers can select an Ariavel-managed source or conceptually connect an existing monday supplier board. The monday-board path includes normalized board selection, explicit column mapping, required Supplier Name validation, compatibility guidance and fictional mapping preview.

Milestone 2 uses tenant-scoped in-memory supplier/configuration storage and a mock board provider. It does not read real monday boards, persist across reloads, invite suppliers, collect quotations, normalize bids, calculate landed cost, recommend or create awards, integrate with ERPs, monetize the app, submit it to Marketplace, or promote a production version.
