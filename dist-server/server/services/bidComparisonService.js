import { randomBytes } from 'crypto';
export class BidComparisonError extends Error {
    constructor(message) { super(message); this.name = 'BidComparisonError'; }
}
// ── FX Normalization ──────────────────────────────────────────────────────────
function convertToBase(amount, currency, baseCurrency, rates) {
    if (currency === baseCurrency)
        return amount;
    const baseRate = rates[baseCurrency];
    const fromRate = rates[currency];
    if (baseRate == null || fromRate == null)
        return undefined;
    // All rates are against a common denominator; compute cross-rate
    return amount * (baseRate / fromRate);
}
// ── Freight allocation ────────────────────────────────────────────────────────
function allocateFreight(freightTotal, freightCurrency, freightIncluded, lines, baseCurrency, rates, policy) {
    const allocations = new Map();
    if (!freightTotal || freightIncluded)
        return allocations;
    const freightBase = freightCurrency
        ? convertToBase(freightTotal, freightCurrency, baseCurrency, rates) ?? freightTotal
        : freightTotal;
    const bidLines = lines.filter(l => !l.isNoBid && l.normalizedUnitPrice != null);
    if (bidLines.length === 0)
        return allocations;
    if (policy === 'EQUAL_PER_LINE') {
        const perLine = freightBase / bidLines.length;
        bidLines.forEach(l => allocations.set(l.lineId, perLine / l.requestedQuantity));
    }
    else {
        // PROPORTIONAL_TO_LINE_VALUE (default)
        const totalValue = bidLines.reduce((sum, l) => sum + (l.normalizedUnitPrice * l.requestedQuantity), 0);
        bidLines.forEach(l => {
            const lineValue = l.normalizedUnitPrice * l.requestedQuantity;
            const lineShare = totalValue > 0 ? freightBase * (lineValue / totalValue) : 0;
            allocations.set(l.lineId, lineShare / l.requestedQuantity);
        });
    }
    return allocations;
}
// ── Normalize a single quote line ─────────────────────────────────────────────
function normalizeQuoteLine(eventLine, quoteLine, baseCurrency, fxRates) {
    const exceptions = [];
    const isNoBid = !quoteLine || quoteLine.unitPrice == null;
    if (isNoBid) {
        exceptions.push('NO_BID');
        return {
            lineId: eventLine.id,
            lineDescription: eventLine.description,
            requestedQuantity: eventLine.quantity,
            requestedUnit: eventLine.unit,
            isNoBid: true,
            exceptions,
        };
    }
    const qCurrency = quoteLine.currency ?? baseCurrency;
    const normalizedUnitPrice = convertToBase(quoteLine.unitPrice, qCurrency, baseCurrency, fxRates);
    const fxRate = qCurrency === baseCurrency ? 1 : (fxRates[baseCurrency] / fxRates[qCurrency]);
    if (normalizedUnitPrice == null) {
        exceptions.push('CURRENCY_NOT_NORMALIZED');
    }
    if (quoteLine.moq != null && quoteLine.moq > eventLine.quantity) {
        exceptions.push('MOQ_EXCEEDS_REQUEST');
    }
    if (eventLine.requestedDeliveryDate && quoteLine.leadTimeDays != null) {
        const deadline = new Date(eventLine.requestedDeliveryDate);
        const approxDelivery = new Date(Date.now() + quoteLine.leadTimeDays * 86400_000);
        if (approxDelivery > deadline)
            exceptions.push('LATE_DELIVERY');
    }
    if (quoteLine.leadTimeDays != null && quoteLine.leadTimeDays > 90) {
        exceptions.push('LONG_LEAD_TIME');
    }
    const base = normalizedUnitPrice ?? quoteLine.unitPrice;
    const landedUnitCost = base; // freight allocated after all lines are built
    return {
        lineId: eventLine.id,
        lineDescription: eventLine.description,
        requestedQuantity: eventLine.quantity,
        requestedUnit: eventLine.unit,
        quotedUnitPrice: quoteLine.unitPrice,
        quotedCurrency: qCurrency,
        quotedLeadTimeDays: quoteLine.leadTimeDays,
        quotedMoq: quoteLine.moq,
        normalizedUnitPrice: normalizedUnitPrice ?? undefined,
        fxRate: qCurrency !== baseCurrency ? fxRate : undefined,
        landedUnitCost,
        extendedLandedCost: landedUnitCost * eventLine.quantity,
        isNoBid: false,
        exceptions,
        supplierNotes: quoteLine.notes,
    };
}
// ── Normalize a supplier quote against event lines ────────────────────────────
function normalizeQuote(invitation, quote, eventLines, baseCurrency, fxRates, freightPolicy) {
    if (!quote || quote.status !== 'SUBMITTED') {
        const lines = eventLines.map(el => ({
            lineId: el.id,
            lineDescription: el.description,
            requestedQuantity: el.quantity,
            requestedUnit: el.unit,
            isNoBid: true,
            exceptions: ['NO_BID'],
        }));
        return {
            supplierId: invitation.supplierId,
            supplierName: invitation.supplierNameSnapshot,
            invitationId: invitation.id,
            quoteId: quote?.id,
            status: quote ? 'SUBMITTED' : 'PENDING',
            lines,
            totalBidLines: 0,
            totalNoBidLines: eventLines.length,
            exceptions: eventLines.length > 0 ? ['NO_BID'] : [],
        };
    }
    const quoteLineMap = new Map(quote.lines.map(l => [l.lineId, l]));
    const lines = eventLines.map(el => normalizeQuoteLine(el, quoteLineMap.get(el.id), baseCurrency, fxRates));
    // Freight allocation
    const freightAllocations = allocateFreight(quote.freightTotal, quote.freightCurrency, quote.freightIncluded, lines, baseCurrency, fxRates, freightPolicy);
    // Apply freight to landed costs
    lines.forEach(l => {
        if (!l.isNoBid && l.normalizedUnitPrice != null) {
            const fa = freightAllocations.get(l.lineId) ?? 0;
            l.freightAllocation = fa;
            l.landedUnitCost = l.normalizedUnitPrice + fa + (l.dutyAmount ?? 0) + (l.handlingAmount ?? 0) - (l.discountAmount ?? 0);
            l.extendedLandedCost = l.landedUnitCost * l.requestedQuantity;
        }
    });
    const bidLines = lines.filter(l => !l.isNoBid && l.landedUnitCost != null);
    const noBidLines = lines.filter(l => l.isNoBid);
    const totalLandedCost = bidLines.reduce((s, l) => s + (l.extendedLandedCost ?? 0), 0);
    const allExceptions = [...new Set(lines.flatMap(l => l.exceptions))];
    if (!quote.commercialTerms || !quote.paymentTerms)
        allExceptions.push('MISSING_COMMERCIAL_TERMS');
    if (quote.validityDays != null && quote.validityDays < 14)
        allExceptions.push('EXPIRED_QUOTE');
    return {
        supplierId: invitation.supplierId,
        supplierName: invitation.supplierNameSnapshot,
        invitationId: invitation.id,
        quoteId: quote.id,
        status: 'SUBMITTED',
        lines,
        quotedCurrency: quote.lines[0]?.currency ?? baseCurrency,
        commercialTerms: quote.commercialTerms,
        paymentTerms: quote.paymentTerms,
        validityDays: quote.validityDays,
        freightTotal: quote.freightTotal,
        freightCurrency: quote.freightCurrency,
        freightIncluded: quote.freightIncluded,
        supplierNotes: quote.supplierNotes,
        submittedAt: quote.submittedAt,
        totalLandedCost: bidLines.length > 0 ? totalLandedCost : undefined,
        totalBidLines: bidLines.length,
        totalNoBidLines: noBidLines.length,
        exceptions: [...new Set(allExceptions)],
    };
}
// ── Best price analysis per line ──────────────────────────────────────────────
function calcLineBestPrices(normalizedQuotes, eventLines) {
    return eventLines.map(el => {
        const bids = normalizedQuotes
            .flatMap(nq => nq.lines.filter(l => l.lineId === el.id && !l.isNoBid && l.landedUnitCost != null))
            .map(l => ({ landedCost: l.landedUnitCost, normalizedPrice: l.normalizedUnitPrice, supplierId: normalizedQuotes.find(nq => nq.lines.includes(l)).supplierId }))
            .sort((a, b) => a.landedCost - b.landedCost);
        if (bids.length === 0) {
            return { lineId: el.id, bidCount: 0 };
        }
        const [first, second] = bids;
        const spread = second ? ((second.landedCost - first.landedCost) / first.landedCost) * 100 : undefined;
        const savings = el.targetUnitPrice != null
            ? (el.targetUnitPrice - first.landedCost) * el.quantity
            : undefined;
        const savingsPercent = el.targetUnitPrice != null && el.targetUnitPrice > 0
            ? ((el.targetUnitPrice - first.landedCost) / el.targetUnitPrice) * 100
            : undefined;
        return {
            lineId: el.id,
            lowestNormalizedPrice: first.normalizedPrice,
            lowestLandedCost: first.landedCost,
            winningSupplierId: first.supplierId,
            secondLowestPrice: second?.landedCost,
            spread,
            potentialSavings: savings,
            savingsPercent,
            bidCount: bids.length,
        };
    });
}
// ── Commercial terms comparison ───────────────────────────────────────────────
function buildCommercialComparisons(normalizedQuotes, invitations, quotes) {
    return invitations.map(inv => {
        const quote = quotes.find(q => q.invitationId === inv.id);
        const nq = normalizedQuotes.find(q => q.invitationId === inv.id);
        const exceptions = [];
        if (!quote?.commercialTerms || !quote?.paymentTerms)
            exceptions.push('MISSING_COMMERCIAL_TERMS');
        return {
            supplierId: inv.supplierId,
            paymentTerms: quote?.paymentTerms,
            leadTimeDays: quote?.lines[0]?.leadTimeDays,
            validityDays: quote?.validityDays,
            freightIncluded: quote?.freightIncluded,
            exceptions: [...new Set([...(nq?.exceptions ?? []), ...exceptions])],
        };
    });
}
// ── Weighted Evaluation Scoring ───────────────────────────────────────────────
const DEFAULT_CRITERIA = [
    { key: 'LANDED_COST', label: 'Landed Cost', weight: 60 },
    { key: 'LEAD_TIME', label: 'Lead Time', weight: 20 },
    { key: 'COMMERCIAL_COMPLETENESS', label: 'Commercial Completeness', weight: 20 },
];
function scoreSuppliers(normalizedQuotes, criteria) {
    const submitted = normalizedQuotes.filter(nq => nq.status === 'SUBMITTED' && nq.totalLandedCost != null);
    const landedCosts = submitted.map(nq => nq.totalLandedCost).filter(v => v > 0);
    const minCost = landedCosts.length ? Math.min(...landedCosts) : 0;
    const maxCost = landedCosts.length ? Math.max(...landedCosts) : 0;
    const avgLeadTimes = submitted.map(nq => {
        const times = nq.lines.filter(l => l.quotedLeadTimeDays != null).map(l => l.quotedLeadTimeDays);
        return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    });
    const definedLt = avgLeadTimes.filter((v) => v != null);
    const minLt = definedLt.length ? Math.min(...definedLt) : 0;
    const maxLt = definedLt.length ? Math.max(...definedLt) : 0;
    return normalizedQuotes.map((nq, idx) => {
        const criteriaScores = criteria.map(c => {
            let rawValue = 0;
            let normalizedScore = 0;
            if (c.key === 'LANDED_COST') {
                rawValue = nq.totalLandedCost ?? 0;
                if (maxCost > minCost && rawValue > 0) {
                    normalizedScore = ((maxCost - rawValue) / (maxCost - minCost)) * 100;
                }
                else if (rawValue === minCost && rawValue > 0) {
                    normalizedScore = 100;
                }
            }
            else if (c.key === 'LEAD_TIME') {
                rawValue = avgLeadTimes[idx] ?? 0;
                if (rawValue > 0 && maxLt > minLt) {
                    normalizedScore = ((maxLt - rawValue) / (maxLt - minLt)) * 100;
                }
                else if (rawValue === minLt && rawValue > 0) {
                    normalizedScore = 100;
                }
            }
            else if (c.key === 'COMMERCIAL_COMPLETENESS') {
                const hasMissing = nq.exceptions.includes('MISSING_COMMERCIAL_TERMS');
                normalizedScore = hasMissing ? 0 : 100;
                rawValue = normalizedScore;
            }
            else if (c.key === 'MANUAL_TECHNICAL') {
                normalizedScore = 0; // set later via setManualTechnicalScore
                rawValue = 0;
            }
            return {
                key: c.key,
                rawValue,
                normalizedScore: Math.max(0, Math.min(100, normalizedScore)),
                weightedContribution: (normalizedScore * c.weight) / 100,
            };
        });
        const totalScore = criteriaScores.reduce((s, c) => s + c.weightedContribution, 0);
        return {
            supplierId: nq.supplierId,
            criteria: criteriaScores,
            totalScore: Math.max(0, Math.min(100, totalScore)),
        };
    });
}
// ── Service factory ───────────────────────────────────────────────────────────
export function createBidComparisonService(invitationRepo, quoteService, comparisonRepo) {
    return {
        async buildSnapshot(tenantId, eventId, eventLines, input, userId, now) {
            const invitations = await invitationRepo.listForEvent(tenantId, eventId);
            const quotes = await quoteService.listForEvent(tenantId, eventId);
            const fxRates = input.fxRates ?? {};
            if (!fxRates[input.baseCurrency])
                fxRates[input.baseCurrency] = 1;
            const exchangeRateSnapshot = Object.keys(fxRates).length > 1 ? {
                id: randomBytes(8).toString('hex'),
                tenantId,
                eventId,
                baseCurrency: input.baseCurrency,
                effectiveDate: now.slice(0, 10),
                rates: fxRates,
                source: 'MANUAL',
                createdAt: now,
                createdByUserId: userId,
            } : undefined;
            const normalizedQuotes = invitations.map(inv => {
                const quote = quotes.find(q => q.invitationId === inv.id);
                return normalizeQuote(inv, quote, eventLines, input.baseCurrency, fxRates, input.freightAllocationPolicy);
            });
            const lineBestPrices = calcLineBestPrices(normalizedQuotes, eventLines);
            const commercialComparisons = buildCommercialComparisons(normalizedQuotes, invitations, quotes);
            const evaluationCriteria = input.evaluationCriteria ?? DEFAULT_CRITERIA;
            const supplierScores = scoreSuppliers(normalizedQuotes, evaluationCriteria);
            const snapshot = {
                id: randomBytes(12).toString('hex'),
                tenantId,
                eventId,
                baseCurrency: input.baseCurrency,
                freightAllocationPolicy: input.freightAllocationPolicy,
                exchangeRateSnapshot,
                normalizedQuotes,
                lineBestPrices,
                commercialComparisons,
                evaluationCriteria,
                supplierScores,
                createdAt: now,
                createdByUserId: userId,
                notes: input.notes,
            };
            return comparisonRepo.save(snapshot);
        },
        async getLatestSnapshot(tenantId, eventId) {
            return comparisonRepo.getLatest(tenantId, eventId);
        },
        async getSnapshot(tenantId, snapshotId) {
            return comparisonRepo.getById(tenantId, snapshotId);
        },
        async listSnapshots(tenantId, eventId) {
            return comparisonRepo.listForEvent(tenantId, eventId);
        },
        async setManualTechnicalScore(tenantId, snapshotId, supplierId, score, comment, userId, now) {
            const snapshot = await comparisonRepo.getById(tenantId, snapshotId);
            if (!snapshot)
                return null;
            const scoreEntry = snapshot.supplierScores.find(s => s.supplierId === supplierId);
            if (!scoreEntry)
                return null;
            // Upsert MANUAL_TECHNICAL criterion if not present
            let hasCriterion = snapshot.evaluationCriteria.some(c => c.key === 'MANUAL_TECHNICAL');
            if (!hasCriterion) {
                // Already validated that total should sum to 100 — technical score is extra dimension tracked separately
                hasCriterion = false;
            }
            const manualScore = Math.max(0, Math.min(100, score));
            scoreEntry.manualTechnicalScore = manualScore;
            scoreEntry.manualTechnicalComment = comment;
            scoreEntry.evaluatedBy = userId;
            scoreEntry.evaluatedAt = now;
            // Recompute total if MANUAL_TECHNICAL in criteria
            const techCriterion = snapshot.evaluationCriteria.find(c => c.key === 'MANUAL_TECHNICAL');
            if (techCriterion) {
                const techEntry = scoreEntry.criteria.find(c => c.key === 'MANUAL_TECHNICAL');
                if (techEntry) {
                    techEntry.rawValue = manualScore;
                    techEntry.normalizedScore = manualScore;
                    techEntry.weightedContribution = (manualScore * techCriterion.weight) / 100;
                    scoreEntry.totalScore = Math.max(0, Math.min(100, scoreEntry.criteria.reduce((s, c) => s + c.weightedContribution, 0)));
                }
            }
            return comparisonRepo.save(snapshot);
        },
    };
}
