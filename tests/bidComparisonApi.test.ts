// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInMemoryComparisonRepository } from '../src/server/db/inMemoryComparisonRepository';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createBidComparisonService } from '../src/server/services/bidComparisonService';
import type { SupplierInvitation } from '../src/server/types/invitation';
import type { SupplierQuote } from '../src/server/types/quote';

const CLIENT_SECRET = 'api-test-client-secret-min-32-chars!!';
const ACCOUNT_ID = 9999;
const USER_ID = 42;
const TENANT = `monday-account-${ACCOUNT_ID}`;
const EVENT_ID = 'event-abc';
const NOW = '2026-09-03T10:00:00.000Z';

function makeBuyerToken(accountId = ACCOUNT_ID, userId = USER_ID) {
  return jwt.sign({ dat: { account_id: accountId, user_id: userId, short_lived_token: 'slt' } }, CLIENT_SECRET, { expiresIn: '1h' });
}

const EVENT_LINES = [
  { id: 'line-1', description: 'Widget A', sku: 'W-001', quantity: 1000, unit: 'pcs', targetUnitPrice: 10.00 },
  { id: 'line-2', description: 'Gadget B', sku: 'G-002', quantity: 500, unit: 'pcs', targetUnitPrice: 25.00 },
];

function makeSeedInvitation(id: string, supplierId: string): SupplierInvitation {
  return {
    id, tenantId: TENANT, eventId: EVENT_ID, eventReference: 'RFQ-001', eventTitleSnapshot: 'Test',
    supplierId, supplierNameSnapshot: `Supplier ${supplierId}`, supplierEmailSnapshot: 'test@test.com',
    tokenHash: `hash-${id}`, status: 'SUBMITTED', createdAt: NOW, updatedAt: NOW, createdByUserId: 'u1',
  };
}

function makeSeedQuote(id: string, invitationId: string, supplierId: string): SupplierQuote {
  return {
    id, tenantId: TENANT, invitationId, eventId: EVENT_ID, supplierId, supplierNameSnapshot: `Supplier ${supplierId}`,
    status: 'SUBMITTED',
    lines: [
      { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 9.00, currency: 'USD', leadTimeDays: 30 },
      { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 21.00, currency: 'USD', leadTimeDays: 45 },
    ],
    commercialTerms: 'EXW', paymentTerms: 'Net30', validityDays: 30,
    version: 1, createdAt: NOW, updatedAt: NOW, submittedAt: NOW,
  };
}

function buildApp(invitations: SupplierInvitation[], quotes: SupplierQuote[]) {
  const invRepo = createInMemoryInvitationRepository(invitations);
  const quoteRepo = createInMemoryQuoteRepository(quotes);
  const auditRepo = createInMemoryAuditRepository();
  const compRepo = createInMemoryComparisonRepository();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const bidSvc = createBidComparisonService(invRepo, quoteService, compRepo);
  return createApp(invService, quoteService, CLIENT_SECRET, bidSvc);
}

describe('Bid Comparison API', () => {
  it('POST /api/buyer/events/:eventId/comparisons — builds snapshot', async () => {
    const app = buildApp(
      [makeSeedInvitation('inv-1', 'sup-A')],
      [makeSeedQuote('q-1', 'inv-1', 'sup-A')],
    );

    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ baseCurrency: 'USD', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE', eventLines: EVENT_LINES });

    expect(res.status).toBe(201);
    expect(res.body.snapshot).toBeDefined();
    expect(res.body.snapshot.eventId).toBe(EVENT_ID);
    expect(res.body.snapshot.normalizedQuotes).toHaveLength(1);
  });

  it('POST /api/buyer/events/:eventId/comparisons — rejects missing fields', async () => {
    const app = buildApp([], []);

    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ eventLines: EVENT_LINES }); // missing baseCurrency and freightAllocationPolicy

    expect(res.status).toBe(400);
  });

  it('GET /api/buyer/events/:eventId/comparisons/latest — returns latest snapshot', async () => {
    const app = buildApp(
      [makeSeedInvitation('inv-1', 'sup-A')],
      [makeSeedQuote('q-1', 'inv-1', 'sup-A')],
    );

    await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ baseCurrency: 'USD', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE', eventLines: EVENT_LINES });

    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/comparisons/latest`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.snapshot.eventId).toBe(EVENT_ID);
  });

  it('GET /api/buyer/events/:eventId/comparisons/latest — 404 when no snapshot', async () => {
    const app = buildApp([], []);
    const res = await request(app)
      .get(`/api/buyer/events/nonexistent/comparisons/latest`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/buyer/comparisons/:id — retrieves by id', async () => {
    const app = buildApp(
      [makeSeedInvitation('inv-1', 'sup-A')],
      [makeSeedQuote('q-1', 'inv-1', 'sup-A')],
    );

    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ baseCurrency: 'USD', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE', eventLines: EVENT_LINES });

    const snapshotId = createRes.body.snapshot.id as string;

    const res = await request(app)
      .get(`/api/buyer/comparisons/${snapshotId}`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.snapshot.id).toBe(snapshotId);
  });

  it('GET /api/buyer/comparisons/:id — 404 for unknown id', async () => {
    const app = buildApp([], []);
    const res = await request(app)
      .get('/api/buyer/comparisons/nonexistent')
      .set('Authorization', `Bearer ${makeBuyerToken()}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/buyer/comparisons/:id/scores/:supplierId — sets manual technical score', async () => {
    const app = buildApp(
      [makeSeedInvitation('inv-1', 'sup-A')],
      [makeSeedQuote('q-1', 'inv-1', 'sup-A')],
    );

    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ baseCurrency: 'USD', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE', eventLines: EVENT_LINES });

    const snapshotId = createRes.body.snapshot.id as string;

    const res = await request(app)
      .patch(`/api/buyer/comparisons/${snapshotId}/scores/sup-A`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ score: 88, comment: 'Excellent quality track record' });

    expect(res.status).toBe(200);
    const scoreEntry = res.body.snapshot.supplierScores.find((s: { supplierId: string }) => s.supplierId === 'sup-A');
    expect(scoreEntry.manualTechnicalScore).toBe(88);
    expect(scoreEntry.manualTechnicalComment).toBe('Excellent quality track record');
  });

  it('PATCH score — rejects out-of-range score', async () => {
    const app = buildApp([], []);
    const res = await request(app)
      .patch('/api/buyer/comparisons/x/scores/sup-A')
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ score: 150 });
    expect(res.status).toBe(400);
  });

  it('tenant isolation — other tenant cannot see snapshots', async () => {
    const app = buildApp(
      [makeSeedInvitation('inv-1', 'sup-A')],
      [makeSeedQuote('q-1', 'inv-1', 'sup-A')],
    );

    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ baseCurrency: 'USD', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE', eventLines: EVENT_LINES });

    const snapshotId = createRes.body.snapshot.id as string;

    // Different account
    const otherToken = makeBuyerToken(1111, 99);
    const res = await request(app)
      .get(`/api/buyer/comparisons/${snapshotId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const app = buildApp([], []);
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/comparisons/latest`);
    expect(res.status).toBe(401);
  });
});
