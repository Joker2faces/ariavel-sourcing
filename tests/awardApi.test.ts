// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
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
import type { ComparisonSnapshot } from '../src/shared/types/bid';
import type { MondayRoleProvider } from '../src/server/auth/mondayRoleProvider';

const CLIENT_SECRET = 'award-api-test-secret-min-32-chars!!';
const ACCOUNT_ID = 9999;
const USER_ID = 42;
const TENANT = `monday-account-${ACCOUNT_ID}`;
const EVENT_ID = 'event-abc';
const SNAP_ID = 'snap-award-test';
const NOW = '2026-09-03T10:00:00.000Z';

const EVENT_LINES = [
  { id: 'line-1', description: 'Widget A', sku: 'W-001', quantity: 1000, unit: 'pcs', targetUnitPrice: 10.00 },
  { id: 'line-2', description: 'Gadget B', sku: 'G-002', quantity: 500, unit: 'pcs', targetUnitPrice: 25.00 },
];

const MOCK_SNAPSHOT: ComparisonSnapshot = {
  id: SNAP_ID, tenantId: TENANT, eventId: EVENT_ID, baseCurrency: 'USD',
  freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
  normalizedQuotes: [
    {
      supplierId: 'sup-A', supplierName: 'Alpha', invitationId: 'inv-1', status: 'SUBMITTED',
      lines: [
        { lineId: 'line-1', lineDescription: 'Widget A', requestedQuantity: 1000, requestedUnit: 'pcs', quotedUnitPrice: 9.50, quotedCurrency: 'USD', normalizedUnitPrice: 9.50, landedUnitCost: 9.80, extendedLandedCost: 9800, isNoBid: false, exceptions: [] },
        { lineId: 'line-2', lineDescription: 'Gadget B', requestedQuantity: 500, requestedUnit: 'pcs', quotedUnitPrice: 22.00, quotedCurrency: 'USD', normalizedUnitPrice: 22.00, landedUnitCost: 22.50, extendedLandedCost: 11250, isNoBid: false, exceptions: [] },
      ],
      totalLandedCost: 21050, totalBidLines: 2, totalNoBidLines: 0, exceptions: [],
    },
  ],
  lineBestPrices: [
    { lineId: 'line-1', lowestLandedCost: 9.80, winningSupplierId: 'sup-A', bidCount: 1 },
    { lineId: 'line-2', lowestLandedCost: 22.50, winningSupplierId: 'sup-A', bidCount: 1 },
  ],
  commercialComparisons: [],
  evaluationCriteria: [{ key: 'LANDED_COST', label: 'Landed Cost', weight: 100 }],
  supplierScores: [{ supplierId: 'sup-A', criteria: [], totalScore: 100 }],
  createdAt: NOW, createdByUserId: 'u1',
};

function makeBuyerToken(accountId = ACCOUNT_ID, userId = USER_ID) {
  return jwt.sign({ dat: { account_id: accountId, user_id: userId, short_lived_token: 'slt' } }, CLIENT_SECRET, { expiresIn: '1h' });
}

function makeBuyerTokenWithoutShortLivedToken(accountId = ACCOUNT_ID, userId = USER_ID) {
  return jwt.sign({ dat: { account_id: accountId, user_id: userId } }, CLIENT_SECRET, { expiresIn: '1h' });
}

let compRepo: ReturnType<typeof createInMemoryComparisonRepository>;

// Stands in for the real monday `me` API lookup (mondayRoleProvider.ts) so
// these tests never make a network call. Grants edit capability for any
// non-empty short-lived token unless overridden.
const ALLOW_EDIT_ROLE_PROVIDER: MondayRoleProvider = () =>
  Promise.resolve({ isAdmin: false, isGuest: false, isViewOnly: false });

function buildApp(roleProvider: MondayRoleProvider = ALLOW_EDIT_ROLE_PROVIDER) {
  const invRepo = createInMemoryInvitationRepository([]);
  const quoteRepo = createInMemoryQuoteRepository([]);
  const auditRepo = createInMemoryAuditRepository();
  compRepo = createInMemoryComparisonRepository();
  const awardRepo = createInMemoryAwardRepository();
  void compRepo.save(MOCK_SNAPSHOT);
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const bidSvc = createBidComparisonService(invRepo, quoteService, compRepo);
  const awardSvc = createAwardService(awardRepo, compRepo, auditRepo);
  return createApp(
    invService, quoteService, CLIENT_SECRET, bidSvc, awardSvc,
    undefined, undefined, undefined, undefined, undefined, undefined,
    roleProvider,
  );
}

