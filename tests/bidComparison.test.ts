// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createBidComparisonService } from '../src/server/services/bidComparisonService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInMemoryComparisonRepository } from '../src/server/db/inMemoryComparisonRepository';
import { createQuoteService } from '../src/server/services/quoteService';
import type { SourcingLine } from '../src/shared/types/domain';
import type { SupplierInvitation } from '../src/server/types/invitation';
import type { SupplierQuote } from '../src/server/types/quote';

const TENANT = 'monday-account-9999';
const EVENT_ID = 'event-abc';
const NOW = '2026-09-03T10:00:00.000Z';

const LINES: SourcingLine[] = [
  { id: 'line-1', description: 'Widget A', sku: 'W-001', quantity: 1000, unit: 'pcs', targetUnitPrice: 10.00 },
  { id: 'line-2', description: 'Gadget B', sku: 'G-002', quantity: 500, unit: 'pcs', targetUnitPrice: 25.00 },
];

function makeInvitation(id: string, supplierId: string, supplierName: string): SupplierInvitation {
  return {
    id,
    tenantId: TENANT,
    eventId: EVENT_ID,
    eventReference: 'RFQ-001',
    eventTitleSnapshot: 'Test RFQ',
    supplierId,
    supplierNameSnapshot: supplierName,
    supplierEmailSnapshot: `${supplierId}@example.com`,
    tokenHash: `hash-${id}`,
    status: 'SUBMITTED',
    createdAt: NOW,
    updatedAt: NOW,
    createdByUserId: 'user-1',
  };
}

function makeQuote(id: string, invitationId: string, supplierId: string, overrides: Partial<SupplierQuote> = {}): SupplierQuote {
  return {
    id,
    tenantId: TENANT,
    invitationId,
    eventId: EVENT_ID,
    supplierId,
    supplierNameSnapshot: supplierId,
    status: 'SUBMITTED',
    lines: [
      { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 9.50, currency: 'USD', leadTimeDays: 30, moq: 100 },
      { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 22.00, currency: 'USD', leadTimeDays: 45, moq: 50 },
    ],
    commercialTerms: 'EXW',
    paymentTerms: 'Net30',
    validityDays: 30,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    submittedAt: NOW,
    ...overrides,
  };
}

function buildService(invitations: SupplierInvitation[], quotes: SupplierQuote[]) {
  const invRepo = createInMemoryInvitationRepository(invitations);
  const quoteRepo = createInMemoryQuoteRepository(quotes);
  const auditRepo = createInMemoryAuditRepository();
  const compRepo = createInMemoryComparisonRepository();
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  return createBidComparisonService(invRepo, quoteService, compRepo);
}

