# Support Runbook

## First-Line Triage

### Health Check

```
GET /health
```

Expected response (healthy):
```json
{
  "status": "ok",
  "service": "ariavel-sourcing",
  "checks": { "api": true }
}
```

Degraded response (503):
```json
{
  "status": "degraded",
  "service": "ariavel-sourcing",
  "checks": { "api": true, "db": false }
}
```

---

## Common Issues

### App shows "Connection failed" on load

**Cause:** monday SDK context fetch failed — usually a monday Code deploy issue or the app is opened outside monday.com.

**Fix:**
1. Verify the app is opened inside a monday.com board as a Custom Object view
2. Check monday Code logs in Developer Center → App → monday Code
3. Confirm `MONDAY_CLIENT_SECRET` environment variable is set
4. Reload the page

---

### Buyer gets 401 on all API calls

**Cause:** JWT verification failing.

**Diagnosis:** Check request headers for `Authorization: Bearer <token>`. Verify token is signed with the correct `MONDAY_CLIENT_SECRET`.

**Fix:**
1. In Developer Center, confirm the Client Secret matches what's deployed
2. Redeploy monday Code with the correct secret

---

### Supplier says portal link does not work

**Cause:** Invitation may be cancelled, already submitted, or the token has been rotated.

**Diagnosis:**
1. Buyer checks invitation status in the Sourcing Events page → Invitation tab
2. If status is `SUBMITTED` or `CANCELLED`, a new invitation must be sent

**Fix:** Buyer resends the invitation from the Invitations panel.

---

### 400 "Invalid request payload"

**Cause:** NoSQL injection middleware blocked a payload containing `$`-prefix keys.

**Fix:** Ensure the request body does not contain MongoDB operator syntax. This is a security block — if triggered by legitimate data, review the payload for accidental `$` characters in field values.

---

### 413 "Request Entity Too Large"

**Cause:** Request body exceeds 256 KB.

**Fix:** Reduce payload size. For document uploads, check file size before sending (max recommended: 200 KB per document).

---

### Sourcing events not loading

**Cause:** `createSourcingEventService` failed to initialise — typically a monday Storage read error.

**Diagnosis:** Check X-Request-ID in browser network tab, correlate with monday Code server logs.

**Fix:** Retry. If persistent, check monday Storage quota in the account.

---

## Log Correlation

Every response includes `X-Request-ID` (16-char hex). To trace a user-reported error:

1. Ask the user to open browser Dev Tools → Network tab
2. Find the failed request
3. Copy the `X-Request-ID` response header value
4. Search monday Code server logs for that ID

---

## Escalation Matrix

| Severity | Description | Response Time | Owner |
|---|---|---|---|
| P1 | All buyers in a tenant locked out | 2 hours | App developer |
| P2 | Specific feature broken (e.g., portal) | Next business day | App developer |
| P3 | UI cosmetic or minor UX issue | Sprint backlog | App developer |
| P4 | Feature request | Backlog | Product owner |

---

## Deployment Checklist

Before each monday Code deploy:

1. `npm run build` — confirm no TypeScript errors
2. `npm test` — confirm 338/338 passing
3. Set `MONDAY_CLIENT_SECRET` and `MONDAY_SIGNING_SECRET` in monday Code environment
4. Deploy via Developer Center → App → monday Code → Upload
5. Hit `/health` endpoint and confirm `status: "ok"`
6. Smoke-test: create one supplier, one event, send one portal invitation

---

## Known Limitations (M9)

- Invitation tokens, quotes, comparisons, and awards are stored in-memory in the monday Code process — they reset on server restart. Production persistence requires external storage (not yet implemented).
- Document content is stored as base64 in memory — max practical file size ~200 KB.
- No email delivery — buyers must manually copy and send portal links.