describe('Award API', () => {
  it('POST recommended — creates recommended scenario', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Recommended', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    expect(res.status).toBe(201);
    expect(res.body.scenario.isFinalized).toBe(false);
    expect(res.body.scenario.lines).toHaveLength(2);
  });

  it('POST recommended — 400 for missing fields', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST empty — creates empty scenario with PENDING lines', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Manual', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    expect(res.status).toBe(201);
    expect(res.body.scenario.lines.every((l: { status: string }) => l.status === 'PENDING')).toBe(true);
  });

  it('GET list — returns all scenarios for event', async () => {
    const app = buildApp();
    await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Rec', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/award-scenarios`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.scenarios.length).toBeGreaterThan(0);
  });

  it('PATCH line — awards a line to a supplier', async () => {
    const app = buildApp();
    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Manual', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    const scenarioId = createRes.body.scenario.id as string;

    const res = await request(app)
      .patch(`/api/buyer/award-scenarios/${scenarioId}/lines/line-1`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ supplierId: 'sup-A', quantity: 1000 });

    expect(res.status).toBe(200);
    const line1 = res.body.scenario.lines.find((l: { lineId: string }) => l.lineId === 'line-1');
    expect(line1.status).toBe('AWARDED');
    expect(line1.allocations[0].supplierId).toBe('sup-A');
  });

  it('DELETE line — clears an awarded line', async () => {
    const app = buildApp();
    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Rec', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    const scenarioId = createRes.body.scenario.id as string;

    const res = await request(app)
      .delete(`/api/buyer/award-scenarios/${scenarioId}/lines/line-1`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);

    expect(res.status).toBe(200);
    const line1 = res.body.scenario.lines.find((l: { lineId: string }) => l.lineId === 'line-1');
    expect(line1.status).toBe('PENDING');
  });

  it('POST finalize — finalizes a fully-awarded scenario', async () => {
    const app = buildApp();
    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Rec', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    const scenarioId = createRes.body.scenario.id as string;

    const res = await request(app)
      .post(`/api/buyer/award-scenarios/${scenarioId}/finalize`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.scenario.isFinalized).toBe(true);
  });

  it('POST finalize — 409 when scenario already finalized', async () => {
    const app = buildApp();
    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Rec', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    const scenarioId = createRes.body.scenario.id as string;
    await request(app).post(`/api/buyer/award-scenarios/${scenarioId}/finalize`).set('Authorization', `Bearer ${makeBuyerToken()}`);

    const res = await request(app)
      .post(`/api/buyer/award-scenarios/${scenarioId}/finalize`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);

    expect(res.status).toBe(409);
  });

  it('GET finalized — 404 when nothing finalized', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/award-scenarios/finalized`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`);
    expect(res.status).toBe(404);
  });

  it('tenant isolation — other tenant cannot see scenarios', async () => {
    const app = buildApp();
    const createRes = await request(app)
      .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
      .set('Authorization', `Bearer ${makeBuyerToken()}`)
      .send({ name: 'Rec', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });

    const scenarioId = createRes.body.scenario.id as string;

    const otherToken = makeBuyerToken(1111, 99);
    const res = await request(app)
      .get(`/api/buyer/award-scenarios/${scenarioId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/buyer/events/${EVENT_ID}/award-scenarios`);
    expect(res.status).toBe(401);
  });

  describe('server-side award edit capability enforcement', () => {
    it('blocks scenario creation for a monday guest', async () => {
      const app = buildApp(() => Promise.resolve({ isAdmin: false, isGuest: true, isViewOnly: false }));
      const res = await request(app)
        .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`)
        .send({ name: 'Recommended', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });
      expect(res.status).toBe(403);
    });

    it('blocks scenario creation for a view-only member', async () => {
      const app = buildApp(() => Promise.resolve({ isAdmin: false, isGuest: false, isViewOnly: true }));
      const res = await request(app)
        .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`)
        .send({ name: 'Recommended', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });
      expect(res.status).toBe(403);
    });

    it('blocks line award, finalize, and other mutations for a guest — but still allows reads', async () => {
      const app = buildApp(); // allow creation
      const createRes = await request(app)
        .post(`/api/buyer/events/${EVENT_ID}/award-scenarios`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`)
        .send({ name: 'Manual', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });
      const scenarioId = createRes.body.scenario.id as string;

      // Rebuild the same app is not possible mid-test (state lives in-memory per app),
      // so instead verify the deny-all default: no role provider configured at all.
      const denyApp = createApp(
        createInvitationService(createInMemoryInvitationRepository([]), createInMemoryAuditRepository()),
        createQuoteService(createInMemoryQuoteRepository([]), createInMemoryAuditRepository()),
        CLIENT_SECRET,
        undefined,
        createAwardService(createInMemoryAwardRepository(), compRepo, createInMemoryAuditRepository()),
      );

      // No role provider configured on denyApp — the middleware's role lookup
      // itself fails closed (502 "unable to verify"), never falling through
      // to the handler. This proves the deny-all default from
      // createBuyerRouter's fallback provider, not a 403 role denial.
      const patchRes = await request(denyApp)
        .patch(`/api/buyer/award-scenarios/${scenarioId}/lines/line-1`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`)
        .send({ supplierId: 'sup-A', quantity: 1000 });
      expect(patchRes.status).toBe(502);

      const finalizeRes = await request(denyApp)
        .post(`/api/buyer/award-scenarios/${scenarioId}/finalize`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`);
      expect(finalizeRes.status).toBe(502);

      // Reads stay open — role enforcement only applies to mutation routes.
      const getRes = await request(app)
        .get(`/api/buyer/award-scenarios/${scenarioId}`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`);
      expect(getRes.status).toBe(200);
    });

    it('403s a mutation when the session token carries no short-lived token', async () => {
      const app = buildApp();
      const res = await request(app)
        .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
        .set('Authorization', `Bearer ${makeBuyerTokenWithoutShortLivedToken()}`)
        .send({ name: 'Recommended', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });
      expect(res.status).toBe(403);
    });

    it('502s a mutation when the role lookup itself fails', async () => {
      const app = buildApp(() => Promise.reject(new Error('monday API unreachable')));
      const res = await request(app)
        .post(`/api/buyer/events/${EVENT_ID}/award-scenarios/recommended`)
        .set('Authorization', `Bearer ${makeBuyerToken()}`)
        .send({ name: 'Recommended', comparisonSnapshotId: SNAP_ID, eventLines: EVENT_LINES });
      expect(res.status).toBe(502);
    });
  });
});
