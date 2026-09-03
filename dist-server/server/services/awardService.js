import { randomBytes } from 'crypto';
export class AwardScenarioNotFoundError extends Error {
    constructor() { super('Award scenario not found'); }
}
export class AwardScenarioFinalizedError extends Error {
    constructor() { super('Award scenario is already finalized and cannot be modified'); }
}
export class AwardValidationError extends Error {
    constructor(message) { super(message); }
}
// ── Summary calculation ───────────────────────────────────────────────────────
function calcSummary(lines) {
    const awardedLines = lines.filter(l => l.status === 'AWARDED');
    const totalAllocatedCost = awardedLines.reduce((s, l) => s + l.allocations.reduce((as, a) => as + a.extendedLandedCost, 0), 0);
    const totalTargetCost = lines.every(l => l.targetUnitPrice != null)
        ? lines.reduce((s, l) => s + (l.targetUnitPrice ?? 0) * l.requestedQuantity, 0)
        : undefined;
    const totalSavings = totalTargetCost != null ? totalTargetCost - totalAllocatedCost : undefined;
    const savingsPercent = totalTargetCost != null && totalTargetCost > 0
        ? (totalSavings / totalTargetCost) * 100
        : undefined;
    // Supplier concentration
    const supplierMap = new Map();
    awardedLines.forEach(l => {
        l.allocations.forEach(a => {
            const existing = supplierMap.get(a.supplierId);
            if (existing) {
                existing.cost += a.extendedLandedCost;
            }
            else {
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
// ── Recommendation engine (deterministic: lowest landed cost per line) ────────
function buildRecommendedLines(eventLines, snapshot, baseCurrency) {
    return eventLines.map(el => {
        const candidates = snapshot.normalizedQuotes
            .flatMap(nq => {
            const line = nq.lines.find(l => l.lineId === el.id);
            if (!line || line.isNoBid || line.landedUnitCost == null)
                return [];
            return [{ supplierId: nq.supplierId, supplierName: nq.supplierName, line }];
        })
            .sort((a, b) => a.line.landedUnitCost - b.line.landedUnitCost);
        if (candidates.length === 0) {
            return {
                lineId: el.id,
                lineDescription: el.description,
                requestedQuantity: el.quantity,
                unit: el.unit,
                targetUnitPrice: el.targetUnitPrice,
                status: 'NO_AWARD',
                allocations: [],
                isManualOverride: false,
            };
        }
        const winner = candidates[0];
        const allocation = {
            supplierId: winner.supplierId,
            supplierName: winner.supplierName,
            quantity: el.quantity,
            awardedUnitPrice: winner.line.quotedUnitPrice ?? winner.line.normalizedUnitPrice,
            awardedCurrency: winner.line.quotedCurrency ?? baseCurrency,
            landedUnitCost: winner.line.landedUnitCost,
            extendedLandedCost: winner.line.landedUnitCost * el.quantity,
        };
        return {
            lineId: el.id,
            lineDescription: el.description,
            requestedQuantity: el.quantity,
            unit: el.unit,
            targetUnitPrice: el.targetUnitPrice,
            status: 'AWARDED',
            allocations: [allocation],
            isManualOverride: false,
        };
    });
}
// ── Service factory ───────────────────────────────────────────────────────────
export function createAwardService(awardRepo, comparisonRepo, auditRepo) {
    function genId() { return randomBytes(12).toString('hex'); }
    async function getComparisonOrThrow(tenantId, comparisonSnapshotId) {
        const snapshot = await comparisonRepo.getById(tenantId, comparisonSnapshotId);
        if (!snapshot)
            throw new AwardValidationError('Comparison snapshot not found');
        return snapshot;
    }
    async function getScenarioOrThrow(tenantId, scenarioId) {
        const scenario = await awardRepo.getById(tenantId, scenarioId);
        if (!scenario)
            throw new AwardScenarioNotFoundError();
        return scenario;
    }
    function assertNotFinalized(scenario) {
        if (scenario.isFinalized)
            throw new AwardScenarioFinalizedError();
    }
    return {
        async createRecommendedScenario(tenantId, eventId, eventLines, input, userId, now) {
            const snapshot = await getComparisonOrThrow(tenantId, input.comparisonSnapshotId);
            const lines = buildRecommendedLines(eventLines, snapshot, snapshot.baseCurrency);
            const scenario = {
                id: genId(), tenantId, eventId,
                comparisonSnapshotId: input.comparisonSnapshotId,
                name: input.name,
                awardType: 'LINE',
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
            const lines = eventLines.map(el => ({
                lineId: el.id, lineDescription: el.description,
                requestedQuantity: el.quantity, unit: el.unit, targetUnitPrice: el.targetUnitPrice,
                status: 'PENDING', allocations: [], isManualOverride: false,
            }));
            const scenario = {
                id: genId(), tenantId, eventId,
                comparisonSnapshotId: input.comparisonSnapshotId,
                name: input.name,
                awardType: 'LINE',
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
            if (!nq)
                throw new AwardValidationError(`Supplier ${supplierId} not found in comparison snapshot`);
            const nqLine = nq.lines.find(l => l.lineId === lineId);
            if (!nqLine || nqLine.isNoBid || nqLine.landedUnitCost == null) {
                throw new AwardValidationError(`Supplier ${supplierId} has no bid for line ${lineId}`);
            }
            const awardLine = scenario.lines.find(l => l.lineId === lineId);
            if (!awardLine)
                throw new AwardValidationError(`Line ${lineId} not found in scenario`);
            if (quantity <= 0 || quantity > awardLine.requestedQuantity) {
                throw new AwardValidationError(`Quantity must be between 1 and ${awardLine.requestedQuantity}`);
            }
            const isOverride = (() => {
                const bp = snapshot.lineBestPrices.find(b => b.lineId === lineId);
                return bp?.winningSupplierId !== supplierId;
            })();
            if (isOverride && !overrideReason) {
                throw new AwardValidationError('An override reason is required when awarding to a supplier that is not the lowest-cost bidder');
            }
            const allocation = {
                supplierId,
                supplierName: nq.supplierName,
                quantity,
                awardedUnitPrice: nqLine.quotedUnitPrice ?? nqLine.normalizedUnitPrice,
                awardedCurrency: nqLine.quotedCurrency ?? snapshot.baseCurrency,
                landedUnitCost: nqLine.landedUnitCost,
                extendedLandedCost: nqLine.landedUnitCost * quantity,
            };
            awardLine.allocations = [allocation]; // single-supplier allocation; split comes later
            awardLine.status = 'AWARDED';
            awardLine.isManualOverride = isOverride;
            if (isOverride)
                awardLine.overrideReason = overrideReason;
            scenario.summary = calcSummary(scenario.lines);
            scenario.updatedAt = now;
            await awardRepo.save(scenario);
            await auditRepo.log(tenantId, 'AWARD_LINE_SET', scenario.id, 'award_scenario', 'buyer', userId, now, {
                lineId, supplierId, quantity, isOverride, ...(overrideReason ? { overrideReason } : {}),
            });
            return scenario;
        },
        async clearLine(tenantId, scenarioId, lineId, userId, now) {
            const scenario = await getScenarioOrThrow(tenantId, scenarioId);
            assertNotFinalized(scenario);
            const awardLine = scenario.lines.find(l => l.lineId === lineId);
            if (!awardLine)
                throw new AwardValidationError(`Line ${lineId} not found in scenario`);
            awardLine.allocations = [];
            awardLine.status = 'PENDING';
            awardLine.isManualOverride = false;
            awardLine.overrideReason = undefined;
            scenario.summary = calcSummary(scenario.lines);
            scenario.updatedAt = now;
            await awardRepo.save(scenario);
            await auditRepo.log(tenantId, 'AWARD_LINE_CLEARED', scenario.id, 'award_scenario', 'buyer', userId, now, { lineId });
            return scenario;
        },
        async finalizeScenario(tenantId, scenarioId, userId, now) {
            const scenario = await getScenarioOrThrow(tenantId, scenarioId);
            assertNotFinalized(scenario);
            const pendingLines = scenario.lines.filter(l => l.status === 'PENDING');
            if (pendingLines.length > 0) {
                throw new AwardValidationError(`Cannot finalize: ${pendingLines.length} line(s) still pending. Award or explicitly mark no-award for each line first.`);
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
