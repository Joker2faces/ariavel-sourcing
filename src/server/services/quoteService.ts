import type { QuoteRepository } from '../db/quoteRepository.js';
import type { AuditRepository } from '../db/auditRepository.js';
import type { SupplierQuote, QuoteInput } from '../types/quote.js';
import type { SupplierInvitation } from '../types/invitation.js';

export class QuoteAlreadySubmittedError extends Error { constructor() { super('Quote has already been submitted'); } }
export class QuoteNotFoundError extends Error { constructor() { super('Quote not found'); } }

export interface QuoteService {
  saveDraft(invitation: SupplierInvitation, input: QuoteInput): Promise<SupplierQuote>;
  submit(invitation: SupplierInvitation): Promise<SupplierQuote>;
  getForInvitation(tenantId: string, invitationId: string): Promise<SupplierQuote | null>;
  listForEvent(tenantId: string, eventId: string): Promise<SupplierQuote[]>;
  getById(tenantId: string, id: string): Promise<SupplierQuote | null>;
}

export function createQuoteService(
  quoteRepo: QuoteRepository,
  auditRepo: AuditRepository,
): QuoteService {
  function now() { return new Date().toISOString(); }

  return {
    async saveDraft(invitation, input) {
      const existing = await quoteRepo.findByInvitation(invitation.tenantId, invitation.id);
      if (existing?.status === 'SUBMITTED') throw new QuoteAlreadySubmittedError();
      const n = now();
      const quote = await quoteRepo.upsertDraft(
        invitation.tenantId,
        invitation.id,
        invitation.eventId,
        invitation.supplierId,
        invitation.supplierNameSnapshot,
        input,
        n,
      );
      await auditRepo.log(invitation.tenantId, 'QUOTE_DRAFT_SAVED', quote.id, 'quote', 'supplier', invitation.supplierId, n, { invitationId: invitation.id });
      return quote;
    },

    async submit(invitation) {
      const n = now();
      const quote = await quoteRepo.submit(invitation.tenantId, invitation.id, n);
      if (!quote) throw new QuoteNotFoundError();
      await auditRepo.log(invitation.tenantId, 'QUOTE_SUBMITTED', quote.id, 'quote', 'supplier', invitation.supplierId, n, { invitationId: invitation.id });
      return quote;
    },

    async getForInvitation(tenantId, invitationId) {
      return quoteRepo.findByInvitation(tenantId, invitationId);
    },

    async listForEvent(tenantId, eventId) {
      return quoteRepo.listForEvent(tenantId, eventId);
    },

    async getById(tenantId, id) {
      return quoteRepo.findById(tenantId, id);
    },
  };
}
