// @vitest-environment node
/**
 * Master E2E — 29 steps: complete Ariavel Sourcing workflow
 * Invitations → Portal quote submission → Bid comparison → Award finalization
 * Fully in-memory; no external dependencies.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/server/app';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInMemoryComparisonRepository } from '../src/server/db/inMemoryComparisonRepository';
import { createInMemoryAwardRepository } from '../src/server/db/inMemoryAwardRepository';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createBidComparisonService } from '../src/server/services/bidComparisonService';
import { createAwardService } from '../src/server/services/awardService';
import jwt from 'jsonwebtoken';

const SECRET = 'master-e2e-secret-32bytes-minimum-x';
const ACCOUNT_ID = 42;
const EVENT_ID = 'evt-master-e2e';
const EVENT_LINES = [
  { id: 'ln-1', description: 'Widget Alpha', sku: 'WA-001', quantity: 500, unit: 'pcs' },
  { id: 'ln-2', description: 'Bracket Beta', sku: 'BB-002', quantity: 1000, unit: 'pcs' },
];

function buyerToken(acctId = ACCOUNT_ID): string {
  return jwt.sign({ dat: { account_id: acctId, user_id: 1 } }, SECRET);
}

let app: Express;
const state = {
  token: '',
  invIds: [] as string[],
  portalTokens: [] as string[],
  comparisonId: '',
  awardId: '',
};

beforeAll(() => {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const compRepo = createInMemoryComparisonRepository();
  const awardRepo = createInMemoryAwardRepository();
  const invSvc = createInvitationService(invRepo, auditRepo);
  const quoteSvc = createQuoteService(quoteRepo, auditRepo);
  const compSvc = createBidComparisonService(invRepo, quoteSvc, compRepo);
  const awardSvc = createAwardService(awardRepo, compRepo, auditRepo);
  app = createApp(invSvc, quoteSvc, SECRET, compSvc, awardSvc);
  state.token = buyerToken();
});

describe('Master E2E — 29 steps', () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it('step 1: health check returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ariavel-sourcing');
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it('step 2: unauthenticated access is blocked', async () => {
    const res = await request(app).get(`/api/buyer/events/${EVENT_ID}/invitations`);
    expect(res.status).toBe(401);
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it('step 3: authenticated buyer sees empty invitation list', async () => {
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    expect(res.body.invitations).toEqual([]);
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it('step 4: invite Supplier A', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({
        eventReference: 'RFQ-MASTER-001',
        eventTitleSnapshot: 'Master E2E RFQ',
        supplierId: 'sup-A',
        supplierNameSnapshot: 'Alpha Supply Co.',
        supplierEmailSnapshot: 'quotes@alphasupply.com',
      });
    expect(res.status).toBe(201);
    state.invIds.push(res.body.invitation.id as string);
    state.portalTokens.push(res.body.portalToken as string);
    // tenantId must be derived from JWT, not from any body field
    expect(res.body.invitation.tenantId).toBe(`monday-account-${ACCOUNT_ID}`);
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it('step 5: invite Supplier B', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({
        eventReference: 'RFQ-MASTER-001',
        eventTitleSnapshot: 'Master E2E RFQ',
        supplierId: 'sup-B',
        supplierNameSnapshot: 'Beta Components',
        supplierEmailSnapshot: 'rfq@betacomponents.com',
      });
    expect(res.status).toBe(201);
    state.invIds.push(res.body.invitation.id as string);
    state.portalTokens.push(res.body.portalToken as string);
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it('step 6: invite Supplier C', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({
        eventReference: 'RFQ-MASTER-001',
        eventTitleSnapshot: 'Master E2E RFQ',
        supplierId: 'sup-C',
        supplierNameSnapshot: 'Gamma Global',
        supplierEmailSnapshot: 'bid@gammaglobal.com',
      });
    expect(res.status).toBe(201);
    state.invIds.push(res.body.invitation.id as string);
    state.portalTokens.push(res.body.portalToken as string);
    expect(state.invIds).toHaveLength(3);
    expect(state.portalTokens).toHaveLength(3);
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it('step 7: tenantId injection attempt in body is ignored', async () => {
    // Use a separate event to avoid polluting the main event's invitation list
    const res = await request(app)
      .post(`/api/buyer/events/evt-injection-test/invitations`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({
        eventReference: 'RFQ-INJECT',
        eventTitleSnapshot: 'Injection Test',
        supplierId: 'sup-X',
        supplierNameSnapshot: 'X Corp',
        supplierEmailSnapshot: 'x@x.com',
        tenantId: 'monday-account-99999', // should be ignored
      });
    expect(res.status).toBe(201);
    expect(res.body.invitation.tenantId).toBe(`monday-account-${ACCOUNT_ID}`);
    expect(res.body.invitation.tenantId).not.toBe('monday-account-99999');
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it('step 8: list shows all invitations for event', async () => {
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    // At least 3 (plus the injected one from step 7)
    expect((res.body.invitations as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it('step 9: Supplier A opens portal (CREATED → OPENED)', async () => {
    const res = await request(app).get(`/api/portal/invitations/${state.portalTokens[0]}`);
    expect(res.status).toBe(200);
    expect(res.body.invitation.status).toBe('OPENED');
    expect(res.body.invitation.supplierName).toBe('Alpha Supply Co.');
    // Portal DTO must not expose internal fields
    expect(res.body.invitation.tenantId).toBeUndefined();
    expect(res.body.invitation.tokenHash).toBeUndefined();
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it('step 10: Supplier B opens portal', async () => {
    const res = await request(app).get(`/api/portal/invitations/${state.portalTokens[1]}`);
    expect(res.status).toBe(200);
    expect(res.body.invitation.supplierName).toBe('Beta Components');
  });

  // 11 ─────────────────────────────────────────────────────────────────────────
  it('step 11: Supplier C opens portal', async () => {
    const res = await request(app).get(`/api/portal/invitations/${state.portalTokens[2]}`);
    expect(res.status).toBe(200);
    expect(res.body.invitation.supplierName).toBe('Gamma Global');
  });

  // 12 ─────────────────────────────────────────────────────────────────────────
  it('step 12: invalid portal token is rejected', async () => {
    const res = await request(app).get('/api/portal/invitations/not-a-real-token-xxxxxxxx');
    expect([401, 403, 404]).toContain(res.status);
  });

  // 13 ─────────────────────────────────────────────────────────────────────────
  it('step 13: Supplier A submits quote (EUR, competitive)', async () => {
    const res = await request(app)
      .put(`/api/portal/invitations/${state.portalTokens[0]}/quote`)
      .send({
        lines: [
          { lineId: 'ln-1', lineDescription: 'Widget Alpha', unitPrice: 8.50, currency: 'EUR', leadTimeDays: 28, moq: 100 },
          { lineId: 'ln-2', lineDescription: 'Bracket Beta', unitPrice: 3.80, currency: 'EUR', leadTimeDays: 28, moq: 200 },
        ],
        commercialTerms: 'CIF Rotterdam',
        paymentTerms: 'Net 30',
        validityDays: 30,
        supplierNotes: 'Best EUR pricing, FOB Shanghai',
      });
    expect(res.status).toBe(200);

    // Submit the draft
    const submitRes = await request(app)
      .post(`/api/portal/invitations/${state.portalTokens[0]}/submit`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.quote.status).toBe('SUBMITTED');
  });

  // 14 ─────────────────────────────────────────────────────────────────────────
  it('step 14: Supplier B submits quote (USD, higher price)', async () => {
    await request(app)
      .put(`/api/portal/invitations/${state.portalTokens[1]}/quote`)
      .send({
        lines: [
          { lineId: 'ln-1', lineDescription: 'Widget Alpha', unitPrice: 10.20, currency: 'USD', leadTimeDays: 21, moq: 50 },
          { lineId: 'ln-2', lineDescription: 'Bracket Beta', unitPrice: 4.60, currency: 'USD', leadTimeDays: 21, moq: 100 },
        ],
        commercialTerms: 'FOB Shenzhen',
        paymentTerms: 'Net 45',
        validityDays: 30,
        supplierNotes: 'Fast delivery ex-stock',
      });
    const submitRes = await request(app)
      .post(`/api/portal/invitations/${state.portalTokens[1]}/submit`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.quote.status).toBe('SUBMITTED');
  });

  // 15 ─────────────────────────────────────────────────────────────────────────
  it('step 15: Supplier C submits partial quote (no bid on ln-2)', async () => {
    await request(app)
      .put(`/api/portal/invitations/${state.portalTokens[2]}/quote`)
      .send({
        lines: [
          { lineId: 'ln-1', lineDescription: 'Widget Alpha', unitPrice: 7.90, currency: 'EUR', leadTimeDays: 45, moq: 500 },
          { lineId: 'ln-2', lineDescription: 'Bracket Beta', isNoBid: true },
        ],
        commercialTerms: 'EXW',
        paymentTerms: 'Net 30',
        validityDays: 30,
        supplierNotes: 'Cannot supply ln-2 in this timeframe',
      });
    const submitRes = await request(app)
      .post(`/api/portal/invitations/${state.portalTokens[2]}/submit`);
    expect(submitRes.status).toBe(200);
  });

  // 16 ─────────────────────────────────────────────────────────────────────────
  it('step 16: Supplier A cannot re-submit after submission', async () => {
    const res = await request(app)
      .post(`/api/portal/invitations/${state.portalTokens[0]}/submit`);
    expect(res.status).toBe(409);
  });

  // 17 ─────────────────────────────────────────────────────────────────────────
  it('step 17: buyer can see all submitted quotes', async () => {
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/quotes`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    const submitted = (res.body.quotes as { status: string }[]).filter(q => q.status === 'SUBMITTED');
    expect(submitted.length).toBeGreaterThanOrEqual(3);
  });

  // 18 ─────────────────────────────────────────────────────────────────────────
  it('step 18: build bid comparison snapshot', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({
        baseCurrency: 'EUR',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
        fxRates: { USD: 0.92, EUR: 1 },
        evaluationCriteria: [
          { key: 'LANDED_COST', weight: 60 },
          { key: 'LEAD_TIME', weight: 20 },
          { key: 'COMMERCIAL_COMPLETENESS', weight: 20 },
        ],
        eventLines: EVENT_LINES,
      });
    expect(res.status).toBe(201);
    expect(res.body.snapshot.baseCurrency).toBe('EUR');
    expect(res.body.snapshot.normalizedQuotes).toHaveLength(3);
    state.comparisonId = res.body.snapshot.id as string;
  });

  // 19 ─────────────────────────────────────────────────────────────────────────
  it('step 19: best prices computed for all lines', async () => {
    const res = await request(app)
      .get(`/api/buyer/comparisons/${state.comparisonId}`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    const bests = res.body.snapshot.lineBestPrices as { lineId: string; bidCount: number }[];
    const ln1 = bests.find(b => b.lineId === 'ln-1');
    const ln2 = bests.find(b => b.lineId === 'ln-2');
    expect(ln1!.bidCount).toBe(3);   // All 3 bid on ln-1
    expect(ln2!.bidCount).toBe(2);   // Only A and B bid on ln-2
  });

  // 20 ─────────────────────────────────────────────────────────────────────────
  it('step 20: different tenant cannot see this comparison', async () => {
    const res = await request(app)
      .get(`/api/buyer/comparisons/${state.comparisonId}`)
      .set('Authorization', `Bearer ${buyerToken(9999)}`);
    expect(res.status).toBe(404);
  });

  // 21 ─────────────────────────────────────────────────────────────────────────
  it('step 21: list comparison snapshots', async () => {
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/comparisons`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    const snapshots = res.body.snapshots as { id: string }[];
    expect(snapshots.some(s => s.id === state.comparisonId)).toBe(true);
  });

  // 22 ─────────────────────────────────────────────────────────────────────────
  it('step 22: create recommended award scenario', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({
        name: 'Recommended — lowest landed cost',
        comparisonSnapshotId: state.comparisonId,
        eventLines: EVENT_LINES,
      });
    expect(res.status).toBe(201);
    expect(res.body.scenario.isFinalized).toBe(false);
    expect(Array.isArray(res.body.scenario.lines)).toBe(true);
    state.awardId = res.body.scenario.id as string;
  });

  // 23 ─────────────────────────────────────────────────────────────────────────
  it('step 23: retrieve award scenario', async () => {
    const res = await request(app)
      .get(`/api/buyer/award-scenarios/${state.awardId}`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    expect(res.body.scenario.isFinalized).toBe(false);
  });

  // 24 ─────────────────────────────────────────────────────────────────────────
  it('step 24: different tenant cannot see this award scenario', async () => {
    const res = await request(app)
      .get(`/api/buyer/award-scenarios/${state.awardId}`)
      .set('Authorization', `Bearer ${buyerToken(9999)}`);
    expect(res.status).toBe(404);
  });

  // 25 ─────────────────────────────────────────────────────────────────────────
  it('step 25: list award scenarios', async () => {
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/award-scenarios`)
      .set('Authorization', `Bearer ${state.token}`);
    expect(res.status).toBe(200);
    const scenarios = res.body.scenarios as { id: string }[];
    expect(scenarios.some(s => s.id === state.awardId)).toBe(true);
  });

  // 26 ─────────────────────────────────────────────────────────────────────────
  it('step 26: NoSQL injection in buyer body is rejected', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`)
      .send({ eventReference: { $gt: '' }, supplierId: 'sup-X' });
    expect(res.status).toBe(400);
  });

  // 27 ─────────────────────────────────────────────────────────────────────────
  it('step 27: portal route is unaccessible without valid token', async () => {
    const res = await request(app).get('/api/portal/invitations/fake-token-that-does-not-exist');
    expect([401, 403, 404]).toContain(res.status);
  });

  // 28 ─────────────────────────────────────────────────────────────────────────
  it('step 28: X-Request-ID is present on every response', async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).get('/health'),
      request(app).get(`/api/buyer/events/${EVENT_ID}/invitations`).set('Authorization', `Bearer ${state.token}`),
      request(app).get(`/api/buyer/comparisons/${state.comparisonId}`).set('Authorization', `Bearer ${state.token}`),
    ]);
    expect(r1.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
    expect(r2.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
    expect(r3.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
  });

  // 29 ─────────────────────────────────────────────────────────────────────────
  it('step 29: request body exceeding 256KB is rejected', async () => {
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/invitations`)
      .set('Authorization', `Bearer ${state.token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(300 * 1024) }));
    expect(res.status).toBe(413);
  });
});
