import { Router, type Request, type Response } from 'express';
import type { InvitationService } from '../services/invitationService.js';
import type { QuoteService } from '../services/quoteService.js';
import { InvitationNotFoundError, InvitationInvalidStatusError } from '../services/invitationService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';

function param(req: Request, key: string): string {
  return req.params[key] as string;
}

export function createBuyerRouter(
  invitationService: InvitationService,
  quoteService: QuoteService,
): Router {
  const router = Router();

  router.get('/events/:eventId/invitations', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const invitations = await invitationService.listForEvent(tenantId, param(req, 'eventId'));
      res.json({ invitations });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/events/:eventId/invitations', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const eventId = param(req, 'eventId');
      // Explicitly pick only known InvitationInput fields — never trust tenantId/userId from body
      const {
        eventReference, eventTitleSnapshot, supplierId, supplierNameSnapshot,
        supplierEmailSnapshot, supplierCodeSnapshot, expiresAt,
      } = req.body as {
        eventReference: string; eventTitleSnapshot: string; supplierId: string;
        supplierNameSnapshot: string; supplierEmailSnapshot: string;
        supplierCodeSnapshot?: string; expiresAt?: string;
      };
      const { invitation, rawToken } = await invitationService.create(
        tenantId,
        { eventId, eventReference, eventTitleSnapshot, supplierId, supplierNameSnapshot, supplierEmailSnapshot, supplierCodeSnapshot, expiresAt },
        userId,
      );
      res.status(201).json({ invitation, portalToken: rawToken });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/invitations/:id/revoke', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const invitation = await invitationService.revoke(tenantId, param(req, 'id'), userId);
      res.json({ invitation });
    } catch (err) {
      if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: err.message }); return; }
      if (err instanceof InvitationInvalidStatusError) { res.status(409).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/invitations/:id/regenerate', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { invitation, rawToken } = await invitationService.regenerate(tenantId, param(req, 'id'), userId);
      res.json({ invitation, portalToken: rawToken });
    } catch (err) {
      if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: err.message }); return; }
      if (err instanceof InvitationInvalidStatusError) { res.status(409).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/events/:eventId/quotes', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const quotes = await quoteService.listForEvent(tenantId, param(req, 'eventId'));
      res.json({ quotes });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/quotes/:id', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const quote = await quoteService.getById(tenantId, param(req, 'id'));
      if (!quote) { res.status(404).json({ error: 'Quote not found' }); return; }
      res.json({ quote });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
