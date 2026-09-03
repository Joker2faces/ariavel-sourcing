// M6 Bid Intelligence domain types

export type FreightAllocationPolicy = 'PROPORTIONAL_TO_LINE_VALUE' | 'EQUAL_PER_LINE' | 'MANUAL';
export type FxRateSource = 'MANUAL';

export interface ExchangeRateSnapshot {
  id: string;
  tenantId: string;
  eventId: string;
  baseCurrency: string;
  effectiveDate: string;
  rates: Record<string, number>; // { "USD": 1, "EUR": 0.91, "GBP": 1.17 }
  source: FxRateSource;
  createdAt: string;
  createdByUserId: string;
}

export type BidLineException =
  | 'NO_BID'
  | 'MISSING_PRICE'
  | 'MOQ_EXCEEDS_REQUEST'
  | 'PARTIAL_QUANTITY'
  | 'LATE_DELIVERY'
  | 'LONG_LEAD_TIME'
  | 'CURRENCY_NOT_NORMALIZED'
  | 'MISSING_COMMERCIAL_TERMS'
  | 'EXPIRED_QUOTE'
  | 'MANUAL_OVERRIDE';

export interface NormalizedQuoteLine {
  lineId: string;
  lineDescription: string;
  requestedQuantity: number;
  requestedUnit: string;
  // Raw from supplier
  quotedUnitPrice?: number;
  quotedCurrency?: string;
  quotedLeadTimeDays?: number;
  quotedMoq?: number;
  // Normalized
  normalizedUnitPrice?: number;   // in base currency
  fxRate?: number;                // rate used for conversion
  freightAllocation?: number;     // allocated freight in base currency per unit
  dutyAmount?: number;            // per unit in base currency
  handlingAmount?: number;        // per unit in base currency
  discountAmount?: number;        // per unit in base currency (negative = saving)
  landedUnitCost?: number;        // normalizedUnitPrice + freight + duty + handling - discount
  extendedLandedCost?: number;    // landedUnitCost * requestedQuantity
  isNoBid: boolean;
  exceptions: BidLineException[];
  supplierNotes?: string;
}

export interface NormalizedQuote {
  supplierId: string;
  supplierName: string;
  invitationId: string;
  quoteId?: string;
  status: 'PENDING' | 'SUBMITTED' | 'NO_BID_ALL';
  lines: NormalizedQuoteLine[];
  // Commercial summary
  quotedCurrency?: string;
  commercialTerms?: string;
  paymentTerms?: string;
  validityDays?: number;
  freightTotal?: number;
  freightCurrency?: string;
  freightIncluded?: boolean;
  discountTotal?: number;
  supplierNotes?: string;
  submittedAt?: string;
  // Aggregates (all in base currency)
  totalLandedCost?: number;
  totalBidLines: number;
  totalNoBidLines: number;
  exceptions: BidLineException[];
}

export interface LineBestPrice {
  lineId: string;
  lowestNormalizedPrice?: number;
  lowestLandedCost?: number;
  winningSupplierId?: string;
  secondLowestPrice?: number;
  spread?: number;              // % difference between 1st and 2nd
  potentialSavings?: number;    // vs targetUnitPrice if set
  savingsPercent?: number;
  bidCount: number;             // suppliers with actual bid (not NO_BID)
}

export interface CommercialTermsComparison {
  supplierId: string;
  paymentTerms?: string;
  incoterm?: string;
  leadTimeDays?: number;
  validityDays?: number;
  moq?: number;
  freightIncluded?: boolean;
  exceptions: BidLineException[];
}

export type EvaluationCriterionKey = 'LANDED_COST' | 'LEAD_TIME' | 'PAYMENT_TERMS' | 'COMMERCIAL_COMPLETENESS' | 'MANUAL_TECHNICAL';

export interface EvaluationCriterion {
  key: EvaluationCriterionKey;
  label: string;
  weight: number; // 0–100, all weights must sum to 100
}

export interface SupplierEvaluationScore {
  supplierId: string;
  criteria: Array<{
    key: EvaluationCriterionKey;
    rawValue: number;
    normalizedScore: number; // 0–100
    weightedContribution: number;
  }>;
  totalScore: number; // 0–100
  manualTechnicalScore?: number;
  manualTechnicalComment?: string;
  evaluatedBy?: string;
  evaluatedAt?: string;
}

export interface ComparisonSnapshot {
  id: string;
  tenantId: string;
  eventId: string;
  baseCurrency: string;
  freightAllocationPolicy: FreightAllocationPolicy;
  exchangeRateSnapshot?: ExchangeRateSnapshot;
  normalizedQuotes: NormalizedQuote[];
  lineBestPrices: LineBestPrice[];
  commercialComparisons: CommercialTermsComparison[];
  evaluationCriteria: EvaluationCriterion[];
  supplierScores: SupplierEvaluationScore[];
  createdAt: string;
  createdByUserId: string;
  notes?: string;
}

export interface ComparisonInput {
  baseCurrency: string;
  freightAllocationPolicy: FreightAllocationPolicy;
  fxRates?: Record<string, number>;
  evaluationCriteria?: EvaluationCriterion[];
  notes?: string;
}
