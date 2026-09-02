export type SourcingEventStatus = 'active' | 'awaiting_quotes' | 'closing_soon' | 'completed';

export interface Tenant { mondayAccountId: string; }
export interface Supplier { id: string; tenantId: string; mondayItemId?: string; name: string; email: string; contactName: string; status: 'active' | 'inactive'; }
export interface SourcingEvent { id: string; tenantId: string; title: string; status: SourcingEventStatus; deadline: string; currency: string; createdAt: string; createdBy: string; supplierResponseCount: number; supplierCount: number; }
export interface SourcingLine { id: string; sourcingEventId: string; description: string; sku?: string; quantity: number; unit: string; }
export interface SupplierInvitation { id: string; sourcingEventId: string; supplierId: string; status: 'invited' | 'responded' | 'declined'; }
export interface CommercialTerms { freight?: number; paymentTerms?: string; incoterm?: string; leadTime?: string; validity?: string; }
export interface SupplierQuote { id: string; sourcingEventId: string; supplierId: string; status: 'draft' | 'submitted'; currency: string; submittedAt?: string; terms: CommercialTerms; }
export interface QuoteLine { supplierQuoteId: string; sourcingLineId: string; unitPrice: number; quantity: number; MOQ?: number; }
export interface Award { id: string; sourcingEventId: string; supplierId: string; awardedAt?: string; status: 'recommended' | 'approved'; }
