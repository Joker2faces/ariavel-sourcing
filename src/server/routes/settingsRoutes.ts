import { Router, type Request, type Response } from 'express';
import type { TenantSettingsService } from '../services/tenantSettingsService.js';
import { SettingsConflictError } from '../services/tenantSettingsService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';
import type { TenantSettingsInput } from '../../shared/types/tenantSettings.js';

export function createSettingsRouter(settingsService: TenantSettingsService): Router {
  const router = Router();

  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const settings = await settingsService.getSettings(tenantId);
      res.json({ settings });
    } catch (err) {
      // Never expose the raw exception to the browser — the client sees only
      // a generic 500 — but a diagnostic-only server log line (no
      // Authorization header, session token, JWT, connection string, or
      // other secret) is the only way to find a real Document DB defect
      // without guessing. See the UAT report: /health passing only proves
      // db.command({ ping: 1 }) succeeds, not that this collection's
      // findOne() does.
      console.error(JSON.stringify({
        level: 'error',
        msg: 'Failed to load tenant settings',
        requestId: req.requestId,
        route: 'GET /api/buyer/settings',
        tenantId: req.buyerAuth ? tenantIdFromAuth(req) : undefined,
        errorName: err instanceof Error ? err.name : typeof err,
        error: err instanceof Error ? err.message : String(err),
      }));
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/settings', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { expectedVersion, ...input } = req.body as TenantSettingsInput & { expectedVersion: number };
      if (typeof expectedVersion !== 'number') {
        res.status(400).json({ error: 'expectedVersion is required' });
        return;
      }
      const settings = await settingsService.updateSettings(tenantId, input, expectedVersion, userId, new Date().toISOString());
      res.json({ settings });
    } catch (err) {
      if (err instanceof SettingsConflictError) { res.status(409).json({ error: err.message }); return; }
      console.error(JSON.stringify({
        level: 'error',
        msg: 'Failed to update tenant settings',
        requestId: req.requestId,
        route: 'PUT /api/buyer/settings',
        tenantId: req.buyerAuth ? tenantIdFromAuth(req) : undefined,
        errorName: err instanceof Error ? err.name : typeof err,
        error: err instanceof Error ? err.message : String(err),
      }));
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
