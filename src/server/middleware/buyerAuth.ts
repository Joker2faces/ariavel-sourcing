import { type Request, type Response, type NextFunction } from 'express';
import { verifyBuyerSessionToken, MondaySessionAuthError, type MondayViewSession } from '../auth/mondaySessionAuth.js';

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