describe('BidComparisonService', () => {
  describe('buildSnapshot', () => {
    it('normalizes quotes in same currency without FX conversion', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Supplier Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1], [quote1]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      expect(snapshot.normalizedQuotes).toHaveLength(1);
      const nq = snapshot.normalizedQuotes[0];
      expect(nq.supplierId).toBe('sup-A');
      expect(nq.status).toBe('SUBMITTED');
      const line1 = nq.lines.find(l => l.lineId === 'line-1')!;
      expect(line1.normalizedUnitPrice).toBe(9.50);
      expect(line1.fxRate).toBeUndefined(); // same currency, no FX
      expect(line1.isNoBid).toBe(false);
    });

    it('applies FX normalization for multi-currency quotes', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quoteEur = makeQuote('q-1', 'inv-1', 'sup-A', {
        lines: [
          { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 8.70, currency: 'EUR', leadTimeDays: 30 },
          { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 20.00, currency: 'EUR', leadTimeDays: 45 },
        ],
      });
      const svc = buildService([inv1], [quoteEur]);

      // 1 EUR = 1.08 USD, so 8.70 EUR * 1.08 = 9.396 USD
      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
        fxRates: { USD: 1, EUR: 0.9259 }, // 1/0.9259 ≈ 1.08
      }, 'user-1', NOW);

      const nq = snapshot.normalizedQuotes[0];
      const line1 = nq.lines.find(l => l.lineId === 'line-1')!;
      expect(line1.normalizedUnitPrice).toBeCloseTo(8.70 * (1 / 0.9259), 2);
      expect(line1.fxRate).toBeDefined();
    });

    it('marks NO_BID for pending supplier with no quote', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const inv2 = makeInvitation('inv-2', 'sup-B', 'Beta');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1, inv2], [quote1]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const nqA = snapshot.normalizedQuotes.find(q => q.supplierId === 'sup-A')!;
      const nqB = snapshot.normalizedQuotes.find(q => q.supplierId === 'sup-B')!;
      expect(nqA.status).toBe('SUBMITTED');
      expect(nqB.status).toBe('PENDING');
      nqB.lines.forEach(l => expect(l.isNoBid).toBe(true));
      nqB.lines.forEach(l => expect(l.exceptions).toContain('NO_BID'));
    });

    it('calculates landed cost including freight allocation (PROPORTIONAL)', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quoteWithFreight = makeQuote('q-1', 'inv-1', 'sup-A', {
        freightTotal: 500,
        freightCurrency: 'USD',
        freightIncluded: false,
      });
      const svc = buildService([inv1], [quoteWithFreight]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const nq = snapshot.normalizedQuotes[0];
      const line1 = nq.lines.find(l => l.lineId === 'line-1')!;
      const line2 = nq.lines.find(l => l.lineId === 'line-2')!;
      // Both should have freight > 0
      expect(line1.freightAllocation).toBeGreaterThan(0);
      expect(line2.freightAllocation).toBeGreaterThan(0);
      // Total freight should sum to 500
      const totalFreight = line1.freightAllocation! * LINES[0].quantity + line2.freightAllocation! * LINES[1].quantity;
      expect(totalFreight).toBeCloseTo(500, 1);
    });

    it('identifies the winning supplier per line', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const inv2 = makeInvitation('inv-2', 'sup-B', 'Beta');
      const quoteA = makeQuote('q-1', 'inv-1', 'sup-A', {
        lines: [
          { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 9.50, currency: 'USD', leadTimeDays: 30 },
          { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 22.00, currency: 'USD', leadTimeDays: 45 },
        ],
      });
      const quoteB = makeQuote('q-2', 'inv-2', 'sup-B', {
        lines: [
          { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 8.90, currency: 'USD', leadTimeDays: 25 }, // cheaper on line 1
          { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 23.50, currency: 'USD', leadTimeDays: 60 }, // more expensive on line 2
        ],
      });
      const svc = buildService([inv1, inv2], [quoteA, quoteB]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const bp1 = snapshot.lineBestPrices.find(b => b.lineId === 'line-1')!;
      const bp2 = snapshot.lineBestPrices.find(b => b.lineId === 'line-2')!;
      expect(bp1.winningSupplierId).toBe('sup-B');
      expect(bp2.winningSupplierId).toBe('sup-A');
      expect(bp1.bidCount).toBe(2);
    });

    it('calculates savings vs target price', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A', {
        lines: [{ lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 8.00, currency: 'USD', leadTimeDays: 30 }],
      });
      // line-1 target = 10.00, quote = 8.00 → saves 2.00/unit * 1000 = 2000
      const svc = buildService([inv1], [quote1]);
      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, [LINES[0]], {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const bp = snapshot.lineBestPrices.find(b => b.lineId === 'line-1')!;
      expect(bp.potentialSavings).toBeCloseTo(2000, 0);
      expect(bp.savingsPercent).toBeCloseTo(20, 1);
    });

    it('flags MOQ_EXCEEDS_REQUEST exception', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A', {
        lines: [
          { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 9.50, currency: 'USD', leadTimeDays: 30, moq: 5000 }, // moq > qty 1000
          { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 22.00, currency: 'USD', leadTimeDays: 45, moq: 50 },
        ],
      });
      const svc = buildService([inv1], [quote1]);
      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const line1 = snapshot.normalizedQuotes[0].lines.find(l => l.lineId === 'line-1')!;
      expect(line1.exceptions).toContain('MOQ_EXCEEDS_REQUEST');
    });

    it('flags MISSING_COMMERCIAL_TERMS exception', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A', {
        commercialTerms: undefined,
        paymentTerms: undefined,
      });
      const svc = buildService([inv1], [quote1]);
      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const nq = snapshot.normalizedQuotes[0];
      expect(nq.exceptions).toContain('MISSING_COMMERCIAL_TERMS');
    });

    it('calculates weighted evaluation scores', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const inv2 = makeInvitation('inv-2', 'sup-B', 'Beta');
      const quoteA = makeQuote('q-1', 'inv-1', 'sup-A');
      const quoteB = makeQuote('q-2', 'inv-2', 'sup-B', {
        lines: [
          { lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 12.00, currency: 'USD', leadTimeDays: 60 },
          { lineId: 'line-2', lineDescription: 'Gadget B', unitPrice: 28.00, currency: 'USD', leadTimeDays: 60 },
        ],
      });
      const svc = buildService([inv1, inv2], [quoteA, quoteB]);
      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      expect(snapshot.supplierScores).toHaveLength(2);
      const scoreA = snapshot.supplierScores.find(s => s.supplierId === 'sup-A')!;
      const scoreB = snapshot.supplierScores.find(s => s.supplierId === 'sup-B')!;
      // Alpha has lower prices so should score higher
      expect(scoreA.totalScore).toBeGreaterThan(scoreB.totalScore);
    });

    it('snapshot is persisted and retrievable', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1], [quote1]);

      const snap = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const retrieved = await svc.getSnapshot(TENANT, snap.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(snap.id);

      const latest = await svc.getLatestSnapshot(TENANT, EVENT_ID);
      expect(latest!.id).toBe(snap.id);
    });

    it('tenant isolation: cannot retrieve another tenant snapshot', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1], [quote1]);

      const snap = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const other = await svc.getSnapshot('monday-account-0000', snap.id);
      expect(other).toBeNull();
    });

    it('handles equal-per-line freight allocation', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quoteWithFreight = makeQuote('q-1', 'inv-1', 'sup-A', {
        freightTotal: 200,
        freightCurrency: 'USD',
        freightIncluded: false,
      });
      const svc = buildService([inv1], [quoteWithFreight]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'EQUAL_PER_LINE',
      }, 'user-1', NOW);

      const nq = snapshot.normalizedQuotes[0];
      const line1 = nq.lines.find(l => l.lineId === 'line-1')!;
      const line2 = nq.lines.find(l => l.lineId === 'line-2')!;
      // Each line gets 100 USD freight total; per-unit differs by quantity
      const fa1 = line1.freightAllocation! * LINES[0].quantity;
      const fa2 = line2.freightAllocation! * LINES[1].quantity;
      expect(fa1).toBeCloseTo(fa2, 1); // equal per line
    });

    it('skips freight allocation when freightIncluded=true', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quoteFreightIncluded = makeQuote('q-1', 'inv-1', 'sup-A', {
        freightTotal: 500,
        freightCurrency: 'USD',
        freightIncluded: true,
      });
      const svc = buildService([inv1], [quoteFreightIncluded]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const nq = snapshot.normalizedQuotes[0];
      nq.lines.forEach(l => {
        if (!l.isNoBid) expect(l.freightAllocation ?? 0).toBe(0);
      });
    });

    it('creates FX snapshot when multi-currency rates provided', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1], [quote1]);

      const snapshot = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
        fxRates: { USD: 1, EUR: 0.92, GBP: 0.78 },
      }, 'user-1', NOW);

      expect(snapshot.exchangeRateSnapshot).toBeDefined();
      expect(snapshot.exchangeRateSnapshot!.source).toBe('MANUAL');
      expect(snapshot.exchangeRateSnapshot!.rates['EUR']).toBe(0.92);
    });
  });

  describe('setManualTechnicalScore', () => {
    it('sets manual technical score on existing snapshot', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1], [quote1]);

      const snap = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const updated = await svc.setManualTechnicalScore(TENANT, snap.id, 'sup-A', 85, 'Good quality history', 'user-1', NOW);
      expect(updated).not.toBeNull();
      const scoreEntry = updated!.supplierScores.find(s => s.supplierId === 'sup-A')!;
      expect(scoreEntry.manualTechnicalScore).toBe(85);
      expect(scoreEntry.manualTechnicalComment).toBe('Good quality history');
    });

    it('clamps manual technical score to 0–100', async () => {
      const inv1 = makeInvitation('inv-1', 'sup-A', 'Alpha');
      const quote1 = makeQuote('q-1', 'inv-1', 'sup-A');
      const svc = buildService([inv1], [quote1]);

      const snap = await svc.buildSnapshot(TENANT, EVENT_ID, LINES, {
        baseCurrency: 'USD',
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
      }, 'user-1', NOW);

      const updated = await svc.setManualTechnicalScore(TENANT, snap.id, 'sup-A', 150, undefined, 'user-1', NOW);
      const scoreEntry = updated!.supplierScores.find(s => s.supplierId === 'sup-A')!;
      expect(scoreEntry.manualTechnicalScore).toBe(100);
    });

    it('returns null for non-existent snapshot', async () => {
      const svc = buildService([], []);
      const result = await svc.setManualTechnicalScore(TENANT, 'nonexistent', 'sup-A', 80, undefined, 'user-1', NOW);
      expect(result).toBeNull();
    });
  });
});
