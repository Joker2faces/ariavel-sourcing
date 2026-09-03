// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createTenantSettingsService } from '../src/server/services/tenantSettingsService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInMemoryTenantSettingsRepository } from '../src/server/db/inMemoryTenantSettingsRepository';

const CLIENT_SECRET = 'test-client-secret-minimum-32-chars-long!!';
const TENANT_ACCOUNT_ID = 9999;
const OTHER_TENANT_ACCOUNT_ID = 8888;

function makeApp() {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const settingsRepo = createInMemoryTenantSettingsRepository();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const settingsService = createTenantSettingsService(settingsRepo, auditRepo);
  const app = createApp(invService, quoteService, CLIENT_SECRET, undefined, undefined, undefined, undefined, undefined, settingsService);
  return { app };
}

function buyerToken(accountId = TENANT_ACCOUNT_ID) {
  return jwt.sign({ dat: { account_id: accountId, user_id: 42, short_lived_token: 'slt' } }, CLIENT_SECRET, { expiresIn: '1h' });
}

describe('Settings routes', () => {
  it('requires auth', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/buyer/settings');
    expect(res.status).toBe(401);
  });

  it('returns defaults on first GET', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/buyer/settings').set('Authorization', `Bearer ${buyerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.settings.organization.defaultCurrency).toBe('EUR');
    expect(res.body.settings.version).toBe(0);
  });

  it('saves and reloads settings, rejecting stale writes with 409', async () => {
    const { app } = makeApp();
    const token = buyerToken();

    const save1 = await request(app)
      .put('/api/buyer/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 0, organization: { companyDisplayName: 'Acme' } });
    expect(save1.status).toBe(200);
    expect(save1.body.settings.version).toBe(1);

    const stale = await request(app)
      .put('/api/buyer/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 0, organization: { companyDisplayName: 'Stale' } });
    expect(stale.status).toBe(409);

    const get = await request(app).get('/api/buyer/settings').set('Authorization', `Bearer ${token}`);
    expect(get.body.settings.organization.companyDisplayName).toBe('Acme');
  });

  it('keeps tenants isolated', async () => {
    const { app } = makeApp();
    await request(app)
      .put('/api/buyer/settings')
      .set('Authorization', `Bearer ${buyerToken()}`)
      .send({ expectedVersion: 0, organization: { companyDisplayName: 'Tenant A Co' } });

    const otherRes = await request(app).get('/api/buyer/settings').set('Authorization', `Bearer ${buyerToken(OTHER_TENANT_ACCOUNT_ID)}`);
    expect(otherRes.body.settings.organization.companyDisplayName).toBe('');
  });

  it('rejects a PUT missing expectedVersion', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .put('/api/buyer/settings')
      .set('Authorization', `Bearer ${buyerToken()}`)
      .send({ organization: { companyDisplayName: 'No version' } });
    expect(res.status).toBe(400);
  });
});
