import type { AwardRepository } from '../db/awardRepository.js';
import type { ComparisonRepository } from '../db/comparisonRepository.js';
import type { AuditRepository } from '../db/auditRepository.js';
import type {
  AwardScenario,
  AwardScenarioInput,
  AwardLine,
  AwardLineAllocation,
  AwardSummary,
} from '../../shared/types/award.js';
import type { SourcingLine } from '../../shared/types/domain.js';
import { randomBytes } from 'crypto';

export class AwardScenarioNotFoundError extends Error { constructor() { super('Award scenario not found'); } }
export class AwardScenarioFinalizedError extends Error { constructor() { super('Award scenario is already finalized and cannot be modified'); } }
export class AwardValidationError extends Error { constructor(message: string) { super(message); } }

export interface AwardService {
  createRecommendedScenario(
    tenantId: string,
    eventId: string,
    eventLines: SourcingLine[],
    input: AwardScenarioInput,
    userId: string,
    now: string,
  ): Promise<AwardScenario>;

  createEmptyScenario(
    tenantId: string,
    eventId: string,
    eventLines: SourcingLine[],
    input: AwardScenarioInput,
    userId: string,
    now: string,
  ): Promise<AwardScenario>;

  /**
   * Awards (a portion of) a line to a supplier. Calling this again for the same
   * line with a *different* supplier does not replace the existing allocation —
   * it adds a second allocation, splitting the line, as long as the combined
   * quantity across all suppliers on that line does not exceed requestedQuantity.
   * Calling it again for the *same* supplier updates that supplier's quantity.
   */
  awardLine(
    tenantId: string,
    scenarioId: string,
    lineId: string,
    supplierId: string,
    quantity: number,
    overrideReason: string | undefined,
    userId: string,
    now: string,
  ): Promise<AwardScenario>;

  clearLine(tenantId: string, scenarioId: string, lineId: string, userId: string, now: string): Promise<AwardScenario>;

  /** Explicitly records that a line will not be awarded to anyone (e.g. no supplier bid on it). */
  markNoAward(tenantId: string, scenarioId: string, lineId: string, userId: string, now: string): Promise<AwardScenario>;

  /** Removes just one supplier's allocation from a (possibly split) line. */
  removeLineAllocation(tenantId: string, scenarioId: string, lineId: string, supplierId: string, userId: string, now: string): Promise<AwardScenario>;

  finalizeScenario(tenantId: string, scenarioId: string, userId: string, now: string): Promise<AwardScenario>;

  getScenario(tenantId: string, scenarioId: string): Promise<AwardScenario | null>;
  listScenarios(tenantId: string, eventId: string): Promise<AwardScenario[]>;
  getFinalizedScenario(tenantId: string, eventId: string): Promise<AwardScenario | null>;
}

// ── Summary calculation ───────────────────────────────────────────────────────

function calcSummary(lines: AwardLine[]): AwardSummary {
  const awardedLines = lines.filter(l => l.status === 'AWARDED');
  const totalAllocatedCost = awardedLines.reduce(
    (s, l) => s + l.allocations.reduce((as, a) => as + a.extendedLandedCost, 0),
    0,
  );

  const totalTargetCost = lines.every(l => l.targetUnitPrice != null)
    ? lines.reduce((s, l) => s + (l.targetUnitPrice ?? 0) * l.requestedQuantity, 0)
    : undefined;

  const totalSavings = totalTargetCost != null ? totalTargetCost - totalAllocatedCost : undefined;
  const savingsPercent = totalTargetCost != null && totalTargetCost > 0
    ? (totalSavings! / totalTargetCost) * 100
    : undefined;

  // Supplier concentration
  const supplierMap = new Map<string, { name: string; cost: number }>();
  awardedLines.forEach(l => {
    l.allocations.forEach(a => {
      const existing = supplierMap.get(a.supplierId);
      if (existing) {
        existing.cost += a.extendedLandedCost;
      } else {
        supplierMap.set(a.supplierId, { name: a.supplierName, cost: a.extendedLandedCost });
      }
    });
  });

  const supplierConcentration = [...supplierMap.entries()]
    .sort(([, a], [, b]) => b.cost - a.cost)
    .map(([supplierId, { name, cost }]) => ({
      supplierId,
      supplierName: name,
      allocatedCost: cost,
      share: totalAllocatedCost > 0 ? (cost / totalAllocatedCost) * 100 : 0,
    }));

  return {
    totalAllocatedCost,
    totalTargetCost,
    totalSavings,
    savingsPercent,
    supplierCount: supplierMap.size,
    lineCount: lines.length,
    awardedLineCount: awardedLines.length,
    noAwardLineCount: lines.filter(l => l.status === 'NO_AWARD').length,
    supplierConcentration,
  };
}

