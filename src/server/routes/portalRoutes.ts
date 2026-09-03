import { Router, type Request, type Response } from 'express';
import type { InvitationService } from '../services/invitationService.js';
import type { QuoteService } from '../services/quoteService.js';
import { InvitationNotFoundError, InvitationInvalidStatusError } from '../services/invitationService.js';
import { QuoteAlreadySubmittedError } from '../services/quoteService.js';
import type { QuoteInput } from '../types/quote.js';
import type { InvitationPublicDTO } from '../types/invitation.js';

function param(req: Request, key: string): string {
  return req.params[key] as string;
}

function toPublicDTO(inv: Awaited<ReturnType<InvitationService['resolveByToken']>>): InvitationPublicDTO {
  return {
    id: inv.id,
    eventReference: inv.eventReference,
    eventTitle: inv.eventTitleSnapshot,
    supplierName: inv.supplierNameSnapshot,
    lines: inv.linesSnapshot ?? [],
    status: inv.status,
    expiresAt: inv.expiresAt,
    submittedAt: inv.submittedAt,
  };
}

export function createPortalRouter(
  invitationService: InvitationService,
  quoteService: QuoteService,
): Router {
  const router = Router();

  router.get('/invitations/:token', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.open(param(req, 'token'));
      res.json({ invitation: toPublicDTO(invitation) });
    } catch (err) {
      if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: 'Invitation not found' }); return; }
      if (err instanceof InvitationInvalidStatusError) { res.status(410).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/invitations/:token/quote', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      const quote = await quoteService.getForInvitation(invitation.tenantId, invitation.id);
      res.json({ quote: quote ? {
        id: quote.id,
        status: quote.status,
        lines: quote.lines,
        commercialTerms: quote.commercialTerms,
        paymentTerms: quote.paymentTerms,
        validityDays: quote.validityDays,
        supplierNotes: quote.supplierNotes,
        submittedAt: quote.submittedAt,
      } : null });
    } catch (err) {
      if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: 'Invitation not found' }); return; }
      if (err instanceof InvitationInvalidStatusError) { res.status(410).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/invitations/:token/quote', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      if (invitation.status === 'SUBMITTED') {
        res.status(409).json({ error: 'Quote already submitted' });
        return;
      }
      const input = req.body as QuoteInput;
      const quote = await quoteService.saveDraft(invitation, input);
      res.json({ quote: {
        id: quote.id,
        status: quote.status,
        lines: quote.lines,
        commercialTerms: quote.commercialTerms,
        paymentTerms: quote.paymentTerms,
        validityDays: quote.validityDays,
        supplierNotes: quote.supplierNotes,
      } });
    } catch (err) {
      if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: 'Invitation not found' }); return; }
      if (err instanceof InvitationInvalidStatusError) { res.status(410).json({ error: err.message }); return; }
      if (err instanceof QuoteAlreadySubmittedError) { res.status(409).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/invitations/:token/submit', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      if (invitation.status === 'SUBMITTED') {
        res.status(409).json({ error: 'Quote already submitted' });
        return;
      }
      const quote = await quoteService.submit(invitation);
      await invitationService.markSubmitted(invitation.tenantId, invitation.id, invitation.supplierId);
      res.json({ quote: {
        id: quote.id,
        status: quote.status,
        submittedAt: quote.submittedAt,
      } });
    } catch (err) {
      if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: 'Invitation not found' }); return; }
      if (err instanceof InvitationInvalidStatusError) { res.status(410).json({ error: err.message }); return; }
      if (err instanceof QuoteAlreadySubmittedError) { res.status(409).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
