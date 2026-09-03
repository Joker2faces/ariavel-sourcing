import type { InvitationRepository } from '../db/invitationRepository.js';
import type { AuditRepository } from '../db/auditRepository.js';
import type { SupplierInvitation, InvitationInput } from '../types/invitation.js';
import { generateRawToken, hashToken } from '../utils/tokens.js';

export interface InvitationService {
  create(tenantId: string, input: InvitationInput, createdByUserId: string): Promise<{ invitation: SupplierInvitation; rawToken: string }>;
  open(rawToken: string): Promise<SupplierInvitation>;
  markSubmitted(tenantId: string, id: string, supplierId: string): Promise<SupplierInvitation>;
  revoke(tenantId: string, id: string, revokedByUserId: string): Promise<SupplierInvitation>;
  regenerate(tenantId: string, id: string, userId: string): Promise<{ invitation: SupplierInvitation; rawToken: string }>;
  listForEvent(tenantId: string, eventId: string): Promise<SupplierInvitation[]>;
  resolveByToken(rawToken: string): Promise<SupplierInvitation>;
}

export class InvitationNotFoundError extends Error { constructor() { super('Invitation not found'); } }
export class InvitationInvalidStatusError extends Error { constructor(msg: string) { super(msg); } }

export function createInvitationService(
  invRepo: InvitationRepository,
  auditRepo: AuditRepository,
): InvitationService {
  function now() { return new Date().toISOString(); }

  return {
    async create(tenantId, input, createdByUserId) {
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const n = now();
      const invitation = await invRepo.create(tenantId, input, tokenHash, createdByUserId, n);
      await auditRepo.log(tenantId, 'INVITATION_CREATED', invitation.id, 'invitation', 'buyer', createdByUserId, n, { supplierId: input.supplierId, eventId: input.eventId });
      return { invitation, rawToken };
    },

    async open(rawToken) {
      const tokenHash = hashToken(rawToken);
      const invitation = await invRepo.findByTokenHash(tokenHash);
      if (!invitation) throw new InvitationNotFoundError();
      if (invitation.status === 'REVOKED') throw new InvitationInvalidStatusError('Invitation has been revoked');
      if (invitation.status === 'EXPIRED') throw new InvitationInvalidStatusError('Invitation has expired');
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        await invRepo.updateStatus(invitation.tenantId, invitation.id, 'EXPIRED', {}, now());
        throw new InvitationInvalidStatusError('Invitation has expired');
      }
      const n = now();
      if (invitation.status === 'CREATED') {
        const updated = await invRepo.updateStatus(invitation.tenantId, invitation.id, 'OPENED', { openedAt: n }, n);
        await auditRepo.log(invitation.tenantId, 'INVITATION_OPENED', invitation.id, 'invitation', 'supplier', invitation.supplierId, n);
        return updated!;
      }
      return invitation;
    },

    async revoke(tenantId, id, revokedByUserId) {
      const invitation = await invRepo.findById(tenantId, id);
      if (!invitation) throw new InvitationNotFoundError();
      if (invitation.status === 'SUBMITTED') throw new InvitationInvalidStatusError('Cannot revoke a submitted invitation');
      if (invitation.status === 'REVOKED') throw new InvitationInvalidStatusError('Already revoked');
      const n = now();
      const updated = await invRepo.updateStatus(tenantId, id, 'REVOKED', { revokedAt: n, revokedByUserId }, n);
      await auditRepo.log(tenantId, 'INVITATION_REVOKED', id, 'invitation', 'buyer', revokedByUserId, n);
      return updated!;
    },

    async regenerate(tenantId, id, userId) {
      const invitation = await invRepo.findById(tenantId, id);
      if (!invitation) throw new InvitationNotFoundError();
      if (invitation.status === 'SUBMITTED') throw new InvitationInvalidStatusError('Cannot regenerate token for submitted invitation');
      if (invitation.status === 'REVOKED') throw new InvitationInvalidStatusError('Cannot regenerate token for revoked invitation');
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const n = now();
      const updated = await invRepo.replaceToken(tenantId, id, tokenHash, userId, n);
      await auditRepo.log(tenantId, 'INVITATION_REGENERATED', id, 'invitation', 'buyer', userId, n);
      return { invitation: updated!, rawToken };
    },

    async markSubmitted(tenantId, id, _supplierId) {
      const n = now();
      const updated = await invRepo.updateStatus(tenantId, id, 'SUBMITTED', { submittedAt: n }, n);
      if (!updated) throw new InvitationNotFoundError();
      return updated;
    },

    async listForEvent(tenantId, eventId) {
      return invRepo.listForEvent(tenantId, eventId);
    },

    async resolveByToken(rawToken) {
      const tokenHash = hashToken(rawToken);
      const invitation = await invRepo.findByTokenHash(tokenHash);
      if (!invitation) throw new InvitationNotFoundError();
      if (invitation.status === 'REVOKED') throw new InvitationInvalidStatusError('Invitation has been revoked');
      if (invitation.status === 'EXPIRED') throw new InvitationInvalidStatusError('Invitation has expired');
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        await invRepo.updateStatus(invitation.tenantId, invitation.id, 'EXPIRED', {}, now());
        throw new InvitationInvalidStatusError('Invitation has expired');
      }
      return invitation;
    },
  };
}
