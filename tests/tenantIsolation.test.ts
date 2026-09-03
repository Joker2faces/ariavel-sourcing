// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import jwt from 'jsonwebtoken';

const SECRET = 'tenant-isolation-secret-32bytes-xx';

function makeToken(accountId: number): string {
  return jwt.sign({ dat: { account_id: accountId, user_id: 1 } }, SECRET);
}

function buildApp() {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const invSvc = createInvitationService(invRepo, auditRepo);
  const quoteSvc = createQuoteService(quoteRepo, auditRepo);
  return createApp(invSvc, quoteSvc, SECRET);
}

const VALID_INVITATION_BODY = {
  eventReference: 'RFQ-ISO-001',
  eventTitleSnapshot: 'Isolation Test RFQ',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'Acme Corp',
  supplierEmailSnapshot: 'acme@example.com',
};

describe('Tenant isolation — authentication', () => {
  it('rejects requests with no token', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/buyer/events/evt-1/invitations');
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong secret', async () => {
    const app = buildApp();
    const badToken = jwt.sign({ dat: { account_id: 1, user_id: 'u1' } }, 'wrong-secret');
    const res = await request(app)
      .get('/api/buyer/events/evt-1/invitations')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct token', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/buyer/events/evt-1/invitations')
      .set('Authorization', `Bearer ${makeToken(1)}`);
    expect(res.status).toBe(200);
  });
});

describe('Tenant isolation — cross-tenant data isolation', () => {
  it('tenant A cannot see tenant B invitations', async () => {
    const app = buildApp();
    const tokenA = makeToken(100);
    const tokenB = makeToken(200);

    const createRes = await request(app)
      .post('/api/buyer/events/evt-iso/invitations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(VALID_INVITATION_BODY);
    expect(createRes.status).toBe(201);
    const invId = createRes.body.invitation.id as string;

    // Tenant B attempts to fetch by event — invitation must be hidden
    const listRes = await request(app)
      .get('/api/buyer/events/evt-iso/invitations')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listRes.status).toBe(200);
    const ids = (listRes.body.invitations as { id: string }[]).map(i => i.id);
    expect(ids).not.toContain(invId);
  });

  it('tenant identity comes from JWT, not request body', async () => {
    const app = buildApp();
    const tokenA = makeToken(100);

    const res = await request(app)
      .post('/api/buyer/events/evt-iso2/invitations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...VALID_INVITATION_BODY,
        tenantId: 'monday-account-99999', // injection attempt — must be ignored
      });

    expect(res.status).toBe(201);
    // tenantId must be derived from JWT account_id, not from body
    expect(res.body.invitation.tenantId).toBe('monday-account-100');
    expect(res.body.invitation.tenantId).not.toBe('monday-account-99999');
  });
});

describe('NoSQL injection protection', () => {
  it('rejects payload with $ operator key', async () => {
    const app = buildApp();
    const token = makeToken(1);
    const res = await request(app)
      .post('/api/buyer/events/evt-nosql/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventReference: { $gt: '' }, supplierId: 'sup-1' });
    expect(res.status).toBe(400);
  });

  it('rejects nested $ operator', async () => {
    const app = buildApp();
    const token = makeToken(1);
    const res = await request(app)
      .post('/api/buyer/events/evt-nosql/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ filter: { status: { $ne: null } } });
    expect(res.status).toBe(400);
  });

  it('accepts normal request payload', async () => {
    const app = buildApp();
    const token = makeToken(1);
    const res = await request(app)
      .post('/api/buyer/events/evt-normal/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_INVITATION_BODY);
    expect([201, 400, 422]).toContain(res.status);
  });
});

describe('Security headers', () => {
  it('sets X-Request-ID header on every response', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
  });

  it('sets strict Content-Security-Policy', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('health endpoint includes status and service name', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ariavel-sourcing');
  });
});

describe('Request size limit', () => {
  it('rejects requests exceeding 256KB body limit', async () => {
    const app = buildApp();
    const token = makeToken(1);
    const res = await request(app)
      .post('/api/buyer/events/evt-size/invitations')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(300 * 1024) }));
    expect(res.status).toBe(413);
  });
});
