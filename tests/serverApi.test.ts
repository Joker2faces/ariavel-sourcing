// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';

// Monday session tokens are signed with the CLIENT SECRET, not the Signing Secret.
const CLIENT_SECRET = 'test-client-secret-minimum-32-chars-long!!';
const TENANT_ACCOUNT_ID = 9999;
const USER_ID = 42;

function makeApp() {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const app = createApp(invService, quoteService, CLIENT_SECRET);
  return { app, invService };
}

// Monday session tokens carry payload under the 'dat' field: { dat: { account_id, user_id } }
function makeBuyerToken(accountId = TENANT_ACCOUNT_ID, userId = USER_ID) {
  return jwt.sign({ dat: { account_id: accountId, user_id: userId, short_lived_token: 'slt' } }, CLIENT_SECRET, { expiresIn: '1h' });
}

const baseInvBody = {
  eventReference: 'RFQ-2026-001',
  eventTitleSnapshot: 'Test RFQ',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'ACME Ltd',
  supplierEmailSnapshot: 'acme@example.com',
};

describe('Server API', () => {
  describe('GET /health', () => {
    it('returns 200 ok', async () => {
      const { app } = makeApp();
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('monday iframe embedding', () => {
    it('does not send X-Frame-Options (would block monday.com framing this app)', async () => {
      const { app } = makeApp();
      const res = await request(app).get('/health');
      expect(res.headers['x-frame-options']).toBeUndefined();
    });

    it('allows framing by monday.com via CSP frame-ancestors', async () => {
      const { app } = makeApp();
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toContain('frame-ancestors https://*.monday.com');
    });
  });

  describe('static frontend serving (same-origin with the API)', () => {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distDir, 'index.html');
    let createdFixture = false;

    beforeEach(() => {
      if (!fs.existsSync(indexPath)) {
        fs.mkdirSync(distDir, { recursive: true });
        fs.writeFileSync(indexPath, '<!doctype html><html><body>test</body></html>');
        createdFixture = true;
      }
    });

    afterEach(() => {
      if (createdFixture) {
        fs.rmSync(indexPath, { force: true });
        createdFixture = false;
      }
    });

    it('serves index.html at the root', async () => {
      const { app } = makeApp();
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('falls back to index.html for unknown SPA routes, but not for /api or /health', async () => {
      const { app } = makeApp();
      const spa = await request(app).get('/sourcing-events/some-id');
      expect(spa.status).toBe(200);
      expect(spa.headers['content-type']).toContain('text/html');

      const health = await request(app).get('/health');
      expect(health.body.status).toBe('ok');

      const api = await request(app).get('/api/buyer/events/x/invitations');
      expect(api.status).toBe(401); // reaches the auth middleware, not the SPA fallback
    });
  });

  describe('Buyer auth middleware', () => {
    it('rejects requests without Authorization header', async () => {
      const { app } = makeApp();
      const res = await request(app).get('/api/buyer/events/event-1/invitations');
      expect(res.status).toBe(401);
    });

    it('rejects expired JWT', async () => {
      const { app } = makeApp();
      const token = jwt.sign({ dat: { account_id: TENANT_ACCOUNT_ID, user_id: USER_ID } }, CLIENT_SECRET, { expiresIn: '-1s' });
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects JWT signed with wrong secret (signing secret cannot impersonate buyer)', async () => {
      const { app } = makeApp();
      // Using SIGNING_SECRET instead of CLIENT_SECRET must fail
      const SIGNING_SECRET = 'completely-different-signing-secret-value!!';
      const token = jwt.sign({ dat: { account_id: TENANT_ACCOUNT_ID, user_id: USER_ID } }, SIGNING_SECRET);
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects token with missing dat field', async () => {
      const { app } = makeApp();
      const token = jwt.sign({ accountId: TENANT_ACCOUNT_ID, userId: USER_ID }, CLIENT_SECRET);
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects token with missing account_id', async () => {
      const { app } = makeApp();
      const token = jwt.sign({ dat: { user_id: USER_ID } }, CLIENT_SECRET);
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects token with missing user_id', async () => {
      const { app } = makeApp();
      const token = jwt.sign({ dat: { account_id: TENANT_ACCOUNT_ID } }, CLIENT_SECRET);
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects malformed Bearer token', async () => {
      const { app } = makeApp();
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
    });

    it('derives tenantId from verified token — buyer cannot inject different tenant', async () => {
      const { app } = makeApp();
      const token = makeBuyerToken(9999, USER_ID);
      // Even if body contains a different tenantId, it must be ignored
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...baseInvBody, tenantId: 'malicious-tenant' });
      expect(createRes.status).toBe(201);
      // The invitation's tenantId comes from the JWT, not the body
      expect(createRes.body.invitation.tenantId).toBe('monday-account-9999');
    });
  });

  describe('Buyer routes - Invitations', () => {
    let app: ReturnType<typeof makeApp>['app'];
    let token: string;
    beforeEach(() => {
      ({ app } = makeApp());
      token = makeBuyerToken();
    });

    it('GET /api/buyer/events/:id/invitations returns empty array initially', async () => {
      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.invitations).toHaveLength(0);
    });

    it('POST /api/buyer/events/:id/invitations creates invitation and returns token', async () => {
      const res = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send(baseInvBody);
      expect(res.status).toBe(201);
      expect(res.body.invitation.status).toBe('CREATED');
      expect(res.body.portalToken).toHaveLength(64);
    });

    it('POST /api/buyer/invitations/:id/revoke revokes invitation', async () => {
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send(baseInvBody);
      const invId = createRes.body.invitation.id;

      const revokeRes = await request(app)
        .post(`/api/buyer/invitations/${invId}/revoke`)
        .set('Authorization', `Bearer ${token}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.invitation.status).toBe('REVOKED');
    });

    it('POST /api/buyer/invitations/:id/regenerate issues new portal token', async () => {
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send(baseInvBody);
      const invId = createRes.body.invitation.id;
      const oldToken = createRes.body.portalToken;

      const regenRes = await request(app)
        .post(`/api/buyer/invitations/${invId}/regenerate`)
        .set('Authorization', `Bearer ${token}`);
      expect(regenRes.status).toBe(200);
      expect(regenRes.body.portalToken).not.toBe(oldToken);
      expect(regenRes.body.portalToken).toHaveLength(64);
    });
  });

  describe('Portal routes', () => {
    it('GET /api/portal/invitations/:token returns invitation and transitions to OPENED', async () => {
      const { app } = makeApp();
      const token = makeBuyerToken();
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send(baseInvBody);
      const portalToken = createRes.body.portalToken;

      const portalRes = await request(app).get(`/api/portal/invitations/${portalToken}`);
      expect(portalRes.status).toBe(200);
      expect(portalRes.body.invitation.status).toBe('OPENED');
      expect(portalRes.body.invitation.eventReference).toBe('RFQ-2026-001');
      expect(portalRes.body.invitation).not.toHaveProperty('tokenHash');
    });

    it('GET /api/portal/invitations/:token returns 404 for unknown token', async () => {
      const { app } = makeApp();
      const res = await request(app).get(`/api/portal/invitations/${'a'.repeat(64)}`);
      expect(res.status).toBe(404);
    });

    it('GET /api/portal/invitations/:token/quote returns null before any quote', async () => {
      const { app } = makeApp();
      const token = makeBuyerToken();
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${token}`)
        .send(baseInvBody);
      const portalToken = createRes.body.portalToken;
      await request(app).get(`/api/portal/invitations/${portalToken}`);

      const quoteRes = await request(app).get(`/api/portal/invitations/${portalToken}/quote`);
      expect(quoteRes.status).toBe(200);
      expect(quoteRes.body.quote).toBeNull();
    });

    it('PUT /api/portal/invitations/:token/quote saves draft', async () => {
      const { app } = makeApp();
      const buyerToken = makeBuyerToken();
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(baseInvBody);
      const portalToken = createRes.body.portalToken;
      await request(app).get(`/api/portal/invitations/${portalToken}`);

      const draftRes = await request(app)
        .put(`/api/portal/invitations/${portalToken}/quote`)
        .send({ lines: [{ lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 10 }], paymentTerms: 'Net 30' });
      expect(draftRes.status).toBe(200);
      expect(draftRes.body.quote.status).toBe('DRAFT');
    });

    it('POST /api/portal/invitations/:token/submit submits quote', async () => {
      const { app } = makeApp();
      const buyerToken = makeBuyerToken();
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(baseInvBody);
      const portalToken = createRes.body.portalToken;
      await request(app).get(`/api/portal/invitations/${portalToken}`);
      await request(app)
        .put(`/api/portal/invitations/${portalToken}/quote`)
        .send({ lines: [{ lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 10 }] });

      const submitRes = await request(app).post(`/api/portal/invitations/${portalToken}/submit`);
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.quote.status).toBe('SUBMITTED');
    });

    it('portal does not expose internal buyer fields', async () => {
      const { app } = makeApp();
      const buyerToken = makeBuyerToken();
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(baseInvBody);
      const portalToken = createRes.body.portalToken;
      const portalRes = await request(app).get(`/api/portal/invitations/${portalToken}`);
      const inv = portalRes.body.invitation;
      expect(inv).not.toHaveProperty('tokenHash');
      expect(inv).not.toHaveProperty('createdByUserId');
      expect(inv).not.toHaveProperty('tenantId');
    });

    it('revoked invitation returns 410 on portal access', async () => {
      const { app } = makeApp();
      const buyerToken = makeBuyerToken();
      const createRes = await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(baseInvBody);
      const portalToken = createRes.body.portalToken;
      const invId = createRes.body.invitation.id;
      await request(app)
        .post(`/api/buyer/invitations/${invId}/revoke`)
        .set('Authorization', `Bearer ${buyerToken}`);

      const portalRes = await request(app).get(`/api/portal/invitations/${portalToken}`);
      expect(portalRes.status).toBe(410);
    });
  });

  describe('Security: tenant isolation', () => {
    it('buyer cannot see invitations from another tenant', async () => {
      const { app } = makeApp();
      const tokenA = makeBuyerToken(1001, 1);
      const tokenB = makeBuyerToken(1002, 2);

      await request(app)
        .post('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(baseInvBody);

      const res = await request(app)
        .get('/api/buyer/events/event-1/invitations')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.body.invitations).toHaveLength(0);
    });
  });
});
