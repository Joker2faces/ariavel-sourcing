import { Router, type Request, type Response } from 'express';
import type { DocumentService } from '../services/documentService.js';
import { AttachmentNotFoundError, AttachmentValidationError } from '../services/documentService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';
import type { InvitationService } from '../services/invitationService.js';
import { InvitationNotFoundError, InvitationInvalidStatusError } from '../services/invitationService.js';
import type { SourcingLine } from '../../shared/types/domain.js';

function sendAttachmentDownload(res: Response, attachment: { filename: string; mimeType: string }, content: Buffer): void {
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=0, no-store');
  res.send(content);
}

function param(req: Request, key: string): string {
  return req.params[key] as string;
}

function docErrorResponse(res: Response, err: unknown): void {
  if (err instanceof AttachmentNotFoundError) { res.status(404).json({ error: err.message }); return; }
  if (err instanceof AttachmentValidationError) { res.status(400).json({ error: err.message }); return; }
  res.status(500).json({ error: 'Internal server error' });
}

export function createBuyerDocumentRouter(documentService: DocumentService): Router {
  const router = Router();

  // Initiate upload (buyer — for event attachments)
  router.post('/events/:entityId/attachments', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { filename, mimeType, sizeBytes } = req.body as { filename: string; mimeType: string; sizeBytes: number };
      if (!filename || !mimeType || typeof sizeBytes !== 'number') {
        res.status(400).json({ error: 'filename, mimeType, and sizeBytes are required' }); return;
      }
      const result = await documentService.initiateUpload(
        tenantId, { entityType: 'event', entityId: param(req, 'entityId'), filename, mimeType, sizeBytes },
        userId, new Date().toISOString(),
      );
      res.status(201).json(result);
    } catch (err) { docErrorResponse(res, err); }
  });

  // Confirm upload complete
  router.post('/attachments/:id/confirm', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const attachment = await documentService.confirmUpload(tenantId, param(req, 'id'));
      res.json({ attachment });
    } catch (err) { docErrorResponse(res, err); }
  });

  // List attachments for an event
  router.get('/events/:entityId/attachments', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const attachments = await documentService.listAttachments(tenantId, 'event', param(req, 'entityId'));
      res.json({ attachments });
    } catch { res.status(500).json({ error: 'Internal server error' }); }
  });

  // Delete attachment
  router.delete('/attachments/:id', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      await documentService.deleteAttachment(tenantId, param(req, 'id'), userId, new Date().toISOString());
      res.status(204).send();
    } catch (err) { docErrorResponse(res, err); }
  });

  // Download an attachment's file content
  router.get('/attachments/:id/download', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const { attachment, content } = await documentService.downloadAttachment(tenantId, param(req, 'id'));
      sendAttachmentDownload(res, attachment, content);
    } catch (err) { docErrorResponse(res, err); }
  });

  // Download quote template for a specific invitation
  router.get('/invitations/:invitationId/quote-template', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const { rfqReference, eventLines: eventLinesJson } = req.query as { rfqReference?: string; eventLines?: string };
      let eventLines: SourcingLine[] = [];
      try {
        if (eventLinesJson) eventLines = JSON.parse(eventLinesJson) as SourcingLine[];
      } catch { res.status(400).json({ error: 'Invalid eventLines JSON' }); return; }

      const template = documentService.generateQuoteTemplate(tenantId, param(req, 'invitationId'), eventLines, rfqReference ?? 'RFQ');
      res.setHeader('Content-Type', template.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
      res.send(template.content);
    } catch (err) { docErrorResponse(res, err); }
  });

  return router;
}

// ── Portal document routes (supplier-facing) ──────────────────────────────────
//
// Every route here resolves tenant/invitation identity from the raw portal
// TOKEN in the URL via invitationService.resolveByToken — the same pattern
// portalRoutes.ts uses for quote read/write. There is no middleware that
// injects tenantId; a supplier proves identity only by possessing the token.

function portalDocErrorResponse(res: Response, err: unknown): void {
  if (err instanceof InvitationNotFoundError) { res.status(404).json({ error: 'Invitation not found' }); return; }
  if (err instanceof InvitationInvalidStatusError) { res.status(410).json({ error: err.message }); return; }
  docErrorResponse(res, err);
}

