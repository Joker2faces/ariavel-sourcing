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
import { createApp } from './app.js';

const PORT = Number(process.env['PORT'] ?? 8080);

async function start() {
  // MONDAY_CLIENT_SECRET is used to verify monday.get("sessionToken") JWTs.
  // This is the app CLIENT SECRET from Developer Center, NOT the Signing Secret.
  const clientSecret = process.env['MONDAY_CLIENT_SECRET'];
  if (!clientSecret) {
    console.error('MONDAY_CLIENT_SECRET is required (used to verify buyer session tokens)');
    process.exit(1);
  }

  const db = await getDb();
  const invRepo = createInvitationRepository(db);
  const quoteRepo = createQuoteRepository(db);
  const auditRepo = createAuditRepository(db);
  const compRepo = createComparisonRepository(db);
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const bidComparisonService = createBidComparisonService(invRepo, quoteService, compRepo);
  const awardRepo = createAwardRepository(db);
  const awardService = createAwardService(awardRepo, compRepo, auditRepo);

  const app = createApp(invService, quoteService, clientSecret, bidComparisonService, awardService);

  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ level: 'info', msg: `Ariavel Sourcing server listening`, port: PORT }));
  });

  const shutdown = async () => {
    console.log(JSON.stringify({ level: 'info', msg: 'Shutdown signal received' }));
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'Failed to start server', error: String(err) }));
  process.exit(1);
});
