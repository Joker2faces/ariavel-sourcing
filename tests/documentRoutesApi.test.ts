// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server/app';
import { createInvitationService } from '../src/server/services/invitationService';
import { createQuoteService } from '../src/server/services/quoteService';
import { createDocumentService } from '../src/server/services/documentService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryQuoteRepository } from '../src/server/db/inMemoryQuoteRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { createInMemoryAttachmentRepository } from '../src/server/db/inMemoryAttachmentRepository';
import { createInMemoryObjectStorageProvider } from '../src/server/storage/objectStorageProvider';

const CLIENT_SECRET = 'test-client-secret-minimum-32-chars-long!!';
const TENANT_ACCOUNT_ID = 9999;
const OTHER_TENANT_ACCOUNT_ID = 8888;
const USER_ID = 42;

function makeApp() {
  const invRepo = createInMemoryInvitationRepository();
  const quoteRepo = createInMemoryQuoteRepository();
  const auditRepo = createInMemoryAuditRepository();
  const attachmentRepo = createInMemoryAttachmentRepository();
  const storage = createInMemoryObjectStorageProvider();
  const invService = createInvitationService(invRepo, auditRepo);
  const quoteService = createQuoteService(quoteRepo, auditRepo);
  const documentService = createDocumentService(attachmentRepo, invRepo, storage);
  const app = createApp(
    invService, quoteService, CLIENT_SECRET, undefined, undefined, documentService, undefined,
    { provider: storage, attachmentRepo },
  );
  return { app, invService };
}

function buyerToken(accountId = TENANT_ACCOUNT_ID) {
  return jwt.sign({ dat: { account_id: accountId, user_id: USER_ID, short_lived_token: 'slt' } }, CLIENT_SECRET, { expiresIn: '1h' });
}

async function createInvitationAndOpen(app: import('express').Express, invService: ReturnType<typeof createInvitationService>) {
  const inv = await invService.create(`monday-account-${TENANT_ACCOUNT_ID}`, {
    eventId: 'event-1', eventReference: 'RFQ-1', eventTitleSnapshot: 'RFQ 1',
    supplierId: 'sup-1', supplierNameSnapshot: 'Acme', supplierEmailSnapshot: 'a@acme.com',
  }, USER_ID.toString());
  return { app, rawToken: inv.rawToken, invitationId: inv.invitation.id };
}

