import { Router, type Request, type Response } from 'express';
import { verifyAppLifecycleToken, MondaySessionAuthError } from '../auth/mondaySessionAuth.js';
import type { TenantDataService } from '../services/tenantDataService.js';

/**
 * monday App Events (install / uninstall / subscription changes). Not
 * mounted under /api/buyer or /api/portal — this is monday-to-server, not
 * buyer- or supplier-facing, and is verified independently (JWT + Client
 * Secret) rather than via the buyer session-token middleware.
 *
 * NOT registered as a webhook URL in Developer Center by this code — that
 * remains a manual owner action (report the resulting endpoint URL after
 * deploying, per the completion program's instructions not to configure
 * Developer Center webhooks automatically).
 */
export function createLifecycleRouter(clientSecret: string, dataService?: TenantDataService): Router {
  const router = Router();

  router.post('/lifecycle/events', async (req: Request, res: Response) => {
    if (!clientSecret) { res.status(503).json({ error: 'Service not configured' }); return; }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    let event: { accountId: number };
    try {
      event = verifyAppLifecycleToken(authHeader.slice(7), clientSecret);
    } catch (err) {
      if (err instanceof MondaySessionAuthError) { res.status(401).json({ error: err.message }); return; }
      res.status(401).json({ error: 'Authentication failed' });
      return;
    }

    const { type } = req.body as { type?: string };

    if (type === 'uninstall') {
      const tenantId = `monday-account-${event.accountId}`;
      if (dataService) {
        try {
          await dataService.deleteTenantData(tenantId, 'monday-lifecycle', new Date().toISOString());
        } catch {
          // Acknowledge the webhook regardless — monday does not need to see
          // deletion failures as a delivery failure, and retrying a delete
          // is safe (idempotent: deleteMany on an already-empty tenant is a no-op).
        }
      }
      // No real Document DB connected (dev/first-boot) — nothing durable
      // to delete; acknowledge anyway so monday doesn't retry indefinitely.
    }

    res.status(200).json({ ok: true });
  });

  return router;
}
