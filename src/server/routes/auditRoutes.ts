import { Router, type Request, type Response } from 'express';
import type { AuditService } from '../services/auditService.js';
import { tenantIdFromAuth } from '../middleware/buyerAuth.js';
import type { AuditQueryFilters } from '../db/auditRepository.js';
import type { AuditAction } from '../types/audit.js';
import type { AuditEvent } from '../types/audit.js';

function parseFilters(req: Request): AuditQueryFilters {
  const { eventId, action, entityType, limit, before } = req.query as Record<string, string | undefined>;
  const filters: AuditQueryFilters = {};
  if (eventId) filters.eventId = eventId;
  if (action) filters.action = action as AuditAction;
  if (entityType) filters.entityType = entityType as AuditEvent['entityType'];
  if (before) filters.before = before;
  if (limit) {
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) filters.limit = n;
  }
  return filters;
}

export function createAuditRouter(auditService: AuditService): Router {
  const router = Router();

  router.get('/audit', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const events = await auditService.listEvents(tenantId, parseFilters(req));
      res.json({ events });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/audit/export.csv', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const csv = await auditService.exportCsv(tenantId, parseFilters(req));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
