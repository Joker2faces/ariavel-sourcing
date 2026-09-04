import { type Request, type Response, type NextFunction } from 'express';
import { verifyBuyerSessionToken, MondaySessionAuthError, type MondayViewSession } from '../auth/mondaySessionAuth.js';
import type { MondayRoleProvider } from '../auth/mondayRoleProvider.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      buyerAuth?: MondayViewSession;
    }
  }
}

export function createBuyerAuthMiddleware(clientSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // MONDAY_CLIENT_SECRET not yet configured (first-release bootstrap).
    // Refuse all buyer requests with 503 — authentication is NOT bypassed.
    if (!clientSecret) {
      res.status(503).json({ error: 'Service not configured — MONDAY_CLIENT_SECRET is missing' });
      return;
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    const token = authHeader.slice(7);
    try {
      req.buyerAuth = verifyBuyerSessionToken(token, clientSecret);
      next();
    } catch (err) {
      if (err instanceof MondaySessionAuthError) {
        res.status(401).json({ error: err.message });
      } else {
        res.status(401).json({ error: 'Authentication failed' });
      }
    }
  };
}

export function tenantIdFromAuth(req: Request): string {
  if (!req.buyerAuth) throw new Error('No buyer auth on request');
  return `monday-account-${req.buyerAuth.accountId}`;
}

export function userIdFromAuth(req: Request): string {
  if (!req.buyerAuth) throw new Error('No buyer auth on request');
  return String(req.buyerAuth.userId);
}

/**
 * Server-side enforcement of monday's "editor" role for a mutation route.
 * Frontend button/UI gating (RuntimeCapabilities.canEditAriavelSuppliers,
 * derived from a client-supplied monday.get("context")) is not trustworthy
 * on its own — it is trivially bypassed by calling the API directly. This
 * middleware independently confirms the acting user's role against monday's
 * own API via the session's short-lived token before allowing a mutation
 * through. Apply it only to mutation routes (POST/PATCH/DELETE), never to
 * reads — a view-only or guest member can still see award data.
 */
export function requireAwardEditCapability(roleProvider: MondayRoleProvider) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.buyerAuth) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    const token = req.buyerAuth.shortLivedToken;
    if (!token) {
      res.status(403).json({ error: 'Session does not carry a verifiable token; cannot confirm award edit capability' });
      return;
    }
    try {
      const role = await roleProvider(token);
      if (role.isGuest || role.isViewOnly) {
        res.status(403).json({ error: 'Your monday role does not permit editing award scenarios' });
        return;
      }
      next();
    } catch {
      res.status(502).json({ error: 'Unable to verify monday role for this session' });
    }
  };
}
