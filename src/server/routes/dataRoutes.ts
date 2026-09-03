import { Router, type Request, type Response } from 'express';
import type { TenantDataService } from '../services/tenantDataService.js';
import { tenantIdFromAuth, userIdFromAuth } from '../middleware/buyerAuth.js';

export function createDataRouter(dataService: TenantDataService): Router {
  const router = Router();

  router.get('/data/export', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const bundle = await dataService.exportTenantData(tenantId, userId, new Date().toISOString());
      res.setHeader('Content-Disposition', `attachment; filename="ariavel-data-export-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json(bundle);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Destructive — requires an explicit confirmation phrase in the body to guard
  // against an accidental call (e.g. a misfired retry or a scripting error).
  router.post('/data/delete', async (req: Request, res: Response) => {
    try {
      const tenantId = tenantIdFromAuth(req);
      const userId = userIdFromAuth(req);
      const { confirm } = req.body as { confirm?: string };
      if (confirm !== 'DELETE MY TENANT DATA') {
        res.status(400).json({ error: 'confirm must be exactly "DELETE MY TENANT DATA"' });
        return;
      }
      const counts = await dataService.deleteTenantData(tenantId, userId, new Date().toISOString());
      res.json({ deleted: counts });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
