import { Router } from 'express';
import { AttachmentNotFoundError, AttachmentValidationError } from '../services/documentService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';
function param(req, key) {
    return req.params[key];
}
function docErrorResponse(res, err) {
    if (err instanceof AttachmentNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
    }
    if (err instanceof AttachmentValidationError) {
        res.status(400).json({ error: err.message });
        return;
    }
    res.status(500).json({ error: 'Internal server error' });
}
export function createBuyerDocumentRouter(documentService) {
    const router = Router();
    // Initiate upload (buyer — for event attachments)
    router.post('/events/:entityId/attachments', async (req, res) => {
        try {
            const tenantId = tenantIdFromAuth(req);
            const userId = userIdFromAuth(req);
            const { filename, mimeType, sizeBytes } = req.body;
            if (!filename || !mimeType || typeof sizeBytes !== 'number') {
                res.status(400).json({ error: 'filename, mimeType, and sizeBytes are required' });
                return;
            }
            const result = await documentService.initiateUpload(tenantId, { entityType: 'event', entityId: param(req, 'entityId'), filename, mimeType, sizeBytes }, userId, new Date().toISOString());
            res.status(201).json(result);
        }
        catch (err) {
            docErrorResponse(res, err);
        }
    });
    // Confirm upload complete
    router.post('/attachments/:id/confirm', async (req, res) => {
        try {
            const tenantId = tenantIdFromAuth(req);
            const attachment = await documentService.confirmUpload(tenantId, param(req, 'id'));
            res.json({ attachment });
        }
        catch (err) {
            docErrorResponse(res, err);
        }
    });
    // List attachments for an event
    router.get('/events/:entityId/attachments', async (req, res) => {
        try {
            const tenantId = tenantIdFromAuth(req);
            const attachments = await documentService.listAttachments(tenantId, 'event', param(req, 'entityId'));
            res.json({ attachments });
        }
        catch {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // Delete attachment
    router.delete('/attachments/:id', async (req, res) => {
        try {
            const tenantId = tenantIdFromAuth(req);
            const userId = userIdFromAuth(req);
            await documentService.deleteAttachment(tenantId, param(req, 'id'), userId, new Date().toISOString());
            res.status(204).send();
        }
        catch (err) {
            docErrorResponse(res, err);
        }
    });
    // Download quote template for a specific invitation
    router.get('/invitations/:invitationId/quote-template', async (req, res) => {
        try {
            const tenantId = tenantIdFromAuth(req);
            const { rfqReference, eventLines: eventLinesJson } = req.query;
            let eventLines = [];
            try {
                if (eventLinesJson)
                    eventLines = JSON.parse(eventLinesJson);
            }
            catch {
                res.status(400).json({ error: 'Invalid eventLines JSON' });
                return;
            }
            const template = documentService.generateQuoteTemplate(tenantId, param(req, 'invitationId'), eventLines, rfqReference ?? 'RFQ');
            res.setHeader('Content-Type', template.contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
            res.send(template.content);
        }
        catch (err) {
            docErrorResponse(res, err);
        }
    });
    return router;
}
// ── Portal document routes (supplier-facing) ──────────────────────────────────
export function createPortalDocumentRouter(documentService) {
    const router = Router();
    // Supplier downloads their RFQ quote template (uses invitation token from portal session)
    // The portalRoutes.ts middleware already validates the invitation token.
    // Here we only handle the template download; the tenantId is extracted from the invitation
    // which the middleware has already validated. We receive it via req.body.tenantId injection
    // from portalRoutes only — this is the only place tenantId comes from body (set by middleware,
    // not from user input).
    router.get('/invitations/:invitationId/quote-template', async (req, res) => {
        try {
            // tenantId set by the portal auth middleware (not from user body/query)
            const tenantId = req.portalTenantId;
            if (!tenantId) {
                res.status(401).json({ error: 'Not authenticated' });
                return;
            }
            const { rfqReference, eventLines: eventLinesJson } = req.query;
            let eventLines = [];
            try {
                if (eventLinesJson)
                    eventLines = JSON.parse(eventLinesJson);
            }
            catch {
                res.status(400).json({ error: 'Invalid eventLines JSON' });
                return;
            }
            const template = documentService.generateQuoteTemplate(tenantId, param(req, 'invitationId'), eventLines, rfqReference ?? 'RFQ');
            res.setHeader('Content-Type', template.contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
            res.send(template.content);
        }
        catch (err) {
            docErrorResponse(res, err);
        }
    });
    // Supplier parses uploaded CSV content and returns import result (dry run — never auto-submits)
    router.post('/invitations/:invitationId/quote-import', async (req, res) => {
        try {
            const { csvContent, validLineIds, rfqReference } = req.body;
            if (!csvContent || !Array.isArray(validLineIds)) {
                res.status(400).json({ error: 'csvContent and validLineIds are required' });
                return;
            }
            const result = documentService.parseQuoteImport(csvContent, validLineIds, rfqReference, param(req, 'invitationId'));
            res.json({ result });
        }
        catch {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    return router;
}
