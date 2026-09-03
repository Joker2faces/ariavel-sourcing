// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createQuoteService, QuoteAlreadySubmittedError, QuoteNotFoundError } from '../src/server/services/quoteService';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import type { SupplierInvitation } from '../src/server/types/invitation';

const TENANT = 'ariavel-development-tenant';

function makeService() {
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const service = createQuoteService(quoteRepo, auditRepo);
  return { service, quoteRepo, auditRepo };
}

const mockInvitation: SupplierInvitation = {
  id: 'inv-1',
  tenantId: TENANT,
  eventId: 'event-1',
  eventReference: 'RFQ-001',
  eventTitleSnapshot: 'Test RFQ',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'ACME Ltd',
  supplierEmailSnapshot: 'acme@example.com',
  tokenHash: 'abc123',
  status: 'OPENED',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  createdByUserId: 'user-1',
};

const lineInput = {
  lines: [{ lineId: 'line-1', lineDescription: 'Widget A', unitPrice: 10.5, currency: 'USD', leadTimeDays: 14 }],
  commercialTerms: 'Net 30',
  paymentTerms: 'Wire transfer',
  validityDays: 30,
  supplierNotes: 'Can deliver early',
};

describe('QuoteService', () => {
  describe('saveDraft', () => {
    it('creates a new draft quote', async () => {
      const { service } = makeService();
      const quote = await service.saveDraft(mockInvitation, lineInput);
      expect(quote.status).toBe('DRAFT');
      expect(quote.lines).toHaveLength(1);
      expect(quote.version).toBe(1);
    });

    it('updates existing draft and increments version', async () => {
      const { service } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      const updated = await service.saveDraft(mockInvitation, { ...lineInput, supplierNotes: 'Updated' });
      expect(updated.status).toBe('DRAFT');
      expect(updated.version).toBe(2);
      expect(updated.supplierNotes).toBe('Updated');
    });

    it('throws QuoteAlreadySubmittedError if already submitted', async () => {
      const { service } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      await service.submit(mockInvitation);
      await expect(service.saveDraft(mockInvitation, lineInput)).rejects.toBeInstanceOf(QuoteAlreadySubmittedError);
    });

    it('logs audit event on save', async () => {
      const { service, auditRepo } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      const events = auditRepo.getAll();
      expect(events[0].action).toBe('QUOTE_DRAFT_SAVED');
    });
  });

  describe('submit', () => {
    it('transitions DRAFT → SUBMITTED', async () => {
      const { service } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      const submitted = await service.submit(mockInvitation);
      expect(submitted.status).toBe('SUBMITTED');
      expect(submitted.submittedAt).toBeTruthy();
    });

    it('throws QuoteNotFoundError if no draft exists', async () => {
      const { service } = makeService();
      await expect(service.submit(mockInvitation)).rejects.toBeInstanceOf(QuoteNotFoundError);
    });

    it('logs audit event on submit', async () => {
      const { service, auditRepo } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      await service.submit(mockInvitation);
      const events = auditRepo.getAll();
      expect(events.some(e => e.action === 'QUOTE_SUBMITTED')).toBe(true);
    });
  });

  describe('getForInvitation', () => {
    it('returns null if no quote exists', async () => {
      const { service } = makeService();
      const quote = await service.getForInvitation(TENANT, 'inv-1');
      expect(quote).toBeNull();
    });

    it('returns quote after draft saved', async () => {
      const { service } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      const quote = await service.getForInvitation(TENANT, 'inv-1');
      expect(quote).not.toBeNull();
      expect(quote!.status).toBe('DRAFT');
    });
  });

  describe('listForEvent', () => {
    it('returns quotes for the event', async () => {
      const { service } = makeService();
      await service.saveDraft(mockInvitation, lineInput);
      const list = await service.listForEvent(TENANT, 'event-1');
      expect(list).toHaveLength(1);
    });
  });
});
