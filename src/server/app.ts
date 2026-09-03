import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import type { InvitationService } from './services/invitationService.js';
import type { QuoteService } from './services/quoteService.js';
import type { BidComparisonService } from './services/bidComparisonService.js';
import type { AwardService } from './services/awardService.js';
import type { DocumentService } from './services/documentService.js';
import type { TenantSettingsService } from './services/tenantSettingsService.js';
import type { AuditService } from './services/auditService.js';
import type { TenantDataService } from './services/tenantDataService.js';
import { createBuyerAuthMiddleware } from './middleware/buyerAuth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { noSqlInjectionMiddleware } from './middleware/noSqlInjection.js';
import { createBuyerRouter } from './routes/buyerRoutes.js';
import { createPortalRouter } from './routes/portalRoutes.js';
import { createBuyerDocumentRouter, createPortalDocumentRouter } from './routes/documentRoutes.js';
import { createSettingsRouter } from './routes/settingsRoutes.js';
import { createAuditRouter } from './routes/auditRoutes.js';
import { createDataRouter } from './routes/dataRoutes.js';
import { createLifecycleRouter } from './routes/lifecycleRoutes.js';
import { createDevStorageRouter } from './routes/devStorageRoutes.js';
import type { InMemoryObjectStorageProvider } from './storage/objectStorageProvider.js';
import type { AttachmentRepository } from './db/attachmentRepository.js';

const PORTAL_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const BUYER_RATE_LIMIT = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });

export interface HealthDependencies {
  checkDb?: () => Promise<boolean>;
  checkStorage?: () => Promise<boolean>;
}

export function createApp(
  invitationService: InvitationService,
  quoteService: QuoteService,
  clientSecret: string,
  bidComparisonService?: BidComparisonService,
  awardService?: AwardService,
  documentService?: DocumentService,
  healthDeps?: HealthDependencies,
  devStorage?: { provider: InMemoryObjectStorageProvider; attachmentRepo: AttachmentRepository },
  settingsService?: TenantSettingsService,
  auditService?: AuditService,
  dataService?: TenantDataService,
) {
  const app = express();

  // monday Code runs the app behind its own reverse proxy, which sets
  // X-Forwarded-For. Without trust proxy, express-rate-limit logs a
  // ValidationError on every single request (seen in production console
  // logs) and — more importantly — can't correctly derive the real client
  // IP for rate-limit bucketing. `1` trusts exactly one hop (the proxy),
  // not an arbitrary client-supplied chain.
  app.set('trust proxy', 1);

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
        // A monday app is rendered by monday.com inside an iframe — it must allow
        // itself to be framed by monday, or the app never renders in production.
        frameAncestors: ["https://*.monday.com"],
      },
    },
    // frameAncestors above supersedes X-Frame-Options in modern browsers; helmet's
    // separate frameguard middleware defaults to X-Frame-Options: SAMEORIGIN, which
    // would otherwise block monday.com (a different origin) from framing this app.
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  }));

  // The frontend is served from this same origin (see static serving below), so
  // cross-origin requests are never legitimate for this app's own API.
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use(noSqlInjectionMiddleware);

  app.get('/health', async (_req, res) => {
    const checks: Record<string, boolean> = { api: true };

    if (healthDeps?.checkDb) {
      try { checks['db'] = await healthDeps.checkDb(); } catch { checks['db'] = false; }
    }
    if (healthDeps?.checkStorage) {
      try { checks['storage'] = await healthDeps.checkStorage(); } catch { checks['storage'] = false; }
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
    app.use('/api/portal', PORTAL_RATE_LIMIT, createPortalDocumentRouter(documentService, invitationService));
  }
  app.use('/api/portal', PORTAL_RATE_LIMIT, createPortalRouter(invitationService, quoteService));
  if (settingsService) {
    app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createSettingsRouter(settingsService));
  }
  if (auditService) {
    app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createAuditRouter(auditService));
  }
  if (dataService) {
    app.use('/api/buyer', BUYER_RATE_LIMIT, buyerAuth, createDataRouter(dataService));
  }
  app.use('/api', createLifecycleRouter(clientSecret, dataService));

  if (devStorage) {
    app.use('/api/dev-storage', createDevStorageRouter(devStorage.provider, devStorage.attachmentRepo));
  }

  // Serve the built frontend (npm run build -> ./dist) from the same origin as the
  // API. This is deliberate: monday Code apps with a backend should be same-origin
  // with their frontend so the app can call its own API without CORS, and so the
  // browser sends the same-origin CSP frame-ancestors check monday relies on.
  // dist/ may not exist yet (fresh clone before a build, or unit tests) — serving is
  // skipped gracefully rather than failing startup.
  const distDir = path.resolve(process.cwd(), 'dist');
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/|\/health$).*/, (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }

  return app;
}
