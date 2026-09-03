export type QuoteStatus = 'DRAFT' | 'SUBMITTED';

export interface QuoteLine {
  lineId: string;
  lineDescription: string;
  unitPrice?: number;
  currency?: string;
  leadTimeDays?: number;
  moq?: number;
  notes?: string;
}

export interface SupplierQuote {
  id: string;
  tenantId: string;
  invitationId: string;
  eventId: string;
  supplierId: string;
  supplierNameSnapshot: string;
  status: QuoteStatus;
  lines: QuoteLine[];
  commercialTerms?: string;
  paymentTerms?: string;
  validityDays?: number;
  freightTotal?: number;
  freightCurrency?: string;
  freightIncluded?: boolean;
  supplierNotes?: string;
  internalBuyerNotes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export interface QuoteInput {
  lines: QuoteLine[];
  commercialTerms?: string;
  paymentTerms?: string;
  validityDays?: number;
  freightTotal?: number;
  freightCurrency?: string;
  freightIncluded?: boolean;
  supplierNotes?: string;
}

export interface QuotePublicDTO {
  id: string;
  status: QuoteStatus;
  lines: QuoteLine[];
  commercialTerms?: string;
  paymentTerms?: string;
  validityDays?: number;
  freightTotal?: number;
  freightCurrency?: string;
  freightIncluded?: boolean;
  supplierNotes?: string;
  submittedAt?: string;
}