describe('Document routes — buyer upload/download round trip', () => {
  it('uploads via dev-storage PUT, confirms, then downloads the same bytes', async () => {
    const { app } = makeApp();
    const token = buyerToken();

    const initiate = await request(app)
      .post('/api/buyer/events/event-1/attachments')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'spec.pdf', mimeType: 'application/pdf', sizeBytes: 4 });
    expect(initiate.status).toBe(201);
    expect(initiate.body.uploadUrl).toContain('/api/dev-storage/');

    const putRes = await request(app)
      .put(initiate.body.uploadUrl)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF'));
    expect(putRes.status).toBe(200);

    const confirm = await request(app)
      .post(`/api/buyer/attachments/${initiate.body.attachmentId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.attachment.status).toBe('READY');

    const download = await request(app)
      .get(`/api/buyer/attachments/${initiate.body.attachmentId}/download`)
      .set('Authorization', `Bearer ${token}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.body.toString()).toBe('%PDF');
  });

  it('rejects downloading another tenant\'s attachment', async () => {
    const { app } = makeApp();
    const token = buyerToken();
    const otherToken = buyerToken(OTHER_TENANT_ACCOUNT_ID);

    const initiate = await request(app)
      .post('/api/buyer/events/event-1/attachments')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'spec.pdf', mimeType: 'application/pdf', sizeBytes: 4 });
    await request(app).put(initiate.body.uploadUrl).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF'));
    await request(app).post(`/api/buyer/attachments/${initiate.body.attachmentId}/confirm`).set('Authorization', `Bearer ${token}`);

    const crossTenantDownload = await request(app)
      .get(`/api/buyer/attachments/${initiate.body.attachmentId}/download`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(crossTenantDownload.status).toBe(404);
  });

  it('rejects a dev-storage PUT for an object key with no pending upload', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .put(`/api/dev-storage/${encodeURIComponent('monday-account-9999/event/event-1/does-not-exist')}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF'));
    expect(res.status).toBe(404);
  });
});

describe('Document routes — portal (supplier) token-based access', () => {
  it('lets the supplier list and download RFQ event attachments via their token', async () => {
    const { app, invService } = makeApp();
    const buyer = buyerToken();
    const initiate = await request(app)
      .post('/api/buyer/events/event-1/attachments')
      .set('Authorization', `Bearer ${buyer}`)
      .send({ filename: 'rfq-spec.pdf', mimeType: 'application/pdf', sizeBytes: 4 });
    await request(app).put(initiate.body.uploadUrl).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF'));
    await request(app).post(`/api/buyer/attachments/${initiate.body.attachmentId}/confirm`).set('Authorization', `Bearer ${buyer}`);

    const { rawToken } = await createInvitationAndOpen(app, invService);

    const list = await request(app).get(`/api/portal/invitations/${rawToken}/attachments`);
    expect(list.status).toBe(200);
    expect(list.body.attachments).toHaveLength(1);

    const download = await request(app).get(`/api/portal/invitations/${rawToken}/attachments/${initiate.body.attachmentId}/download`);
    expect(download.status).toBe(200);
    expect(download.body.toString()).toBe('%PDF');
  });

  it('lets the supplier upload a quote attachment and download it back, but not before it is confirmed', async () => {
    const { app, invService } = makeApp();
    const { rawToken, invitationId } = await createInvitationAndOpen(app, invService);

    const initiate = await request(app)
      .post(`/api/portal/invitations/${rawToken}/quote-attachments`)
      .send({ filename: 'cert.pdf', mimeType: 'application/pdf', sizeBytes: 4 });
    expect(initiate.status).toBe(201);

    const preConfirmDownload = await request(app)
      .get(`/api/portal/invitations/${rawToken}/attachments/${initiate.body.attachmentId}/download`);
    expect(preConfirmDownload.status).toBe(404);

    await request(app).put(initiate.body.uploadUrl).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF'));
    const confirm = await request(app)
      .post(`/api/portal/invitations/${rawToken}/quote-attachments/${initiate.body.attachmentId}/confirm`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.attachment.entityId).toBe(invitationId);

    const download = await request(app)
      .get(`/api/portal/invitations/${rawToken}/attachments/${initiate.body.attachmentId}/download`);
    expect(download.status).toBe(200);
  });

  it('never lets a supplier reach another invitation\'s quote attachment', async () => {
    const { app, invService } = makeApp();
    const { rawToken: tokenA } = await createInvitationAndOpen(app, invService);
    const invB = await invService.create(`monday-account-${TENANT_ACCOUNT_ID}`, {
      eventId: 'event-1', eventReference: 'RFQ-1', eventTitleSnapshot: 'RFQ 1',
      supplierId: 'sup-2', supplierNameSnapshot: 'Beta', supplierEmailSnapshot: 'b@beta.com',
    }, USER_ID.toString());

    const initiateB = await request(app)
      .post(`/api/portal/invitations/${invB.rawToken}/quote-attachments`)
      .send({ filename: 'beta-cert.pdf', mimeType: 'application/pdf', sizeBytes: 4 });
    await request(app).put(initiateB.body.uploadUrl).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF'));
    await request(app).post(`/api/portal/invitations/${invB.rawToken}/quote-attachments/${initiateB.body.attachmentId}/confirm`);

    const crossSupplierDownload = await request(app)
      .get(`/api/portal/invitations/${tokenA}/attachments/${initiateB.body.attachmentId}/download`);
    expect(crossSupplierDownload.status).toBe(404);
  });

  it('rejects an unknown/invalid portal token', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/portal/invitations/not-a-real-token/attachments');
    expect(res.status).toBe(404);
  });
});
