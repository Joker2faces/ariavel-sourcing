import { getDb, closeDb } from './db/connection.js';
import { createInvitationRepository } from './db/invitationRepository.js';
import { createQuoteRepository } from './db/quoteRepository.js';
import { createAuditRepository } from './db/auditRepository.js';
import { createComparisonRepository } from './db/comparisonRepository.js';
import { createInvitationService } from './services/invitationService.js';
import { createQuoteService } from './services/quoteService.js';
import { createBidComparisonService } from './services/bidComparisonService.js';
import { createAwardRepository } from './db/awardRepository.js';
import { createAwardService } from './services/awardService.js';
import { createAttachmentRepository } from './db/attachmentRepository.js';
import { createDocumentService } from './services/documentService.js';
import { createTenantSettingsRepository } from './db/tenantSettingsRepository.js';
import { createTenantSettingsService } from './services/tenantSettingsService.js';
import { createAuditService } from './services/auditService.js';
import { createInMemoryTenantSettingsRepository } from './db/inMemoryTenantSettingsRepository.js';
import { createInMemoryInvitationRepository } from './db/inMemoryInvitationRepository.js';
import { createInMemoryQuoteRepository } from './db/inMemoryQuoteRepository.js';
import { createInMemoryAuditRepository } from './db/inMemoryAuditRepository.js';
import { createInMemoryComparisonRepository } from './db/inMemoryComparisonRepository.js';
import { createInMemoryAwardRepository } from './db/inMemoryAwardRepository.js';
import { createInMemoryAttachmentRepository } from './db/inMemoryAttachmentRepository.js';
import { createMondayObjectStorageProvider, createInMemoryObjectStorageProvider, type ObjectStorageProvider, type InMemoryObjectStorageProvider } from './storage/objectStorageProvider.js';
import { createApp, type HealthDependencies } from './app.js';

const PORT = Number(process.env['PORT'] ?? 8080);

async function start() {
  // MONDAY_CLIENT_SECRET verifies monday.get("sessionToken") JWTs.
  // When absent (first-release bootstrap), buyer API returns 503 — auth is NOT bypassed.
  const clientSecret = process.env['MONDAY_CLIENT_SECRET'] ?? '';
  if (!clientSecret) {
    console.warn(JSON.stringify({
      level: 'warn',
      msg: 'MONDAY_CLIENT_SECRET not set — buyer API will return 503 until configured via Developer Center Secrets',
    }));
  }

  // MNDY_MONGODB_CONNECTION_STRING is auto-injected by monday Code after first deployment.
  // On first boot (before Document DB is provisioned), fall back to in-memory repositories.
  let dbConnected = false;
  let invRepo, quoteRepo, auditRepo, compRepo, awardRepo, attachmentRepo, settingsRepo;
  let healthDeps: HealthDependencies = {};

  const mongoUri = process.env['MNDY_MONGODB_CONNECTION_STRING'];
  if (mongoUri) {
    try {
      const db = await getDb();
      invRepo = createInvitationRepository(db);
      quoteRepo = createQuoteRepository(db);
      auditRepo = createAuditRepository(db);
      compRepo = createComparisonRepository(db);
      awardRepo = createAwardRepository(db);
      attachmentRepo = createAttachmentRepository(db);
      settingsRepo = createTenantSettingsRepository(db);
      healthDeps = {
        checkDb: async () => {
          try { await db.command({ ping: 1 }); return true; } catch { return false; }
        },
      };
      dbConnected = true;
      console.log(JSON.stringify({ level: 'info', msg: 'Document DB connected' }));
    } catch (err) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'Document DB connection failed — using in-memory repositories', error: String(err) }));
      invRepo = createInMemoryInvitationRepository();
      quoteRepo = createInMemoryQuoteRepository();
      auditRepo = createInMemoryAuditRepository();
      compRepo = createInMemoryComparisonRepository();
      awardRepo = createInMemoryAwardRepository();
      attachmentRepo = createInMemoryAttachmentRepository();
      settingsRepo = createInMemoryTenantSettingsRepository();
    }
  } else {
    console.warn(JSON.stringify({ level: 'warn', msg: 'MNDY_MONGODB_CONNECTION_STRING not set — using in-memory repositories (data resets on restart)' }));
    invRepo = createInMemoryInvitationRepository();
    quoteRepo = createInMemoryQuoteRepository();
    auditRepo = createInMemoryAuditRepository();
    compRepo = createInMemoryComparisonRepository();
    awardRepo = createInMemoryAwardRepository();
    attachmentRepo = createInMemoryAttachmentRepository();
    settingsRepo = createInMemoryTenantSettingsRepository();
  }

  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const bidComparisonService = createBidComparisonService(invRepo, quoteService, compRepo);
  const awardService = createAwardService(awardRepo, compRepo, auditRepo);
  const settingsService = createTenantSettingsService(settingsRepo, auditRepo);
  const auditService = createAuditService(auditRepo);

  // OBJECT_STORAGE_BUCKET is auto-injected by monday Code once the app is deployed there.
  // Before that (local dev, tests, first-release bootstrap) fall back to an in-memory
  // store served by devStorageRoutes.ts — same real/fallback split as Document DB above.
  let objectStorage: ObjectStorageProvider;
  let inMemoryStorage: InMemoryObjectStorageProvider | undefined;
  if (process.env['OBJECT_STORAGE_BUCKET']) {
    objectStorage = await createMondayObjectStorageProvider();
    console.log(JSON.stringify({ level: 'info', msg: 'Object Storage connected' }));
  } else {
    console.warn(JSON.stringify({ level: 'warn', msg: 'OBJECT_STORAGE_BUCKET not set — using in-memory object storage (files reset on restart)' }));
    inMemoryStorage = createInMemoryObjectStorageProvider();
    objectStorage = inMemoryStorage;
  }
  const documentService = createDocumentService(attachmentRepo, invRepo, objectStorage);

  const app = createApp(
    invService, quoteService, clientSecret, bidComparisonService, awardService, documentService, healthDeps,
    inMemoryStorage ? { provider: inMemoryStorage, attachmentRepo } : undefined,
    settingsService,
    auditService,
  );

  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'Ariavel Sourcing server listening', port: PORT }));
  });

  const shutdown = async () => {
    console.log(JSON.stringify({ level: 'info', msg: 'Shutdown signal received' }));
    server.close();
    if (dbConnected) await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'Failed to start server', error: String(err) }));
  process.exit(1);
});
