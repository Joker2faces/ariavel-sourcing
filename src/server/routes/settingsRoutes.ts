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
    } catch {
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
