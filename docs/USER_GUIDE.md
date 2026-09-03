# User Guide — Ariavel Sourcing

## Overview

Ariavel Sourcing is a procurement app for monday.com that helps buying teams manage their entire sourcing cycle — from supplier database to RFQ creation, quote collection, bid comparison, and award decisions — without leaving monday.com.

---

## Navigation

The app has four main sections accessible from the left sidebar:

| Section | Purpose |
|---|---|
| Sourcing Events | Create and manage RFQs, send supplier invitations, collect quotes |
| Suppliers | Build and maintain your supplier master database |
| Awards | Review bid comparisons and make award decisions |
| Settings | Configure organisation preferences and defaults |

---

## Supplier Master

### Adding a Supplier

1. Go to **Suppliers**
2. Click **Add supplier**
3. Fill in: Company name (required), Email, Phone, Country, Category, Tags
4. Click **Save**

### Syncing from a monday Board

If your suppliers are tracked in a monday board:

1. Go to **Settings → Organization**
2. Under "monday Board Integration", select your board and map the Name and Email columns
3. Click **Sync now** — suppliers are imported automatically

### Supplier Status

| Status | Meaning |
|---|---|
| Active | Eligible for invitations |
| On Hold | Excluded from new invitations |
| Inactive | Archived — hidden from selection lists |

---

## Sourcing Events (RFQs)

### Creating a Sourcing Event

1. Go to **Sourcing Events**
2. Click **Create sourcing event**
3. Fill in the wizard:
   - **Step 1 – Details**: Reference number, title, description, currency, deadline
   - **Step 2 – Line items**: Add the items you are sourcing (part number, qty, unit)
   - **Step 3 – Suppliers**: Select suppliers to invite (Active status only)
4. Click **Save as Draft**

### Event Status Lifecycle

```
DRAFT → READY_FOR_INVITATION → OPEN → EVALUATING → AWARDED
                                              └──── CANCELLED
```

### Sending Invitations

1. Open a sourcing event
2. Go to the **Invitations** tab
3. Click **Send invitations** — each selected supplier receives a unique portal link
4. Share the portal link with the supplier (email not automated in M9)

---

## Supplier Portal

Suppliers receive a unique link to a secure portal where they can:

- Review the RFQ details and line items
- Enter their quote (unit price, lead time, notes per line)
- Submit the quote

Once submitted, the quote is locked and cannot be changed. The buyer can see the submission in the Invitations tab.

---

## Bid Comparison

After the invitation deadline:

1. Open the sourcing event
2. Go to the **Comparison** tab
3. Click **Generate comparison** — Ariavel normalises all quotes to a single currency and creates a side-by-side matrix
4. Review the normalised totals and per-line pricing

---

## Award Scenarios

1. In the Comparison view, click **Generate award recommendation**
2. Ariavel calculates the optimal single-supplier or split-award scenario
3. Review the recommended scenario — override individual line allocations as needed
4. Click **Confirm award** to lock the decision

---

## Settings

| Section | What you can configure |
|---|---|
| Organization | Company name, default currency, monday board sync |
| Sourcing | Default RFQ validity, auto-reminders, required fields |
| Comparison | Normalisation weights (price, lead time, quality score) |
| Security | Session timeout, portal link expiry, audit log access |
| Data & Privacy | Export tenant data, request data deletion |
| Billing | View current plan, usage, upgrade options |

---

## First-Run Onboarding

On first launch, a 4-step wizard introduces key features:

1. **Welcome** — what Ariavel Sourcing does
2. **Supplier Database** — how to add and manage suppliers
3. **Create RFQs** — how to build a sourcing event
4. **Compare & Award** — how the bid comparison and award engine works

Click **Skip** to dismiss the wizard at any time. It can be restarted by clearing the `ariavel_onboarding_done` key from your browser's local storage.

---

## Keyboard & Accessibility

- All interactive elements are keyboard-navigable (Tab, Enter, Escape)
- Screen reader support via ARIA labels and live regions
- High-contrast mode supported (WCAG AA)
- Dark theme support via system `prefers-color-scheme`

---

## Troubleshooting

| Problem | Solution |
|---|---|
| App shows a loading spinner that never resolves | Refresh the page; check you are inside a monday.com board |
| "Connection failed" error | Contact your admin to verify the app is deployed correctly |
| Portal link says "not found" | The invitation may have been cancelled — ask the buyer to resend |
| Quote was submitted by mistake | Contact the buyer — portal submissions cannot be self-reversed |
