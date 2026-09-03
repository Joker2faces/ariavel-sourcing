import type { InvitationRepository } from './invitationRepository.js';
import type { SupplierInvitation } from '../types/invitation.js';
import { randomBytes } from 'crypto';

export function createInMemoryInvitationRepository(seed: SupplierInvitation[] = []): InvitationRepository {
  const store = new Map<string, SupplierInvitation>(seed.map(i => [i.id, { ...i }]));
  const byHash = new Map<string, string>(seed.map(i => [i.tokenHash, i.id]));

  function genId() { return randomBytes(12).toString('hex'); }

  return {
    async create(tenantId, input, tokenHash, createdByUserId, now) {
      const doc: SupplierInvitation = { id: genId(), tenantId, ...input, tokenHash, status: 'CREATED', createdAt: now, updatedAt: now, createdByUserId };
      store.set(doc.id, doc);
      byHash.set(tokenHash, doc.id);
      return { ...doc };
    },
    async findById(tenantId, id) {
      const doc = store.get(id);
      return doc?.tenantId === tenantId ? { ...doc } : null;
    },
    async findByTokenHash(tokenHash) {
      const id = byHash.get(tokenHash);
      if (!id) return null;
      const doc = store.get(id);
      return doc ? { ...doc } : null;
    },
    async listForEvent(tenantId, eventId) {
      return [...store.values()].filter(i => i.tenantId === tenantId && i.eventId === eventId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async updateStatus(tenantId, id, status, extra, now) {
      const doc = store.get(id);
      if (!doc || doc.tenantId !== tenantId) return null;
      const updated = { ...doc, ...extra, status, updatedAt: now } as SupplierInvitation;
      store.set(id, updated);
      return { ...updated };
    },
    async replaceToken(tenantId, id, newTokenHash, userId, now) {
      const doc = store.get(id);
      if (!doc || doc.tenantId !== tenantId) return null;
      byHash.delete(doc.tokenHash);
      const updated: SupplierInvitation = { ...doc, tokenHash: newTokenHash, regeneratedAt: now, regeneratedByUserId: userId, updatedAt: now };
      store.set(id, updated);
      byHash.set(newTokenHash, id);
      return { ...updated };
    },
  };
}
