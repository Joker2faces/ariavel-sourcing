import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface BuyerJwtPayload {
  accountId: number;
  userId: number;
  shortLivedToken: string;
  iat?: number;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      buyerAuth?: BuyerJwtPayload;
    }
  }
}

export function createBuyerAuthMiddleware(signingSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, signingSecret) as BuyerJwtPayload;
      req.buyerAuth = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

export function tenantIdFromAuth(req: Request): string {
  if (!req.buyerAuth) throw new Error('No buyer auth on request');
  return `monday-account-${req.buyerAuth.accountId}`;
}
