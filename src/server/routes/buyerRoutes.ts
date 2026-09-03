import { Router, type Request, type Response } from 'express';
import type { InvitationService } from '../services/invitationService.js';
import type { QuoteService } from '../services/quoteService.js';
import type { BidComparisonService } from '../services/bidComparisonService.js';
import type { AwardService } from '../services/awardService.js';
import { AwardScenarioNotFoundError, AwardScenarioFinalizedError, AwardValidationError } from '../services/awardService.js';
import { InvitationNotFoundError, InvitationInvalidStatusError } from '../services/invitationService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';
import type { SourcingLine } from '../../shared/types/domain.js';

function param(req: Request, key: string): string {
  return req.params[key] as string;
}

export function createBuyerRouter(
  invitationService: InvitationService,
  quoteService: QuoteService,
  bidComparisonService?: BidComparisonService,
  awardService?: AwardService,
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

  // ── Bid Comparison (M6) ────────────────────────────────────────────────────

  router.post('/events/:eventId/comparisons', async (req: Request, res: Response) => {
    if (!bidComparisonService) { res.status(501).json({ error: 'Bid comparison not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const eventId = param(req, 'eventId');
      const { baseCurrency, freightAllocationPolicy, fxRates, evaluationCriteria, notes, eventLines } = req.body as {
        baseCurrency: string;
        freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE' | 'EQUAL_PER_LINE' | 'MANUAL';
        fxRates?: Record<string, number>;
        evaluationCriteria?: unknown;
        notes?: string;
        eventLines: SourcingLine[];
      };
      if (!baseCurrency || !freightAllocationPolicy || !Array.isArray(eventLines)) {
        res.status(400).json({ error: 'baseCurrency, freightAllocationPolicy and eventLines are required' });
        return;
      }
      const snapshot = await bidComparisonService.buildSnapshot(
        tenantId, eventId, eventLines,
        { baseCurrency, freightAllocationPolicy, fxRates, evaluationCriteria: evaluationCriteria as never, notes },
        userId,
        new Date().toISOString(),
      );
      res.status(201).json({ snapshot });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/events/:eventId/comparisons/latest', async (req: Request, res: Response) => {
    if (!bidComparisonService) { res.status(501).json({ error: 'Bid comparison not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const snapshot = await bidComparisonService.getLatestSnapshot(tenantId, param(req, 'eventId'));
      if (!snapshot) { res.status(404).json({ error: 'No comparison snapshot found' }); return; }
      res.json({ snapshot });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/events/:eventId/comparisons', async (req: Request, res: Response) => {
    if (!bidComparisonService) { res.status(501).json({ error: 'Bid comparison not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const snapshots = await bidComparisonService.listSnapshots(tenantId, param(req, 'eventId'));
      res.json({ snapshots });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/comparisons/:id', async (req: Request, res: Response) => {
    if (!bidComparisonService) { res.status(501).json({ error: 'Bid comparison not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const snapshot = await bidComparisonService.getSnapshot(tenantId, param(req, 'id'));
      if (!snapshot) { res.status(404).json({ error: 'Comparison snapshot not found' }); return; }
      res.json({ snapshot });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/comparisons/:id/scores/:supplierId', async (req: Request, res: Response) => {
    if (!bidComparisonService) { res.status(501).json({ error: 'Bid comparison not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { score, comment } = req.body as { score: number; comment?: string };
      if (typeof score !== 'number' || score < 0 || score > 100) {
        res.status(400).json({ error: 'score must be a number between 0 and 100' });
        return;
      }
      const snapshot = await bidComparisonService.setManualTechnicalScore(
        tenantId, param(req, 'id'), param(req, 'supplierId'),
        score, comment, userId, new Date().toISOString(),
      );
      if (!snapshot) { res.status(404).json({ error: 'Snapshot or supplier not found' }); return; }
      res.json({ snapshot });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Award Workspace (M7) ───────────────────────────────────────────────────

  function awardErrorResponse(res: Response, err: unknown): void {
    if (err instanceof AwardScenarioNotFoundError) { res.status(404).json({ error: err.message }); return; }
    if (err instanceof AwardScenarioFinalizedError) { res.status(409).json({ error: err.message }); return; }
    if (err instanceof AwardValidationError) { res.status(400).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }

  router.post('/events/:eventId/award-scenarios/recommended', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { name, comparisonSnapshotId, notes, eventLines } = req.body as {
        name: string; comparisonSnapshotId: string; notes?: string; eventLines: SourcingLine[];
      };
      if (!name || !comparisonSnapshotId || !Array.isArray(eventLines)) {
        res.status(400).json({ error: 'name, comparisonSnapshotId, and eventLines are required' }); return;
      }
      const scenario = await awardService.createRecommendedScenario(
        tenantId, param(req, 'eventId'), eventLines, { name, comparisonSnapshotId, notes },
        userId, new Date().toISOString(),
      );
      res.status(201).json({ scenario });
    } catch (err) { awardErrorResponse(res, err); }
  });

  router.post('/events/:eventId/award-scenarios', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { name, comparisonSnapshotId, notes, eventLines } = req.body as {
        name: string; comparisonSnapshotId: string; notes?: string; eventLines: SourcingLine[];
      };
      if (!name || !comparisonSnapshotId || !Array.isArray(eventLines)) {
        res.status(400).json({ error: 'name, comparisonSnapshotId, and eventLines are required' }); return;
      }
      const scenario = await awardService.createEmptyScenario(
        tenantId, param(req, 'eventId'), eventLines, { name, comparisonSnapshotId, notes },
        userId, new Date().toISOString(),
      );
      res.status(201).json({ scenario });
    } catch (err) { awardErrorResponse(res, err); }
  });

  router.get('/events/:eventId/award-scenarios', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const scenarios = await awardService.listScenarios(tenantId, param(req, 'eventId'));
      res.json({ scenarios });
    } catch { res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/events/:eventId/award-scenarios/finalized', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const scenario = await awardService.getFinalizedScenario(tenantId, param(req, 'eventId'));
      if (!scenario) { res.status(404).json({ error: 'No finalized award scenario for this event' }); return; }
      res.json({ scenario });
    } catch { res.status(500).json({ error: 'Internal server error' }); }
  });

  router.get('/award-scenarios/:id', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const scenario = await awardService.getScenario(tenantId, param(req, 'id'));
      if (!scenario) { res.status(404).json({ error: 'Award scenario not found' }); return; }
      res.json({ scenario });
    } catch { res.status(500).json({ error: 'Internal server error' }); }
  });

  router.patch('/award-scenarios/:id/lines/:lineId', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { supplierId, quantity, overrideReason } = req.body as { supplierId: string; quantity: number; overrideReason?: string };
      if (!supplierId || typeof quantity !== 'number') {
        res.status(400).json({ error: 'supplierId and quantity are required' }); return;
      }
      const scenario = await awardService.awardLine(
        tenantId, param(req, 'id'), param(req, 'lineId'), supplierId, quantity, overrideReason, userId, new Date().toISOString(),
      );
      res.json({ scenario });
    } catch (err) { awardErrorResponse(res, err); }
  });

  router.delete('/award-scenarios/:id/lines/:lineId', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const scenario = await awardService.clearLine(tenantId, param(req, 'id'), param(req, 'lineId'), userId, new Date().toISOString());
      res.json({ scenario });
    } catch (err) { awardErrorResponse(res, err); }
  });

  router.post('/award-scenarios/:id/finalize', async (req: Request, res: Response) => {
    if (!awardService) { res.status(501).json({ error: 'Award workspace not enabled' }); return; }
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const scenario = await awardService.finalizeScenario(tenantId, param(req, 'id'), userId, new Date().toISOString());
      res.json({ scenario });
    } catch (err) { awardErrorResponse(res, err); }
  });

  return router;
}
