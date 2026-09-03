// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createInvitationService, InvitationNotFoundError, InvitationInvalidStatusError } from '../src/server/services/invitationService';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';
import { hashToken } from '../src/server/utils/tokens';

const TENANT = 'ariavel-development-tenant';

function makeService() {
  const invRepo = createInMemoryInvitationRepository();
  const auditRepo = createInMemoryAuditRepository();
  const service = createInvitationService(invRepo, auditRepo);
  return { service, invRepo, auditRepo };
}

const baseInput = {
  eventId: 'event-1',
  eventReference: 'RFQ-2026-001',
  eventTitleSnapshot: 'Test RFQ',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'ACME Ltd',
  supplierEmailSnapshot: 'acme@example.com',
};

describe('InvitationService', () => {
  describe('create', () => {
    it('creates invitation and returns raw token', async () => {
      const { service } = makeService();
      const { invitation, rawToken } = await service.create(TENANT, baseInput, 'user-1');
      expect(invitation.status).toBe('CREATED');
      expect(invitation.tenantId).toBe(TENANT);
      expect(invitation.eventId).toBe('event-1');
      expect(rawToken).toHaveLength(64);
    });

    it('stores hashed token, not raw', async () => {
      const { service } = makeService();
      const { invitation, rawToken } = await service.create(TENANT, baseInput, 'user-1');
      expect(invitation.tokenHash).toBe(hashToken(rawToken));
      expect(invitation.tokenHash).not.toBe(rawToken);
    });

    it('logs audit event on create', async () => {
      const { service, auditRepo } = makeService();
      await service.create(TENANT, baseInput, 'user-99');
      const events = auditRepo.getAll();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('INVITATION_CREATED');
      expect(events[0].actorId).toBe('user-99');
    });
  });

  describe('open', () => {
    it('transitions CREATED → OPENED and sets openedAt', async () => {
      const { service } = makeService();
      const { rawToken } = await service.create(TENANT, baseInput, 'user-1');
      const opened = await service.open(rawToken);
      expect(opened.status).toBe('OPENED');
      expect(opened.openedAt).toBeTruthy();
    });

    it('returns OPENED invitation unchanged if already OPENED', async () => {
      const { service } = makeService();
      const { rawToken } = await service.create(TENANT, baseInput, 'user-1');
      await service.open(rawToken);
      const again = await service.open(rawToken);
      expect(again.status).toBe('OPENED');
    });

    it('throws InvitationNotFoundError for unknown token', async () => {
      const { service } = makeService();
      await expect(service.open('0'.repeat(64))).rejects.toBeInstanceOf(InvitationNotFoundError);
    });

    it('throws InvitationInvalidStatusError for REVOKED invitation', async () => {
      const { service } = makeService();
      const { invitation, rawToken } = await service.create(TENANT, baseInput, 'user-1');
      await service.revoke(TENANT, invitation.id, 'user-1');
      await expect(service.open(rawToken)).rejects.toBeInstanceOf(InvitationInvalidStatusError);
    });

    it('throws for expired invitation (past expiresAt)', async () => {
      const { service } = makeService();
      const { rawToken } = await service.create(TENANT, { ...baseInput, expiresAt: '2020-01-01T00:00:00Z' }, 'user-1');
      await expect(service.open(rawToken)).rejects.toBeInstanceOf(InvitationInvalidStatusError);
    });
  });

  describe('revoke', () => {
    it('revokes an open invitation', async () => {
      const { service } = makeService();
      const { invitation, rawToken } = await service.create(TENANT, baseInput, 'user-1');
      await service.open(rawToken);
      const revoked = await service.revoke(TENANT, invitation.id, 'user-2');
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revokedByUserId).toBe('user-2');
    });

    it('cannot revoke a submitted invitation', async () => {
      const { service } = makeService();
      const { invitation, rawToken } = await service.create(TENANT, baseInput, 'user-1');
      await service.open(rawToken);
      await service.markSubmitted(TENANT, invitation.id, 'sup-1');
      await expect(service.revoke(TENANT, invitation.id, 'user-1')).rejects.toBeInstanceOf(InvitationInvalidStatusError);
    });
  });

  describe('regenerate', () => {
    it('issues a new token and invalidates old one', async () => {
      const { service } = makeService();
      const { invitation, rawToken: oldToken } = await service.create(TENANT, baseInput, 'user-1');
      const { rawToken: newToken } = await service.regenerate(TENANT, invitation.id, 'user-1');
      expect(newToken).not.toBe(oldToken);
      await expect(service.open(oldToken)).rejects.toBeInstanceOf(InvitationNotFoundError);
      const opened = await service.open(newToken);
      expect(opened.status).toBe('OPENED');
    });
  });

  describe('listForEvent', () => {
    it('returns only invitations for the specified event and tenant', async () => {
      const { service } = makeService();
      await service.create(TENANT, baseInput, 'user-1');
      await service.create(TENANT, { ...baseInput, eventId: 'event-other' }, 'user-1');
      const list = await service.listForEvent(TENANT, 'event-1');
      expect(list).toHaveLength(1);
      expect(list[0].eventId).toBe('event-1');
    });
  });
});
