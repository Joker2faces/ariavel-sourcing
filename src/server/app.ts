import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { InvitationService } from './services/invitationService.js';
import type { QuoteService } from './services/quoteService.js';
import { createBuyerAuthMiddleware } from './middleware/buyerAuth.js';
import { createBuyerRouter } from './routes/buyerRoutes.js';
import { createPortalRouter } from './routes/portalRoutes.js';

const PORTAL_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const BUYER_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });

export function createApp(
  invitationService: InvitationService,
  quoteService: QuoteService,
  signingSecret: string,
) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

  const buyerAuth = createBuyerAuthMiddleware(signingSecret);

  app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createBuyerRouter(invitationService, quoteService));
  app.use('/api/portal', PORTAL_RATE_LIMIT, createPortalRouter(invitationService, quoteService));

  return app;
}
