import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createBuyerAuthMiddleware } from './middleware/buyerAuth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { noSqlInjectionMiddleware } from './middleware/noSqlInjection.js';
import { createBuyerRouter } from './routes/buyerRoutes.js';
import { createPortalRouter } from './routes/portalRoutes.js';
import { createBuyerDocumentRouter } from './routes/documentRoutes.js';
const PORTAL_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const BUYER_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
export function createApp(invitationService, quoteService, clientSecret, bidComparisonService, awardService, documentService, healthDeps) {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https://*.monday.com'],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    }));
    app.use(cors({ origin: false }));
    app.use(express.json({ limit: '256kb' }));
    app.use(noSqlInjectionMiddleware);
    app.get('/health', async (_req, res) => {
        const checks = { api: true };
        if (healthDeps?.checkDb) {
            try {
                checks['db'] = await healthDeps.checkDb();
            }
            catch {
                checks['db'] = false;
            }
        }
        if (healthDeps?.checkStorage) {
            try {
                checks['storage'] = await healthDeps.checkStorage();
            }
            catch {
                checks['storage'] = false;
            }
        }
        const allOk = Object.values(checks).every(Boolean);
        res.status(allOk ? 200 : 503).json({
            status: allOk ? 'ok' : 'degraded',
            service: 'ariavel-sourcing',
            checks,
        });
    });
    const buyerAuth = createBuyerAuthMiddleware(clientSecret);
    app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createBuyerRouter(invitationService, quoteService, bidComparisonService, awardService));
    if (documentService) {
        app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createBuyerDocumentRouter(documentService));
    }
    app.use('/api/portal', PORTAL_RATE_LIMIT, createPortalRouter(invitationService, quoteService));
    return app;
}
