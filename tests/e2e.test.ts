// @vitest-environment node
/**
 * E2E scenario: Create RFQ → Invite supplier → Open portal → Save draft → Submit → Verify
 * Uses in-memory repositories only; no real DB or network.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';

const SIGNING_SECRET = 'e2e-test-signing-secret-minimum-32-chars!!';
const ACCOUNT_ID = 5555;
const USER_ID = 1;

function makeBuyerToken() {
  return jwt.sign({ accountId: ACCOUNT_ID, userId: USER_ID, shortLivedToken: 'slt' }, SIGNING_SECRET, { expiresIn: '1h' });
}

describe('E2E: Full RFQ invitation and quote submission flow', () => {
  it('completes the full buyer → supplier → buyer verification cycle', async () => {
    // --- SETUP ---
    const invRepo = createInMemoryInvitationRepository();
    const quoteRepo = createInMemoryQuoteRepository();
    const auditRepo = createInMemoryAuditRepository();
    const invService = createInvitationService(invRepo, auditRepo);
    const quoteService = createQuoteService(quoteRepo, auditRepo);
    const app = createApp(invService, quoteService, SIGNING_SECRET);
    const buyerToken = makeBuyerToken();

    // Step 1: Health check
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    // Step 2: Buyer lists invitations for new RFQ (empty)
    const emptyList = await request(app)
      .get('/api/buyer/events/rfq-001/invitations')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(emptyList.status).toBe(200);
    expect(emptyList.body.invitations).toHaveLength(0);

    // Step 3: Buyer sends invitation to supplier
    const createRes = await request(app)
      .post('/api/buyer/events/rfq-001/invitations')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        eventReference: 'RFQ-2026-E2E',
        eventTitleSnapshot: 'E2E Test RFQ',
        supplierId: 'sup-acme',
        supplierNameSnapshot: 'ACME Supplies Ltd',
        supplierEmailSnapshot: 'quotes@acme.example.com',
        supplierCodeSnapshot: 'ACME-001',
      });
    expect(createRes.status).toBe(201);
    const { invitation: createdInv, portalToken } = createRes.body as { invitation: { id: string; status: string }; portalToken: string };
    expect(createdInv.status).toBe('CREATED');
    expect(portalToken).toHaveLength(64);

    // Step 4: Buyer verifies invitation appears in list
    const listRes = await request(app)
      .get('/api/buyer/events/rfq-001/invitations')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(listRes.body.invitations).toHaveLength(1);
    expect(listRes.body.invitations[0].status).toBe('CREATED');

    // Step 5: Supplier opens invitation via portal token (transitions CREATED → OPENED)
    const openRes = await request(app).get(`/api/portal/invitations/${portalToken}`);
    expect(openRes.status).toBe(200);
    expect(openRes.body.invitation.status).toBe('OPENED');
    expect(openRes.body.invitation.eventReference).toBe('RFQ-2026-E2E');
    // Security: portal DTO must not contain sensitive internal fields
    expect(openRes.body.invitation).not.toHaveProperty('tokenHash');
    expect(openRes.body.invitation).not.toHaveProperty('tenantId');
    expect(openRes.body.invitation).not.toHaveProperty('createdByUserId');

    // Step 6: Supplier checks their quote (null initially)
    const emptyQuote = await request(app).get(`/api/portal/invitations/${portalToken}/quote`);
    expect(emptyQuote.status).toBe(200);
    expect(emptyQuote.body.quote).toBeNull();

    // Step 7: Supplier saves a draft quote
    const draftRes = await request(app)
      .put(`/api/portal/invitations/${portalToken}/quote`)
      .send({
        lines: [
          { lineId: 'line-1', lineDescription: 'Widget Model A', unitPrice: 12.5, currency: 'USD', leadTimeDays: 14, moq: 100 },
          { lineId: 'line-2', lineDescription: 'Widget Model B', unitPrice: 18.0, currency: 'USD', leadTimeDays: 21 },
        ],
        commercialTerms: 'CIF Rotterdam',
        paymentTerms: 'Net 30',
        validityDays: 30,
        supplierNotes: 'Prices valid through Q4 2026',
      });
    expect(draftRes.status).toBe(200);
    expect(draftRes.body.quote.status).toBe('DRAFT');
    expect(draftRes.body.quote.lines).toHaveLength(2);

    // Step 8: Supplier re-reads their draft
    const reReadDraft = await request(app).get(`/api/portal/invitations/${portalToken}/quote`);
    expect(reReadDraft.status).toBe(200);
    expect(reReadDraft.body.quote.status).toBe('DRAFT');
    expect(reReadDraft.body.quote.paymentTerms).toBe('Net 30');

    // Step 9: Supplier submits final quote
    const submitRes = await request(app).post(`/api/portal/invitations/${portalToken}/submit`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.quote.status).toBe('SUBMITTED');
    expect(submitRes.body.quote.submittedAt).toBeTruthy();

    // Step 10: Buyer verifies quote appears in event's quote list
    const buyerQuotes = await request(app)
      .get('/api/buyer/events/rfq-001/quotes')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(buyerQuotes.status).toBe(200);
    expect(buyerQuotes.body.quotes).toHaveLength(1);
    expect(buyerQuotes.body.quotes[0].status).toBe('SUBMITTED');
    expect(buyerQuotes.body.quotes[0].lines).toHaveLength(2);
    expect(buyerQuotes.body.quotes[0].supplierNotes).toBe('Prices valid through Q4 2026');

    // Post-submit: supplier cannot re-submit
    const reSubmit = await request(app).post(`/api/portal/invitations/${portalToken}/submit`);
    expect(reSubmit.status).toBe(409);

    // Post-submit: audit trail has all expected events
    const auditEvents = auditRepo.getAll();
    const actions = auditEvents.map(e => e.action);
    expect(actions).toContain('INVITATION_CREATED');
    expect(actions).toContain('INVITATION_OPENED');
    expect(actions).toContain('QUOTE_DRAFT_SAVED');
    expect(actions).toContain('QUOTE_SUBMITTED');
  });
});
