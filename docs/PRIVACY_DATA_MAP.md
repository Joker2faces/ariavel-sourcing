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
| Invitation | id, tenantId, eventId, supplierId, supplierNameSnapshot, supplierEmailSnapshot, status, portalToken hash | In-memory / monday Code | Session lifetime |
| Quote | id, tenantId, invitationId, line items, total, currency, notes | In-memory / monday Code | Session lifetime |
| Bid Comparison | id, tenantId, eventId, normalized quotes | In-memory / monday Code | Session lifetime |
| Award Scenario | id, tenantId, eventId, line allocations | In-memory / monday Code | Session lifetime |
| Document | id, tenantId, eventId, filename, size, mime type, content (base64) | In-memory / monday Code | Session lifetime |
| Audit Log | action, actorId, tenantId, timestamp, details | In-memory / monday Code | Session lifetime |

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

## Data Deletion

- Buyers can delete suppliers via the Supplier Master UI
- Buyers can cancel sourcing events (data retained for audit)
- Full tenant data removal requires contacting support (monday Storage API purge)

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
- Right to erasure: buyer can delete supplier records; full purge available on request
- Data processor: Ariavel acts as processor; monday.com account holder is controller
