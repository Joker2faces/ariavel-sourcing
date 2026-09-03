# Privacy & Data Map

## What Data We Store

Ariavel Sourcing stores data scoped strictly to each monday.com account (tenant). No data is shared between tenants.

---

## Data Categories

### Buyer-Side Data (Internal)

| Entity | Fields | Storage | Retention |
|---|---|---|---|
| Supplier | id, name, email, phone, country, category, status, mondayItemId, tags, notes | monday Storage API (per tenant) | Until deleted by buyer |
| Sourcing Event | id, reference, title, description, currency, deadline, status, lines[], supplierSelections[] | monday Storage API (per tenant) | Until deleted by buyer |
| Invitation | id, tenantId, eventId, supplierId, supplierNameSnapshot, supplierEmailSnapshot, status, tokenHash | monday Code Document DB (`supplier_invitations`) | Until buyer deletes tenant data |
| Quote | id, tenantId, invitationId, line items, total, currency, notes | monday Code Document DB (`supplier_quotes`) | Until buyer deletes tenant data |
| Bid Comparison | id, tenantId, eventId, normalized quotes | monday Code Document DB (`comparison_snapshots`) | Until buyer deletes tenant data |
| Award Scenario | id, tenantId, eventId, line allocations | monday Code Document DB (`award_scenarios`) | Until buyer deletes tenant data |
| Attachment metadata | id, tenantId, entityId, filename, size, mime type, object key | monday Code Document DB (`attachments`); file bytes in monday Object Storage | Until buyer deletes the attachment or tenant data |
| Tenant Settings | organization/sourcing/comparison/security config | monday Code Document DB (`tenantSettings`) | Until buyer deletes tenant data |
| Audit Log | action, actorId, tenantId, eventId, timestamp, metadata | monday Code Document DB (`audit_events`) | Retained indefinitely, including after a tenant data deletion — see Data Deletion below |

Before monday Code provisions the Document DB / Object Storage bucket (or in local development and automated tests), the above fall back to in-memory storage that resets on restart — this is a deliberate, non-production-only behavior, not a data-loss risk for real tenants.

### Supplier Portal Data (External)

| Entity | Fields Visible to Supplier | Notes |
|---|---|---|
| Invitation (public) | id, eventReference, eventTitleSnapshot, supplierName, status, deadline | No tenantId, no tokenHash, no targetPrice, no buyer notes |
| Quote lines | partNumber, description, qty, unit, currency, unitPrice, leadTimeDays, notes | Only the supplier's own quote |

---

## Data Flows

```
monday.com account (buyer)
    │
    ├── monday SDK (context, storage) ──► App frontend (buyer UI)
    │                                          │
    │                                   monday Code server
    │                                          │
    │                              ┌───────────┴────────────┐
    │                        Buyer API               Portal API
    │                      (JWT-authed)           (token-authed)
    │                              │                    │
    │                         Buyer data          Supplier data
    │                         (internal)         (public DTO only)
    │
    └── Supplier receives portal link via email (buyer action)
        Supplier submits quote via portal URL
```

---

## Personally Identifiable Information (PII)

| PII Field | Where Stored | Legal Basis | Supplier Can Access Own? |
|---|---|---|---|
| Supplier email address | `supplierEmailSnapshot` in Invitation | Legitimate interest (procurement) | No — not exposed via portal |
| Supplier company name | `supplierName` in Invitation public DTO | Legitimate interest | Yes — visible in portal |
| Buyer user ID | JWT `user_id` (never stored) | Authentication | No |
| Buyer account ID | Derived tenant key (never stored as PII) | Authentication | No |

---

## Data Residency

Data is stored in monday Storage API, which follows monday.com's data residency policies. The app does not replicate or export data to external systems.

---

## Data Export & Deletion

- Buyers can delete individual suppliers via the Supplier Master UI, and cancel sourcing events (data retained for audit)
- **Settings → Data & Privacy → Export data**: downloads a JSON file of every invitation, quote, comparison, award, attachment record, setting, and audit event Ariavel stores for the tenant. Never includes `tokenHash` or any secret.
- **Settings → Data & Privacy → Delete all tenant data**: permanently deletes everything above (requires typing the exact confirmation phrase "DELETE MY TENANT DATA"). `audit_events` is deliberately NOT deleted — a minimal accountability record (that the deletion happened, when, by whom) is retained, which is standard practice for erasure requests. This never touches monday.com boards/items — those remain the tenant's own data, managed through monday itself.
- Both actions require a real Document DB connection (they operate directly on monday Code's MongoDB) and are not available against the in-memory dev fallback, which has no persistent data to export or delete in the first place.

---

## Third-Party Data Sharing

None. No analytics, no telemetry, no advertising SDKs. The only external connection is `https://*.monday.com` for the monday SDK and API.

---

## Cookies & Local Storage

| Key | Purpose | Scope |
|---|---|---|
| `ariavel_onboarding_done` | Tracks first-run wizard completion | Per browser, per user |

No cookies are set by the app.

---

## GDPR / Privacy Compliance Notes

- Data minimisation: only supplier contact fields required for procurement are collected
- Purpose limitation: data used only for sourcing workflow within the tenant
- Access control: all data gated by monday.com JWT (account-level auth)
- Right to erasure: buyer can delete individual supplier records, or self-service delete all Ariavel-owned tenant data from Settings → Data & Privacy (see Data Export & Deletion above)
- Data processor: Ariavel acts as processor; monday.com account holder is controller
