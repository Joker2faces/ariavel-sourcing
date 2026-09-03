# Project State

## Current Phase
M5 — Supplier Invitations & Portal (security-corrected, operational)

## Branch Stack
```
main (never merged into)
  feature/m5-supplier-portal  ← current branch
```

## Latest Commit
See `git log --oneline -5` for exact SHA.

## Working Tree State
Clean after each commit phase.

## Test Results (M5 post-security-fix)
- 218 tests, 21 test files, all passing
- 0 lint errors
- TSC clean
- Frontend build: OK

## Deployment State
- Client-side: Deployed to CDN (source 13298178.zip) — buyer UI with Settings and InvitationsPanel
- Server-side: NOT yet deployed — requires manual Developer Center action (STOP CONDITION)

## Manual Blockers (genuine user action required)
1. **MONDAY_CLIENT_SECRET** — Required for buyer session token verification. User must create this secret in Developer Center → App Settings → Secrets Manager. Secret key: `MONDAY_CLIENT_SECRET`. Do NOT paste the value in chat.
2. **monday Code setup** — First server deployment activates Document DB automatically. Requires user acceptance of platform terms.
3. **Multi-region** — MUST be decided before public production data. Currently `isMultiRegion: false`. Enabling it is irreversible without user approval.

## Security Corrections Applied (M5)
- **CRITICAL FIX**: `monday.get("sessionToken")` must be verified with `MONDAY_CLIENT_SECRET`, NOT `MONDAY_SIGNING_SECRET`
- Session token payload shape: `{ dat: { account_id, user_id, short_lived_token } }` (not flat `{ accountId, userId }`)
- Separate modules: `verifyBuyerSessionToken()` (CLIENT_SECRET) vs `verifyMondaySignedRequest()` (SIGNING_SECRET)
- Body injection protection: buyer routes explicitly pick only known InvitationInput fields
- Repository create methods put tenantId/createdByUserId AFTER spread to guarantee JWT-derived values always win

## Architecture Summary
- Frontend: React 18 + TypeScript + Vite → monday CDN
- Backend: Node.js Express on monday Code port 8080
- DB: Document DB (MongoDB) via `MNDY_MONGODB_CONNECTION_STRING` (auto-provisioned)
- Buyer auth: `monday.get("sessionToken")` JWT verified with `MONDAY_CLIENT_SECRET`
- Portal auth: SHA-256 hashed invitation token (raw never stored)

## Next Phase
M6 — Bid Intelligence, Commercial Normalization & Landed Cost
Branch to create: `feature/m6-bid-intelligence` FROM `feature/m5-supplier-portal`
