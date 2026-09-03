import { Router } from 'express';
import { InvitationNotFoundError, InvitationInvalidStatusError } from '../services/invitationService.js';
import { QuoteAlreadySubmittedError } from '../services/quoteService.js';
function param(req, key) {
    return req.params[key];
}
function toPublicDTO(inv) {
    return {
        id: inv.id,
        eventReference: inv.eventReference,
        eventTitle: inv.eventTitleSnapshot,
        supplierName: inv.supplierNameSnapshot,
        status: inv.status,
        expiresAt: inv.expiresAt,
        submittedAt: inv.submittedAt,
    };
}
export function createPortalRouter(invitationService, quoteService) {
    const router = Router();
    router.get('/invitations/:token', async (req, res) => {
        try {
            const invitation = await invitationService.open(param(req, 'token'));
            res.json({ invitation: toPublicDTO(invitation) });
        }
        catch (err) {
            if (err instanceof InvitationNotFoundError) {
                res.status(404).json({ error: 'Invitation not found' });
                return;
            }
            if (err instanceof InvitationInvalidStatusError) {
                res.status(410).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.get('/invitations/:token/quote', async (req, res) => {
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
        }
        catch (err) {
            if (err instanceof InvitationNotFoundError) {
                res.status(404).json({ error: 'Invitation not found' });
                return;
            }
            if (err instanceof InvitationInvalidStatusError) {
                res.status(410).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.put('/invitations/:token/quote', async (req, res) => {
        try {
            const invitation = await invitationService.resolveByToken(param(req, 'token'));
            if (invitation.status === 'SUBMITTED') {
                res.status(409).json({ error: 'Quote already submitted' });
                return;
            }
            const input = req.body;
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
        }
        catch (err) {
            if (err instanceof InvitationNotFoundError) {
                res.status(404).json({ error: 'Invitation not found' });
                return;
            }
            if (err instanceof InvitationInvalidStatusError) {
                res.status(410).json({ error: err.message });
                return;
            }
            if (err instanceof QuoteAlreadySubmittedError) {
                res.status(409).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.post('/invitations/:token/submit', async (req, res) => {
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
        }
        catch (err) {
            if (err instanceof InvitationNotFoundError) {
                res.status(404).json({ error: 'Invitation not found' });
                return;
            }
            if (err instanceof InvitationInvalidStatusError) {
                res.status(410).json({ error: err.message });
                return;
            }
            if (err instanceof QuoteAlreadySubmittedError) {
                res.status(409).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    return router;
}
