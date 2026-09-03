// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createAwardService, AwardScenarioFinalizedError } from '../src/server/services/awardService';
import { createInMemoryAwardRepository } from '../src/server/db/inMemoryAwardRepository';
import { createInMemoryComparisonRepository } from '../src/server/db/inMemoryComparisonRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import type { ComparisonSnapshot } from '../src/shared/types/bid';
import type { SourcingLine } from '../src/shared/types/domain';

const TENANT = 'monday-account-9999';
const EVENT_ID = 'event-abc';
const SNAP_ID = 'snap-123';
const NOW = '2026-09-03T10:00:00.000Z';
const USER_ID = 'user-1';

const EVENT_LINES: SourcingLine[] = [
  { id: 'line-1', description: 'Widget A', sku: 'W-001', quantity: 1000, unit: 'pcs', targetUnitPrice: 10.00 },
  { id: 'line-2', description: 'Gadget B', sku: 'G-002', quantity: 500, unit: 'pcs', targetUnitPrice: 25.00 },
];

const MOCK_SNAPSHOT: ComparisonSnapshot = {
  id: SNAP_ID,
  tenantId: TENANT,
  eventId: EVENT_ID,
  baseCurrency: 'USD',
  freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
  normalizedQuotes: [
    {
      supplierId: 'sup-A',
      supplierName: 'Alpha',
      invitationId: 'inv-1',
      status: 'SUBMITTED',
      lines: [
        { lineId: 'line-1', lineDescription: 'Widget A', requestedQuantity: 1000, requestedUnit: 'pcs', quotedUnitPrice: 9.50, quotedCurrency: 'USD', normalizedUnitPrice: 9.50, landedUnitCost: 9.80, extendedLandedCost: 9800, isNoBid: false, exceptions: [] },
        { lineId: 'line-2', lineDescription: 'Gadget B', requestedQuantity: 500, requestedUnit: 'pcs', quotedUnitPrice: 22.00, quotedCurrency: 'USD', normalizedUnitPrice: 22.00, landedUnitCost: 22.50, extendedLandedCost: 11250, isNoBid: false, exceptions: [] },
      ],
      totalLandedCost: 21050, totalBidLines: 2, totalNoBidLines: 0, exceptions: [],
    },
    {
      supplierId: 'sup-B',
      supplierName: 'Beta',
      invitationId: 'inv-2',
      status: 'SUBMITTED',
      lines: [
        { lineId: 'line-1', lineDescription: 'Widget A', requestedQuantity: 1000, requestedUnit: 'pcs', quotedUnitPrice: 8.90, quotedCurrency: 'USD', normalizedUnitPrice: 8.90, landedUnitCost: 9.20, extendedLandedCost: 9200, isNoBid: false, exceptions: [] },
        { lineId: 'line-2', lineDescription: 'Gadget B', requestedQuantity: 500, requestedUnit: 'pcs', quotedUnitPrice: 23.50, quotedCurrency: 'USD', normalizedUnitPrice: 23.50, landedUnitCost: 24.00, extendedLandedCost: 12000, isNoBid: false, exceptions: [] },
      ],
      totalLandedCost: 21200, totalBidLines: 2, totalNoBidLines: 0, exceptions: [],
    },
  ],
  lineBestPrices: [
    { lineId: 'line-1', lowestLandedCost: 9.20, winningSupplierId: 'sup-B', secondLowestPrice: 9.80, spread: 6.5, bidCount: 2 },
    { lineId: 'line-2', lowestLandedCost: 22.50, winningSupplierId: 'sup-A', secondLowestPrice: 24.00, spread: 6.7, bidCount: 2 },
  ],
  commercialComparisons: [],
  evaluationCriteria: [{ key: 'LANDED_COST', label: 'Landed Cost', weight: 100 }],
  supplierScores: [
    { supplierId: 'sup-A', criteria: [], totalScore: 42 },
    { supplierId: 'sup-B', criteria: [], totalScore: 100 },
  ],
  createdAt: NOW,
  createdByUserId: USER_ID,
};

function buildService() {
  const awardRepo = createInMemoryAwardRepository();
  const compRepo = createInMemoryComparisonRepository();
  const auditRepo = createInMemoryAuditRepository();

  // Pre-seed the comparison snapshot
  void compRepo.save(MOCK_SNAPSHOT);

  return { awardService: createAwardService(awardRepo, compRepo, auditRepo), compRepo };
}