function deriveAwardType(lines: AwardLine[]): 'WHOLE' | 'LINE' | 'SPLIT' {
  if (lines.some(l => l.allocations.length > 1)) return 'SPLIT';
  const awardedLines = lines.filter(l => l.status === 'AWARDED');
  const suppliers = new Set(awardedLines.flatMap(l => l.allocations.map(a => a.supplierId)));
  if (awardedLines.length > 0 && awardedLines.length === lines.length && suppliers.size === 1) return 'WHOLE';
  return 'LINE';
}

// ── Recommendation engine (deterministic: lowest landed cost per line) ────────

function buildRecommendedLines(
  eventLines: SourcingLine[],
  snapshot: { normalizedQuotes: Array<{ supplierId: string; supplierName: string; lines: Array<{ lineId: string; isNoBid: boolean; landedUnitCost?: number; normalizedUnitPrice?: number; quotedCurrency?: string; quotedUnitPrice?: number }> }> },
  baseCurrency: string,
): AwardLine[] {
  return eventLines.map(el => {
    const candidates = snapshot.normalizedQuotes
      .flatMap(nq => {
        const line = nq.lines.find(l => l.lineId === el.id);
        if (!line || line.isNoBid || line.landedUnitCost == null) return [];
        return [{ supplierId: nq.supplierId, supplierName: nq.supplierName, line }];
      })
      .sort((a, b) => a.line.landedUnitCost! - b.line.landedUnitCost!);

    if (candidates.length === 0) {
      return {
        lineId: el.id,
        lineDescription: el.description,
        requestedQuantity: el.quantity,
        unit: el.unit,
        targetUnitPrice: el.targetUnitPrice,
        status: 'NO_AWARD' as const,
        allocations: [],
        isManualOverride: false,
      };
    }

    const winner = candidates[0];
    const allocation: AwardLineAllocation = {
      supplierId: winner.supplierId,
      supplierName: winner.supplierName,
      quantity: el.quantity,
      awardedUnitPrice: winner.line.quotedUnitPrice ?? winner.line.normalizedUnitPrice!,
      awardedCurrency: winner.line.quotedCurrency ?? baseCurrency,
      landedUnitCost: winner.line.landedUnitCost!,
      extendedLandedCost: winner.line.landedUnitCost! * el.quantity,
    };

    return {
      lineId: el.id,
      lineDescription: el.description,
      requestedQuantity: el.quantity,
      unit: el.unit,
      targetUnitPrice: el.targetUnitPrice,
      status: 'AWARDED' as const,
      allocations: [allocation],
      isManualOverride: false,
    };
  });
}

// ── Service factory ───────────────────────────────────────────────────────────

