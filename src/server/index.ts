import { getDb, closeDb } from './db/connection.js';
import { createInvitationRepository } from './db/invitationRepository.js';
import { createQuoteRepository } from './db/quoteRepository.js';
import { createAuditRepository } from './db/auditRepository.js';
import { createInvitationService } from './services/invitationService.js';
import { createQuoteService } from './services/quoteService.js';
import { createApp } from './app.js';

const PORT = 8080;

async function start() {
  const signingSecret = process.env['MONDAY_SIGNING_SECRET'];
  if (!signingSecret) {
    console.error('MONDAY_SIGNING_SECRET is required');
    process.exit(1);
  }

  const db = await getDb();
  const invRepo = createInvitationRepository(db);
  const quoteRepo = createQuoteRepository(db);
  const auditRepo = createAuditRepository(db);
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);

  const app = createApp(invService, quoteService, signingSecret);

  const server = app.listen(PORT, () => {
    console.log(`Ariavel Sourcing server running on port ${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