describe('AwardService', () => {
  describe('createRecommendedScenario', () => {
    it('awards each line to the lowest-landed-cost supplier', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Recommended', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );

      const line1 = scenario.lines.find(l => l.lineId === 'line-1')!;
      const line2 = scenario.lines.find(l => l.lineId === 'line-2')!;
      expect(line1.status).toBe('AWARDED');
      expect(line1.allocations[0].supplierId).toBe('sup-B'); // Beta is cheaper on line 1
      expect(line2.status).toBe('AWARDED');
      expect(line2.allocations[0].supplierId).toBe('sup-A'); // Alpha is cheaper on line 2
    });

    it('calculates total allocated cost in summary', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Recommended', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      // line-1: sup-B 9.20 * 1000 = 9200; line-2: sup-A 22.50 * 500 = 11250; total = 20450
      expect(scenario.summary.totalAllocatedCost).toBeCloseTo(20450, 0);
    });

    it('calculates savings vs target in summary', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Recommended', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      // target: line-1: 10 * 1000 = 10000; line-2: 25 * 500 = 12500; total = 22500
      // savings = 22500 - 20450 = 2050
      expect(scenario.summary.totalTargetCost).toBeCloseTo(22500, 0);
      expect(scenario.summary.totalSavings).toBeCloseTo(2050, 0);
    });

    it('marks lines with no bids as NO_AWARD', async () => {
      const { awardService, compRepo } = buildService();
      // Create snapshot where sup-A no-bids on line-1
      const snapshotWithNoBid: ComparisonSnapshot = {
        ...MOCK_SNAPSHOT,
        id: 'snap-nobid',
        normalizedQuotes: [
          {
            ...MOCK_SNAPSHOT.normalizedQuotes[0],
            lines: MOCK_SNAPSHOT.normalizedQuotes[0].lines.map(l =>
              l.lineId === 'line-1' ? { ...l, isNoBid: true, landedUnitCost: undefined, exceptions: ['NO_BID' as const] } : l
            ),
          },
          {
            ...MOCK_SNAPSHOT.normalizedQuotes[1],
            lines: MOCK_SNAPSHOT.normalizedQuotes[1].lines.map(l =>
              l.lineId === 'line-1' ? { ...l, isNoBid: true, landedUnitCost: undefined, exceptions: ['NO_BID' as const] } : l
            ),
          },
        ],
        lineBestPrices: [
          { lineId: 'line-1', bidCount: 0 },
          { lineId: 'line-2', lowestLandedCost: 22.50, winningSupplierId: 'sup-A', bidCount: 2 },
        ],
      };
      await compRepo.save(snapshotWithNoBid);

      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'NoBid scenario', comparisonSnapshotId: 'snap-nobid' }, USER_ID, NOW,
      );
      const line1 = scenario.lines.find(l => l.lineId === 'line-1')!;
      expect(line1.status).toBe('NO_AWARD');
    });

    it('throws when comparison snapshot not found', async () => {
      const { awardService } = buildService();
      await expect(awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'x', comparisonSnapshotId: 'nonexistent' }, USER_ID, NOW,
      )).rejects.toThrow('Comparison snapshot not found');
    });
  });

  describe('awardLine', () => {
    it('allows manual award to a non-winning supplier with reason', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Manual', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );

      // Award line-1 to sup-A (not the lowest cost — that's sup-B), with override reason
      const updated = await awardService.awardLine(
        TENANT, scenario.id, 'line-1', 'sup-A', 1000, 'Preferred supplier for quality reasons', USER_ID, NOW,
      );

      const line1 = updated.lines.find(l => l.lineId === 'line-1')!;
      expect(line1.allocations[0].supplierId).toBe('sup-A');
      expect(line1.isManualOverride).toBe(true);
      expect(line1.overrideReason).toBe('Preferred supplier for quality reasons');
    });

    it('requires override reason when awarding to non-winning supplier', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Manual', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );

      await expect(awardService.awardLine(
        TENANT, scenario.id, 'line-1', 'sup-A', 1000, undefined, USER_ID, NOW,
      )).rejects.toThrow('override reason is required');
    });

    it('does not require override reason for the lowest-cost winner', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Manual', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );

      // sup-B is the winner on line-1
      const updated = await awardService.awardLine(
        TENANT, scenario.id, 'line-1', 'sup-B', 1000, undefined, USER_ID, NOW,
      );

      const line1 = updated.lines.find(l => l.lineId === 'line-1')!;
      expect(line1.isManualOverride).toBe(false);
    });

    it('rejects quantity exceeding requested', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Manual', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      await expect(awardService.awardLine(
        TENANT, scenario.id, 'line-1', 'sup-B', 9999, undefined, USER_ID, NOW,
      )).rejects.toThrow('Quantity must be between');
    });

    it('rejects awarding a supplier with no bid on that line', async () => {
      const { awardService, compRepo } = buildService();
      const snapshotWithNoBid: ComparisonSnapshot = {
        ...MOCK_SNAPSHOT,
        id: 'snap-nobid-2',
        normalizedQuotes: [
          MOCK_SNAPSHOT.normalizedQuotes[0],
          {
            ...MOCK_SNAPSHOT.normalizedQuotes[1],
            lines: MOCK_SNAPSHOT.normalizedQuotes[1].lines.map(l =>
              l.lineId === 'line-1' ? { ...l, isNoBid: true, landedUnitCost: undefined } : l
            ),
          },
        ],
        lineBestPrices: [
          { lineId: 'line-1', lowestLandedCost: 9.80, winningSupplierId: 'sup-A', bidCount: 1 },
          MOCK_SNAPSHOT.lineBestPrices[1],
        ],
      };
      await compRepo.save(snapshotWithNoBid);

      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Manual', comparisonSnapshotId: 'snap-nobid-2' }, USER_ID, NOW,
      );

      await expect(awardService.awardLine(
        TENANT, scenario.id, 'line-1', 'sup-B', 1000, undefined, USER_ID, NOW,
      )).rejects.toThrow('no bid for line');
    });
  });

  describe('clearLine', () => {
    it('resets an awarded line back to PENDING', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Rec', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      const cleared = await awardService.clearLine(TENANT, scenario.id, 'line-1', USER_ID, NOW);
      const line1 = cleared.lines.find(l => l.lineId === 'line-1')!;
      expect(line1.status).toBe('PENDING');
      expect(line1.allocations).toHaveLength(0);
    });
  });

  describe('finalizeScenario', () => {
    it('finalizes a scenario where all lines are awarded or NO_AWARD', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Rec', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      const finalized = await awardService.finalizeScenario(TENANT, scenario.id, USER_ID, NOW);
      expect(finalized.isFinalized).toBe(true);
      expect(finalized.finalizedAt).toBe(NOW);
      expect(finalized.finalizedByUserId).toBe(USER_ID);
    });

    it('blocks finalization when any line is still PENDING', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Empty', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      await expect(awardService.finalizeScenario(TENANT, scenario.id, USER_ID, NOW))
        .rejects.toThrow('Cannot finalize');
    });

    it('blocks modifications after finalization', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Rec', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      await awardService.finalizeScenario(TENANT, scenario.id, USER_ID, NOW);

      await expect(awardService.awardLine(
        TENANT, scenario.id, 'line-1', 'sup-A', 1000, 'reason', USER_ID, NOW,
      )).rejects.toThrow(AwardScenarioFinalizedError);
    });

    it('blocks clearing lines after finalization', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Rec', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      await awardService.finalizeScenario(TENANT, scenario.id, USER_ID, NOW);

      await expect(awardService.clearLine(TENANT, scenario.id, 'line-1', USER_ID, NOW))
        .rejects.toThrow(AwardScenarioFinalizedError);
    });
  });

  describe('tenant isolation', () => {
    it('cannot retrieve another tenant scenario', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createEmptyScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Empty', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      const result = await awardService.getScenario('monday-account-0000', scenario.id);
      expect(result).toBeNull();
    });
  });

  describe('summary calculation', () => {
    it('tracks supplier concentration correctly', async () => {
      const { awardService } = buildService();
      const scenario = await awardService.createRecommendedScenario(
        TENANT, EVENT_ID, EVENT_LINES, { name: 'Rec', comparisonSnapshotId: SNAP_ID }, USER_ID, NOW,
      );
      // line-1 → sup-B (9200), line-2 → sup-A (11250). Two suppliers.
      expect(scenario.summary.supplierCount).toBe(2);
      expect(scenario.summary.supplierConcentration).toHaveLength(2);
      const alphaConcentration = scenario.summary.supplierConcentration.find(s => s.supplierId === 'sup-A')!;
      const betaConcentration = scenario.summary.supplierConcentration.find(s => s.supplierId === 'sup-B')!;
      expect(alphaConcentration.share + betaConcentration.share).toBeCloseTo(100, 0);
    });
  });
});