export function createAwardService(
  awardRepo: AwardRepository,
  comparisonRepo: ComparisonRepository,
  auditRepo: AuditRepository,
): AwardService {
  function genId() { return randomBytes(12).toString('hex'); }

  async function getComparisonOrThrow(tenantId: string, comparisonSnapshotId: string) {
    const snapshot = await comparisonRepo.getById(tenantId, comparisonSnapshotId);
    if (!snapshot) throw new AwardValidationError('Comparison snapshot not found');
    return snapshot;
  }

  async function getScenarioOrThrow(tenantId: string, scenarioId: string) {
    const scenario = await awardRepo.getById(tenantId, scenarioId);
    if (!scenario) throw new AwardScenarioNotFoundError();
    return scenario;
  }

  function assertNotFinalized(scenario: AwardScenario) {
    if (scenario.isFinalized) throw new AwardScenarioFinalizedError();
  }

  return {
    async createRecommendedScenario(tenantId, eventId, eventLines, input, userId, now) {
      const snapshot = await getComparisonOrThrow(tenantId, input.comparisonSnapshotId);
      const lines = buildRecommendedLines(eventLines, snapshot, snapshot.baseCurrency);
      const scenario: AwardScenario = {
        id: genId(), tenantId, eventId,
        comparisonSnapshotId: input.comparisonSnapshotId,
        name: input.name,
        awardType: deriveAwardType(lines),
        lines,
        summary: calcSummary(lines),
        isFinalized: false,
        createdAt: now, updatedAt: now, createdByUserId: userId,
        notes: input.notes,
      };
      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_SCENARIO_CREATED', scenario.id, 'award_scenario', 'buyer', userId, now, { recommended: true });
      return scenario;
    },

    async createEmptyScenario(tenantId, eventId, eventLines, input, userId, now) {
      await getComparisonOrThrow(tenantId, input.comparisonSnapshotId);
      const lines: AwardLine[] = eventLines.map(el => ({
        lineId: el.id, lineDescription: el.description,
        requestedQuantity: el.quantity, unit: el.unit, targetUnitPrice: el.targetUnitPrice,
        status: 'PENDING' as const, allocations: [], isManualOverride: false,
      }));
      const scenario: AwardScenario = {
        id: genId(), tenantId, eventId,
        comparisonSnapshotId: input.comparisonSnapshotId,
        name: input.name,
        awardType: deriveAwardType(lines),
        lines,
        summary: calcSummary(lines),
        isFinalized: false,
        createdAt: now, updatedAt: now, createdByUserId: userId,
        notes: input.notes,
      };
      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_SCENARIO_CREATED', scenario.id, 'award_scenario', 'buyer', userId, now, { recommended: false });
      return scenario;
    },

    async awardLine(tenantId, scenarioId, lineId, supplierId, quantity, overrideReason, userId, now) {
      const scenario = await getScenarioOrThrow(tenantId, scenarioId);
      assertNotFinalized(scenario);

      const snapshot = await getComparisonOrThrow(tenantId, scenario.comparisonSnapshotId);
      const nq = snapshot.normalizedQuotes.find(q => q.supplierId === supplierId);
      if (!nq) throw new AwardValidationError(`Supplier ${supplierId} not found in comparison snapshot`);

      const nqLine = nq.lines.find(l => l.lineId === lineId);
      if (!nqLine || nqLine.isNoBid || nqLine.landedUnitCost == null) {
        throw new AwardValidationError(`Supplier ${supplierId} has no bid for line ${lineId}`);
      }

      const awardLine = scenario.lines.find(l => l.lineId === lineId);
      if (!awardLine) throw new AwardValidationError(`Line ${lineId} not found in scenario`);

      if (quantity <= 0 || quantity > awardLine.requestedQuantity) {
        throw new AwardValidationError(`Quantity must be between 1 and ${awardLine.requestedQuantity}`);
      }
      const othersQuantity = awardLine.allocations
        .filter(a => a.supplierId !== supplierId)
        .reduce((s, a) => s + a.quantity, 0);
      if (othersQuantity + quantity > awardLine.requestedQuantity) {
        throw new AwardValidationError(
          `Total allocated quantity (${othersQuantity + quantity}) would exceed the requested quantity (${awardLine.requestedQuantity})`
        );
      }

      const isOverride = (() => {
        const bp = snapshot.lineBestPrices.find(b => b.lineId === lineId);
        return bp?.winningSupplierId !== supplierId;
      })();

      if (isOverride && !overrideReason) {
        throw new AwardValidationError('An override reason is required when awarding to a supplier that is not the lowest-cost bidder');
      }

      const allocation: AwardLineAllocation = {
        supplierId,
        supplierName: nq.supplierName,
        quantity,
        awardedUnitPrice: nqLine.quotedUnitPrice ?? nqLine.normalizedUnitPrice!,
        awardedCurrency: nqLine.quotedCurrency ?? snapshot.baseCurrency,
        landedUnitCost: nqLine.landedUnitCost,
        extendedLandedCost: nqLine.landedUnitCost * quantity,
      };

      // Upsert this supplier's allocation on the line — a *different* supplier
      // already allocated on the same line is left alone, splitting the line.
      awardLine.allocations = [...awardLine.allocations.filter(a => a.supplierId !== supplierId), allocation];
      awardLine.status = 'AWARDED';
      if (isOverride) { awardLine.isManualOverride = true; awardLine.overrideReason = overrideReason; }

      scenario.summary = calcSummary(scenario.lines);
      scenario.awardType = deriveAwardType(scenario.lines);
      scenario.updatedAt = now;
      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_LINE_SET', scenario.id, 'award_scenario', 'buyer', userId, now, {
        lineId, supplierId, quantity, isOverride, split: awardLine.allocations.length > 1, ...(overrideReason ? { overrideReason } : {}),
      });
      return scenario;
    },

    async clearLine(tenantId, scenarioId, lineId, userId, now) {
      const scenario = await getScenarioOrThrow(tenantId, scenarioId);
      assertNotFinalized(scenario);

      const awardLine = scenario.lines.find(l => l.lineId === lineId);
      if (!awardLine) throw new AwardValidationError(`Line ${lineId} not found in scenario`);

      awardLine.allocations = [];
      awardLine.status = 'PENDING';
      awardLine.isManualOverride = false;
      awardLine.overrideReason = undefined;

      scenario.summary = calcSummary(scenario.lines);
      scenario.awardType = deriveAwardType(scenario.lines);
      scenario.updatedAt = now;
      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_LINE_CLEARED', scenario.id, 'award_scenario', 'buyer', userId, now, { lineId });
      return scenario;
    },

    async markNoAward(tenantId, scenarioId, lineId, userId, now) {
      const scenario = await getScenarioOrThrow(tenantId, scenarioId);
      assertNotFinalized(scenario);

      const awardLine = scenario.lines.find(l => l.lineId === lineId);
      if (!awardLine) throw new AwardValidationError(`Line ${lineId} not found in scenario`);
      if (awardLine.allocations.length > 0) {
        throw new AwardValidationError('Remove existing allocations before marking a line as no-award');
      }

      awardLine.status = 'NO_AWARD';
      scenario.summary = calcSummary(scenario.lines);
      scenario.awardType = deriveAwardType(scenario.lines);
      scenario.updatedAt = now;
      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_LINE_CLEARED', scenario.id, 'award_scenario', 'buyer', userId, now, { lineId, noAward: true });
      return scenario;
    },

    async removeLineAllocation(tenantId, scenarioId, lineId, supplierId, userId, now) {
      const scenario = await getScenarioOrThrow(tenantId, scenarioId);
      assertNotFinalized(scenario);

      const awardLine = scenario.lines.find(l => l.lineId === lineId);
      if (!awardLine) throw new AwardValidationError(`Line ${lineId} not found in scenario`);

      awardLine.allocations = awardLine.allocations.filter(a => a.supplierId !== supplierId);
      if (awardLine.allocations.length === 0) {
        awardLine.status = 'PENDING';
        awardLine.isManualOverride = false;
        awardLine.overrideReason = undefined;
      }

      scenario.summary = calcSummary(scenario.lines);
      scenario.awardType = deriveAwardType(scenario.lines);
      scenario.updatedAt = now;
      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_LINE_CLEARED', scenario.id, 'award_scenario', 'buyer', userId, now, { lineId, supplierId });
      return scenario;
    },

    async finalizeScenario(tenantId, scenarioId, userId, now) {
      const scenario = await getScenarioOrThrow(tenantId, scenarioId);
      assertNotFinalized(scenario);

      const pendingLines = scenario.lines.filter(l => l.status === 'PENDING');
      if (pendingLines.length > 0) {
        throw new AwardValidationError(
          `Cannot finalize: ${pendingLines.length} line(s) still pending. Award or explicitly mark no-award for each line first.`
        );
      }

      scenario.isFinalized = true;
      scenario.finalizedAt = now;
      scenario.finalizedByUserId = userId;
      scenario.updatedAt = now;

      await awardRepo.save(scenario);
      await auditRepo.log(tenantId, 'AWARD_SCENARIO_FINALIZED', scenario.id, 'award_scenario', 'buyer', userId, now, {
        awardedLines: scenario.summary.awardedLineCount,
        totalCost: scenario.summary.totalAllocatedCost,
      });
      return scenario;
    },

    async getScenario(tenantId, scenarioId) {
      return awardRepo.getById(tenantId, scenarioId);
    },

    async listScenarios(tenantId, eventId) {
      return awardRepo.listForEvent(tenantId, eventId);
    },

    async getFinalizedScenario(tenantId, eventId) {
      return awardRepo.getFinalized(tenantId, eventId);
    },
  };
}
