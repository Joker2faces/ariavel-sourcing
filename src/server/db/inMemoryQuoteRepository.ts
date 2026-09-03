import type { QuoteRepository } from './quoteRepository.js';
import type { SupplierQuote } from '../types/quote.js';
import { randomBytes } from 'crypto';

export function createInMemoryQuoteRepository(seed: SupplierQuote[] = []): QuoteRepository {
  const store = new Map<string, SupplierQuote>(seed.map(q => [q.id, { ...q }]));

  function genId() { return randomBytes(12).toString('hex'); }

  function byInvitation(tenantId: string, invitationId: string) {
    return [...store.values()].find(q => q.tenantId === tenantId && q.invitationId === invitationId) ?? null;
  }

  return {
    async upsertDraft(tenantId, invitationId, eventId, supplierId, supplierNameSnapshot, input, now) {
      const existing = byInvitation(tenantId, invitationId);
      if (existing && existing.status === 'DRAFT') {
        const updated: SupplierQuote = { ...existing, ...input, version: existing.version + 1, updatedAt: now };
        store.set(existing.id, updated);
        return { ...updated };
      }
      const doc: SupplierQuote = { id: genId(), tenantId, invitationId, eventId, supplierId, supplierNameSnapshot, status: 'DRAFT', lines: input.lines, commercialTerms: input.commercialTerms, paymentTerms: input.paymentTerms, validityDays: input.validityDays, supplierNotes: input.supplierNotes, version: 1, createdAt: now, updatedAt: now };
      store.set(doc.id, doc);
      return { ...doc };
    },
    async submit(tenantId, invitationId, now) {
      const existing = byInvitation(tenantId, invitationId);
      if (!existing || existing.status !== 'DRAFT') return null;
      const updated: SupplierQuote = { ...existing, status: 'SUBMITTED', submittedAt: now, updatedAt: now, version: existing.version + 1 };
      store.set(existing.id, updated);
      return { ...updated };
    },
    async findByInvitation(tenantId, invitationId) {
      const doc = byInvitation(tenantId, invitationId);
      return doc ? { ...doc } : null;
    },
    async listForEvent(tenantId, eventId) {
      return [...store.values()].filter(q => q.tenantId === tenantId && q.eventId === eventId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async findById(tenantId, id) {
      const doc = store.get(id);
      return doc?.tenantId === tenantId ? { ...doc } : null;
    },
  };
}
