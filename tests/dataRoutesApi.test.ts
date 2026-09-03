// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createTenantDataService } from '../src/server/services/tenantDataService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';

const CLIENT_SECRET = 'test-client-secret-minimum-32-chars-long!!';
const TENANT_ACCOUNT_ID = 9999;

function makeFakeDb(rows: Array<Record<string, unknown>>) {
  let store = rows;
  return {
    collection() {
      return {
        find(query: Record<string, unknown>) {
          const docs = store.filter(d => Object.entries(query).every(([k, v]) => d[k] === v));
          return { toArray: async () => docs };
        },
        async deleteMany(query: Record<string, unknown>) {
          const before = store.length;
          store = store.filter(d => !Object.entries(query).every(([k, v]) => d[k] === v));
          return { deletedCount: before - store.length };
        },
      };
    },
  } as unknown as import('mongodb').Db;
}

function makeApp() {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const dataService = createTenantDataService(makeFakeDb([
    { tenantId: `monday-account-${TENANT_ACCOUNT_ID}`, id: 'inv-1' },
  ]), auditRepo);
  const app = createApp(invService, quoteService, CLIENT_SECRET, undefined, undefined, undefined, undefined, undefined, undefined, undefined, dataService);
  return { app };
}

function buyerToken() {
  return jwt.sign({ dat: { account_id: TENANT_ACCOUNT_ID, user_id: 42, short_lived_token: 'slt' } }, CLIENT_SECRET, { expiresIn: '1h' });
}

describe('Data export/deletion routes', () => {
  it('requires auth', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/buyer/data/export');
    expect(res.status).toBe(401);
  });

  it('exports the tenant\'s data', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/buyer/data/export').set('Authorization', `Bearer ${buyerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.supplier_invitations).toHaveLength(1);
  });

  it('rejects deletion without the exact confirmation phrase', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/buyer/data/delete')
      .set('Authorization', `Bearer ${buyerToken()}`)
      .send({ confirm: 'delete' });
    expect(res.status).toBe(400);
  });

  it('deletes tenant data when confirmed correctly', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/buyer/data/delete')
      .set('Authorization', `Bearer ${buyerToken()}`)
      .send({ confirm: 'DELETE MY TENANT DATA' });
    expect(res.status).toBe(200);
    expect(res.body.deleted.supplier_invitations).toBe(1);
  });
});
