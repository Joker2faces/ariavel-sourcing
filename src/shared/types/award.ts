// M7 Award Workspace domain types

export type AwardType = 'WHOLE' | 'LINE' | 'SPLIT';
export type AwardLineStatus = 'PENDING' | 'AWARDED' | 'NO_AWARD';

export interface AwardLineAllocation {
  supplierId: string;
  supplierName: string;
  quantity: number;
  awardedUnitPrice: number;
  awardedCurrency: string;
  landedUnitCost: number;
  extendedLandedCost: number;
  notes?: string;
}

export interface AwardLine {
  lineId: string;
  lineDescription: string;
  requestedQuantity: number;
  unit: string;
  targetUnitPrice?: number;
  status: AwardLineStatus;
  allocations: AwardLineAllocation[];
  overrideReason?: string;
  isManualOverride: boolean;
}

export interface AwardSummary {
  totalAllocatedCost: number;
  totalTargetCost?: number;
  totalSavings?: number;
  savingsPercent?: number;
  supplierCount: number;
  lineCount: number;
  awardedLineCount: number;
  noAwardLineCount: number;
  supplierConcentration: Array<{ supplierId: string; supplierName: string; allocatedCost: number; share: number }>;
}

export interface AwardScenario {
  id: string;
  tenantId: string;
  eventId: string;
  comparisonSnapshotId: string;
  name: string;
  awardType: AwardType;
  lines: AwardLine[];
  summary: AwardSummary;
  isFinalized: boolean;
  finalizedAt?: string;
  finalizedByUserId?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  notes?: string;
}

export interface AwardScenarioInput {
  name: string;
  comparisonSnapshotId: string;
  notes?: string;
}

export interface AwardLineInput {
  lineId: string;
  supplierId: string;
  quantity: number;
  overrideReason?: string;
}
