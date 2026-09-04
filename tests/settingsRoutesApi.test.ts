// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createTenantSettingsService } from '../src/server/services/tenantSettingsService';
import type { TenantSettingsService } from '../src/server/services/tenantSettingsService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInMemoryTenantSettingsRepository } from '../src/server/db/inMemoryTenantSettingsRepository';

const CLIENT_SECRET = 'test-client-secret-minimum-32-chars-long!!';
const TENANT_ACCOUNT_ID = 9999;
const OTHER_TENANT_ACCOUNT_ID = 8888;

function makeApp(settingsServiceOverride?: TenantSettingsService) {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const settingsRepo = createInMemoryTenantSettingsRepository();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const settingsService = settingsServiceOverride ?? createTenantSettingsService(settingsRepo, auditRepo);
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

  describe('UAT regression: Document DB failure on GET /settings', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns a generic 500 to the browser and logs a sanitized diagnostic — never the raw error, and never a secret', async () => {
      // Real UAT report: GET /api/buyer/settings returned 500 in the live
      // installed app. The route already intends to fall through to 500 on
      // any repository failure (e.g. a Document DB defect) — this proves
      // that path stays generic to the client while still giving operators
      // a real diagnostic to act on, instead of a silent, unexplained 500.
      const brokenService: TenantSettingsService = {
        getSettings: vi.fn().mockRejectedValue(new Error('Document DB connection lost mid-query')),
        updateSettings: vi.fn(),
      };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { app } = makeApp(brokenService);
      const token = buyerToken();

      const res = await request(app).get('/api/buyer/settings').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });

      // Two independent diagnostics fire on a real 500: the route-level
      // stage log (fine-grained, this specific failure) and the generic
      // request-completion logger (every /api/buyer|/api/portal request).
      // Log lines are (tag, jsonPayload) — two console.error args, not one
      // JSON string — because the monday console-log viewer was observed to
      // render a pure single-argument JSON line as unreadable "[console]null"
      // during real UAT log investigation.
      const stageCall = errorSpy.mock.calls.find(call => call[0] === 'SETTINGS_ROUTE_ERROR');
      expect(stageCall).toBeDefined();
      const logged = JSON.parse(stageCall![1] as string);
      expect(logged.route).toBe('GET /api/buyer/settings');
      expect(logged.errorName).toBe('Error');
      expect(logged.error).toBe('Document DB connection lost mid-query');
      expect(typeof logged.requestId).toBe('string');
      expect(typeof logged.durationMs).toBe('number');

      const completionCall = errorSpy.mock.calls.find(call => call[0] === 'API_REQUEST_COMPLETE');
      expect(completionCall).toBeDefined();
      const completion = JSON.parse(completionCall![1] as string);
      expect(completion.status).toBe(500);

      const loggedText = errorSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(loggedText).not.toContain(token);
      expect(loggedText.toLowerCase()).not.toContain('authorization');
      expect(loggedText.toLowerCase()).not.toContain('bearer');
      expect(loggedText.toLowerCase()).not.toContain('mongodb');
    });
  });
});
