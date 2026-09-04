import { Router, type Request, type Response } from 'express';
import type { TenantSettingsService } from '../services/tenantSettingsService.js';
import { SettingsConflictError } from '../services/tenantSettingsService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';
import type { TenantSettingsInput } from '../../shared/types/tenantSettings.js';
import { stageLog, safeError } from '../observability/stageLog.js';

export function createSettingsRouter(settingsService: TenantSettingsService): Router {
  const router = Router();

  router.get('/settings', async (req: Request, res: Response) => {
    const requestId = req.requestId;
    const startedAt = Date.now();
    stageLog('log', 'SETTINGS_ROUTE_START', { requestId, route: 'GET /api/buyer/settings' });
    try {
      const tenantId = tenantIdFromAuth(req);
      stageLog('log', 'SETTINGS_AUTH_COMPLETE', { requestId, tenantId });
      const settings = await settingsService.getSettings(tenantId);
      stageLog('log', 'SETTINGS_ROUTE_COMPLETE', { requestId, tenantId, status: 200, durationMs: Date.now() - startedAt });
      res.json({ settings });
    } catch (err) {
      // Never expose the raw exception to the browser — the client sees only
      // a generic 500 — but a diagnostic-only server log line (no
      // Authorization header, session token, JWT, connection string, or
      // other secret) is the only way to find a real Document DB defect
      // without guessing. See the UAT report: /health passing only proves
      // db.command({ ping: 1 }) succeeds, not that this collection's
      // findOne() does.
      stageLog('error', 'SETTINGS_ROUTE_ERROR', {
        requestId,
        route: 'GET /api/buyer/settings',
        tenantId: req.buyerAuth ? tenantIdFromAuth(req) : undefined,
        durationMs: Date.now() - startedAt,
        ...safeError(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/settings', async (req: Request, res: Response) => {
    const requestId = req.requestId;
    const startedAt = Date.now();
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
      stageLog('error', 'SETTINGS_ROUTE_ERROR', {
        requestId,
        route: 'PUT /api/buyer/settings',
        tenantId: req.buyerAuth ? tenantIdFromAuth(req) : undefined,
        durationMs: Date.now() - startedAt,
        ...safeError(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
