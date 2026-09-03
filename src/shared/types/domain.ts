// Supplier domain
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

// Board / mapping
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

// Sourcing event domain (Milestone 4)
export type SourcingEventStatus = 'DRAFT' | 'READY_FOR_INVITATION' | 'OPEN' | 'EVALUATING' | 'AWARDED' | 'CANCELLED';

export interface SourcingLine {
  id: string;
  description: string;
  sku?: string;
  quantity: number;
  unit: string;
  category?: string;
  specification?: string;
  requestedDeliveryDate?: string;
  targetUnitPrice?: number;
}

export interface SourcingSupplierSelection {
  supplierId: string;
  source: SupplierSourceType;
  mondayBoardId?: string;
  mondayItemId?: string;
  supplierNameSnapshot: string;
  supplierCodeSnapshot?: string;
  emailSnapshot?: string;
  selectedAt: string;
}

export interface SourcingEvent {
  id: string;
  tenantId: string;
  reference: string;
  title: string;
  description?: string;
  status: SourcingEventStatus;
  currency: string;
  deadline?: string;
  targetDeliveryDate?: string;
  category?: string;
  ownerUserId: string;
  ownerName?: string;
  lines: SourcingLine[];
  supplierSelections: SourcingSupplierSelection[];
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  updatedByUserId: string;
}

export interface SourcingEventInput {
  reference: string;
  title: string;
  description?: string;
  currency: string;
  deadline?: string;
  targetDeliveryDate?: string;
  category?: string;
  ownerUserId: string;
  ownerName?: string;
  lines: SourcingLine[];
  supplierSelections: SourcingSupplierSelection[];
  internalNotes?: string;
}
