# Monetization Plan

## Overview

This document outlines the monetization strategy for Ariavel Sourcing on the monday.com Marketplace. No monetization has been configured yet — this is a planning document for owner review before submission.

---

## Recommended Tiers

### Tier 1 — Starter (Free)

**Target:** Small procurement teams trying the app.

| Limit | Value |
|---|---|
| Suppliers | 50 |
| Active sourcing events | 5 |
| Invitations per event | 10 |
| Document storage | 50 MB |
| Users | 3 |

### Tier 2 — Professional (Paid)

**Suggested price:** $29/seat/month

**Target:** Mid-size procurement teams running regular RFQ cycles.

| Limit | Value |
|---|---|
| Suppliers | Unlimited |
| Active sourcing events | Unlimited |
| Invitations per event | Unlimited |
| Document storage | 5 GB |
| Users | Unlimited |
| Bid comparison | ✅ |
| Award scenarios | ✅ |

### Tier 3 — Enterprise (Custom)

**Suggested price:** Contact sales

**Target:** Large procurement organisations with compliance requirements.

Includes everything in Professional plus:
- Dedicated support SLA
- Custom data retention policies
- Audit log export
- SSO/SAML (if monday.com supports it)
- Multi-region data residency

---

## Monday.com Monetization Requirements

To enable paid plans, the app owner must:

1. In Developer Center, go to **Monetization** tab
2. Complete business and billing information
3. Accept monday.com Marketplace Partner Agreement
4. Define plan names and prices in the Monetization dashboard
5. Implement entitlement checks using `EntitlementService` (already scaffolded in `src/backend/entitlement/entitlementService.ts`)

**Stop condition:** Do not enable monetization without owner decision and legal review.

---

## Entitlement Integration

The `EntitlementService` (`src/backend/entitlement/entitlementService.ts`) is already integrated and returns all features as enabled for development accounts.

In production, entitlement checks should be wired to the monday Monetization API:

```typescript
// Future implementation:
async function isFeatureEnabled(tenantId: string, feature: string): Promise<boolean> {
  const plan = await mondayMonetizationApi.getPlan(tenantId);
  return PLAN_FEATURES[plan.tier].includes(feature);
}
```

Current feature flags scaffolded:

| Feature Flag | Free | Pro | Enterprise |
|---|---|---|---|
| `supplier_sync` | ✅ | ✅ | ✅ |
| `bid_comparison` | ❌ | ✅ | ✅ |
| `award_scenarios` | ❌ | ✅ | ✅ |
| `document_management` | ❌ | ✅ | ✅ |
| `audit_export` | ❌ | ❌ | ✅ |

---

## Revenue Projections (Illustrative)

These are illustrative targets only — not commitments.

| Year | Accounts | Avg Revenue | ARR |
|---|---|---|---|
| Y1 | 50 | $500/yr | $25K |
| Y2 | 200 | $600/yr | $120K |
| Y3 | 500 | $700/yr | $350K |

---

## Decision Required

Before submission, the owner must decide:

1. **Launch as free** (no monetization setup needed, can add later)
2. **Launch with freemium** (configure Starter + Professional tiers)
3. **Launch as paid-only** (requires Monetization setup before approval)

Recommendation: **Launch as free** to maximise installs and gather feedback, then activate monetization once product-market fit is confirmed.