export function createPortalDocumentRouter(
  documentService: DocumentService,
  invitationService: InvitationService,
): Router {
  const router = Router();

  // RFQ attachments the buyer uploaded for this event — supplier may view/download only these.
  router.get('/invitations/:token/attachments', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      const attachments = await documentService.listAttachments(invitation.tenantId, 'event', invitation.eventId);
      res.json({ attachments });
    } catch (err) { portalDocErrorResponse(res, err); }
  });

  router.get('/invitations/:token/attachments/:id/download', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      const { attachment, content } = await documentService.downloadAttachment(invitation.tenantId, param(req, 'id'));
      // Supplier may only download RFQ attachments for their own event, or their own quote attachments.
      const isOwnEventAttachment = attachment.entityType === 'event' && attachment.entityId === invitation.eventId;
      const isOwnQuoteAttachment = attachment.entityType === 'quote' && attachment.entityId === invitation.id;
      if (!isOwnEventAttachment && !isOwnQuoteAttachment) { res.status(404).json({ error: 'Attachment not found' }); return; }
      sendAttachmentDownload(res, attachment, content);
    } catch (err) { portalDocErrorResponse(res, err); }
  });

  // Supplier uploads a supporting document alongside their quote.
  router.post('/invitations/:token/quote-attachments', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      if (invitation.status === 'SUBMITTED') { res.status(409).json({ error: 'Quote already submitted' }); return; }
      const { filename, mimeType, sizeBytes } = req.body as { filename: string; mimeType: string; sizeBytes: number };
      if (!filename || !mimeType || typeof sizeBytes !== 'number') {
        res.status(400).json({ error: 'filename, mimeType, and sizeBytes are required' }); return;
      }
      const result = await documentService.initiateUpload(
        invitation.tenantId, { entityType: 'quote', entityId: invitation.id, filename, mimeType, sizeBytes },
        invitation.supplierId, new Date().toISOString(),
      );
      res.status(201).json(result);
    } catch (err) { portalDocErrorResponse(res, err); }
  });

  router.post('/invitations/:token/quote-attachments/:id/confirm', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      const attachment = await documentService.confirmUpload(invitation.tenantId, param(req, 'id'));
      if (attachment.entityType !== 'quote' || attachment.entityId !== invitation.id) {
        res.status(404).json({ error: 'Attachment not found' }); return;
      }
      res.json({ attachment });
    } catch (err) { portalDocErrorResponse(res, err); }
  });

  // Supplier downloads their RFQ quote template.
  router.get('/invitations/:token/quote-template', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      const { rfqReference, eventLines: eventLinesJson } = req.query as { rfqReference?: string; eventLines?: string };
      let eventLines: SourcingLine[] = [];
      try {
        if (eventLinesJson) eventLines = JSON.parse(eventLinesJson) as SourcingLine[];
      } catch { res.status(400).json({ error: 'Invalid eventLines JSON' }); return; }

      const template = documentService.generateQuoteTemplate(invitation.tenantId, invitation.id, eventLines, rfqReference ?? invitation.eventReference);
      res.setHeader('Content-Type', template.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
      res.send(template.content);
    } catch (err) { portalDocErrorResponse(res, err); }
  });

  // Supplier parses uploaded CSV content and returns import result (dry run — never auto-submits)
  router.post('/invitations/:token/quote-import', async (req: Request, res: Response) => {
    try {
      const invitation = await invitationService.resolveByToken(param(req, 'token'));
      if (invitation.status === 'SUBMITTED') { res.status(409).json({ error: 'Quote already submitted' }); return; }
      const { csvContent, validLineIds, rfqReference } = req.body as {
        csvContent: string;
        validLineIds: string[];
        rfqReference?: string;
      };
      if (!csvContent || !Array.isArray(validLineIds)) {
        res.status(400).json({ error: 'csvContent and validLineIds are required' }); return;
      }
      const result = documentService.parseQuoteImport(csvContent, validLineIds, rfqReference, invitation.id);
      res.json({ result });
    } catch (err) { portalDocErrorResponse(res, err); }
  });

  return router;
}
