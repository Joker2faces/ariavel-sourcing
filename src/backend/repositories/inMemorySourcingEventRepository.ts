import type { SourcingEvent, SourcingEventStatus } from '../../shared/types/domain';
import type { TenantContext } from '../tenancy/tenantContext';
import type { SourcingEventRepository } from './sourcingEventRepository';

export class SourcingEventNotFoundError extends Error {
  constructor() { super('Sourcing event was not found.'); this.name = 'SourcingEventNotFoundError'; }
}

interface Options { now?: () => string; createId?: () => string; }

const copy = (e: SourcingEvent): SourcingEvent => ({
  ...e,
  lines: e.lines.map(l => ({ ...l })),
  supplierSelections: e.supplierSelections.map(s => ({ ...s })),
});

export function createInMemorySourcingEventRepository(initial: SourcingEvent[] = [], opts: Options = {}): SourcingEventRepository {
  const records = new Map(initial.map(e => [e.id, copy(e)]));
  const now = opts.now ?? (() => new Date().toISOString());
  const createId = opts.createId ?? (() => globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const find = (tenant: TenantContext, id: string) => { const e = records.get(id); return e?.tenantId === tenant.tenantId ? e : undefined; };

  return {
    async listForTenant(tenant) {
      return [...records.values()].filter(e => e.tenantId === tenant.tenantId).map(copy);
    },

    async getForTenant(tenant, eventId) {
      const e = find(tenant, eventId);
      return e ? copy(e) : undefined;
    },

    async createForTenant(tenant, input, ownerUserId) {
      const ts = now();
      const event: SourcingEvent = {
        ...input,
        id: createId(),
        tenantId: tenant.tenantId,
        status: 'DRAFT',
        createdAt: ts,
        updatedAt: ts,
        createdByUserId: ownerUserId,
        updatedByUserId: ownerUserId,
      };
      records.set(event.id, copy(event));
      return copy(event);
    },

    async updateForTenant(tenant, eventId, input, updatedByUserId) {
      const existing = find(tenant, eventId);
      if (!existing) throw new SourcingEventNotFoundError();
      const updated: SourcingEvent = {
        ...existing,
        ...input,
        id: existing.id,
        tenantId: existing.tenantId,
        status: existing.status,
        createdAt: existing.createdAt,
        createdByUserId: existing.createdByUserId,
        updatedAt: now(),
        updatedByUserId,
      };
      records.set(eventId, copy(updated));
      return copy(updated);
    },

    async changeStatusForTenant(tenant, eventId, status: SourcingEventStatus, updatedByUserId) {
      const existing = find(tenant, eventId);
      if (!existing) throw new SourcingEventNotFoundError();
      const updated: SourcingEvent = { ...existing, status, updatedAt: now(), updatedByUserId };
      records.set(eventId, copy(updated));
      return copy(updated);
    },
  };
}
