import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { InvitationService } from './services/invitationService.js';
import type { QuoteService } from './services/quoteService.js';
import type { BidComparisonService } from './services/bidComparisonService.js';
import type { AwardService } from './services/awardService.js';
import type { DocumentService } from './services/documentService.js';
import { createBuyerAuthMiddleware } from './middleware/buyerAuth.js';
import { createBuyerRouter } from './routes/buyerRoutes.js';
import { createPortalRouter } from './routes/portalRoutes.js';
import { createBuyerDocumentRouter } from './routes/documentRoutes.js';

const PORTAL_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const BUYER_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });

export function createApp(
  invitationService: InvitationService,
  quoteService: QuoteService,
  clientSecret: string,
  bidComparisonService?: BidComparisonService,
  awardService?: AwardService,
  documentService?: DocumentService,
) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ariavel-sourcing' });
  });

  const buyerAuth = createBuyerAuthMiddleware(clientSecret);

  app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createBuyerRouter(invitationService, quoteService, bidComparisonService, awardService));
  if (documentService) {
    app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createBuyerDocumentRouter(documentService));
  }
  app.use('/api/portal', PORTAL_RATE_LIMIT, createPortalRouter(invitationService, quoteService));

  return app;
}
