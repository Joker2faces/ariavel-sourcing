export type SourcingEventStatus = 'active' | 'awaiting_quotes' | 'closing_soon' | 'completed';

export interface Tenant { mondayAccountId: string; }
export type SupplierStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'BLOCKED';
export type SupplierSourceType = 'ARIAVEL' | 'MONDAY_BOARD' | 'IMPORT';
export type SupplierFieldKey = 'name' | 'supplierCode' | 'email' | 'primaryContactName' | 'status' | 'category' | 'country' | 'currency' | 'paymentTerms' | 'preferred' | 'rating' | 'phone';

export interface SupplierInput {
  name: string;
  supplierCode?: string;
  status: SupplierStatus;
  category?: string;
  country?: string;
  primaryContactName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  paymentTerms?: string;
  defaultIncoterm?: string;
  preferred: boolean;
  rating?: number;
  notes?: string;
  sourceType: SupplierSourceType;
  mondayBoardId?: string;
  mondayItemId?: string;
}

export interface Supplier extends SupplierInput {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MondayColumnDescriptor { id: string; title: string; type: string; }
export interface MondayBoardSampleItem { id: string; name: string; columnValues: Record<string, string | number | boolean | null>; }
export interface MondayBoardDescriptor { id: string; name: string; columns: MondayColumnDescriptor[]; sampleItems: MondayBoardSampleItem[]; }
export interface MondayItemDescriptor { id: string; name: string; columnValues: Record<string, string | null>; }
export interface SourceWarning { itemId: string; field: string; message: string; }
export interface SupplierFieldMapping { supplierField: SupplierFieldKey; mondayColumnId: string; }
export interface SupplierBoardMapping { boardId: string; fieldMappings: SupplierFieldMapping[]; configuredAt: string; }
export type SupplierSourceConfiguration = { mode: 'ARIAVEL' } | { mode: 'MONDAY_BOARD'; boardMapping: SupplierBoardMapping };
export type MappingIssueKind = 'VALID' | 'WARNING' | 'MISSING_REQUIRED' | 'UNMAPPED';
export interface MappingIssue { supplierField: SupplierFieldKey; kind: MappingIssueKind; message: string; }
export interface SourcingEvent { id: string; tenantId: string; title: string; status: SourcingEventStatus; deadline: string; currency: string; createdAt: string; createdBy: string; supplierResponseCount: number; supplierCount: number; }
export interface SourcingLine { id: string; sourcingEventId: string; description: string; sku?: string; quantity: number; unit: string; }
export interface SupplierInvitation { id: string; sourcingEventId: string; supplierId: string; status: 'invited' | 'responded' | 'declined'; }
export interface CommercialTerms { freight?: number; paymentTerms?: string; incoterm?: string; leadTime?: string; validity?: string; }
export interface SupplierQuote { id: string; sourcingEventId: string; supplierId: string; status: 'draft' | 'submitted'; currency: string; submittedAt?: string; terms: CommercialTerms; }
export interface QuoteLine { supplierQuoteId: string; sourcingLineId: string; unitPrice: number; quantity: number; MOQ?: number; }
export interface Award { id: string; sourcingEventId: string; supplierId: string; awardedAt?: string; status: 'recommended' | 'approved'; }
