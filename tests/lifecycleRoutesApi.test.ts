// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import type { TenantDataService } from '../src/server/services/tenantDataService';

const CLIENT_SECRET = 'test-client-secret-minimum-32-chars-long!!';
const SIGNING_SECRET = 'completely-different-signing-secret!!';
const ACCOUNT_ID = 42424;

function makeApp(dataService?: TenantDataService) {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const app = createApp(
    invService, quoteService, CLIENT_SECRET,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    dataService,
  );
  return { app };
}

function lifecycleToken(accountId = ACCOUNT_ID, secret = CLIENT_SECRET) {
  return jwt.sign({ accountId, userId: 1 }, secret, { expiresIn: '1h' });
}

describe('Lifecycle events route', () => {
  it('rejects a request with no Authorization header', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/lifecycle/events').send({ type: 'install' });
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the Signing Secret instead of the Client Secret', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/lifecycle/events')
      .set('Authorization', `Bearer ${lifecycleToken(ACCOUNT_ID, SIGNING_SECRET)}`)
      .send({ type: 'uninstall' });
    expect(res.status).toBe(401);
  });

  it('acknowledges a valid install event with 200', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/lifecycle/events')
      .set('Authorization', `Bearer ${lifecycleToken()}`)
      .send({ type: 'install' });
    expect(res.status).toBe(200);
  });

  it('calls deleteTenantData for the correct tenant on an uninstall event', async () => {
    const deleteTenantData = vi.fn().mockResolvedValue({});
    const dataService = { exportTenantData: vi.fn(), deleteTenantData } as unknown as TenantDataService;
    const { app } = makeApp(dataService);

    const res = await request(app)
      .post('/api/lifecycle/events')
      .set('Authorization', `Bearer ${lifecycleToken()}`)
      .send({ type: 'uninstall' });

    expect(res.status).toBe(200);
    expect(deleteTenantData).toHaveBeenCalledWith(`monday-account-${ACCOUNT_ID}`, 'monday-lifecycle', expect.any(String));
  });

  it('does not delete anything for a non-uninstall event type', async () => {
    const deleteTenantData = vi.fn().mockResolvedValue({});
    const dataService = { exportTenantData: vi.fn(), deleteTenantData } as unknown as TenantDataService;
    const { app } = makeApp(dataService);

    await request(app)
      .post('/api/lifecycle/events')
      .set('Authorization', `Bearer ${lifecycleToken()}`)
      .send({ type: 'app_subscription_changed' });

    expect(deleteTenantData).not.toHaveBeenCalled();
  });

  it('still acknowledges 200 when deleteTenantData throws (avoid endless monday retries on a transient error)', async () => {
    const dataService = {
      exportTenantData: vi.fn(),
      deleteTenantData: vi.fn().mockRejectedValue(new Error('transient db error')),
    } as unknown as TenantDataService;
    const { app } = makeApp(dataService);

    const res = await request(app)
      .post('/api/lifecycle/events')
      .set('Authorization', `Bearer ${lifecycleToken()}`)
      .send({ type: 'uninstall' });
    expect(res.status).toBe(200);
  });

  it('acknowledges 200 for uninstall even with no dataService configured (dev/first-boot, nothing durable to delete)', async () => {
    const { app } = makeApp(undefined);
    const res = await request(app)
      .post('/api/lifecycle/events')
      .set('Authorization', `Bearer ${lifecycleToken()}`)
      .send({ type: 'uninstall' });
    expect(res.status).toBe(200);
  });
});
