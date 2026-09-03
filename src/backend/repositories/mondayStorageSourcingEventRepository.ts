import type { SourcingEvent, SourcingEventInput, SourcingEventStatus } from '../../shared/types/domain';
import type { TenantContext } from '../tenancy/tenantContext';
import type { MondayRuntimeAdapter } from '../runtime/mondayRuntime';
import type { SourcingEventRepository } from './sourcingEventRepository';
import { StorageVersionConflictError } from './mondayStorageSupplierRepository';
import {
  SOURCING_EVENT_INDEX_KEY,
  SOURCING_EVENT_KEY,
  SOURCING_EVENT_SCHEMA_VERSION,
  SOURCING_EVENT_SCHEMA_VERSION_KEY,
} from './sourcingEventStorageKeys';
import { SourcingEventNotFoundError } from './inMemorySourcingEventRepository';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now(): string { return new Date().toISOString(); }

async function ensureSchemaVersion(runtime: MondayRuntimeAdapter): Promise<void> {
  const result = await runtime.storage.getItem(SOURCING_EVENT_SCHEMA_VERSION_KEY);
  if (!result.value) await runtime.storage.setItem(SOURCING_EVENT_SCHEMA_VERSION_KEY, SOURCING_EVENT_SCHEMA_VERSION);
}

async function readIndex(runtime: MondayRuntimeAdapter): Promise<{ ids: string[]; version?: string }> {
  const result = await runtime.storage.getItem(SOURCING_EVENT_INDEX_KEY);
  if (!result.value) return { ids: [], version: result.version };
  try { return { ids: JSON.parse(result.value) as string[], version: result.version }; } catch { return { ids: [], version: result.version }; }
}

async function writeIndex(runtime: MondayRuntimeAdapter, ids: string[], previousVersion?: string): Promise<void> {
  const result = await runtime.storage.setItem(SOURCING_EVENT_INDEX_KEY, JSON.stringify(ids), previousVersion ? { previous_version: previousVersion } : undefined);
  if (!result.success) throw new StorageVersionConflictError(SOURCING_EVENT_INDEX_KEY);
}

async function readEvent(runtime: MondayRuntimeAdapter, id: string): Promise<{ event: SourcingEvent | null; version?: string }> {
  const result = await runtime.storage.getItem(SOURCING_EVENT_KEY(id));
  if (!result.value) return { event: null, version: result.version };
  try { return { event: JSON.parse(result.value) as SourcingEvent, version: result.version }; } catch { return { event: null, version: result.version }; }
}

async function writeEvent(runtime: MondayRuntimeAdapter, event: SourcingEvent, previousVersion?: string): Promise<void> {
  const result = await runtime.storage.setItem(SOURCING_EVENT_KEY(event.id), JSON.stringify(event), previousVersion ? { previous_version: previousVersion } : undefined);
  if (!result.success) throw new StorageVersionConflictError(SOURCING_EVENT_KEY(event.id));
}

export function createMondayStorageSourcingEventRepository(runtime: MondayRuntimeAdapter): SourcingEventRepository {
  let schemaReady = false;
  const ensureSchema = async () => { if (!schemaReady) { await ensureSchemaVersion(runtime); schemaReady = true; } };

  return {
    async listForTenant(_tenant: TenantContext): Promise<SourcingEvent[]> {
      await ensureSchema();
      const { ids } = await readIndex(runtime);
      const events: SourcingEvent[] = [];
      for (const id of ids) {
        const { event } = await readEvent(runtime, id);
        if (event) events.push(event);
      }
      return events;
    },

    async getForTenant(_tenant: TenantContext, eventId: string): Promise<SourcingEvent | undefined> {
      await ensureSchema();
      const { event } = await readEvent(runtime, eventId);
      return event ?? undefined;
    },

    async createForTenant(_tenant: TenantContext, input: SourcingEventInput, ownerUserId: string): Promise<SourcingEvent> {
      await ensureSchema();
      const ts = now();
      const event: SourcingEvent = {
        ...input,
        id: newId(),
        tenantId: _tenant.tenantId,
        status: 'DRAFT',
        createdAt: ts,
        updatedAt: ts,
        createdByUserId: ownerUserId,
        updatedByUserId: ownerUserId,
      };
      await writeEvent(runtime, event);
      const { ids, version } = await readIndex(runtime);
      await writeIndex(runtime, [...ids, event.id], version);
      return event;
    },

    async updateForTenant(_tenant: TenantContext, eventId: string, input: SourcingEventInput, updatedByUserId: string): Promise<SourcingEvent> {
      await ensureSchema();
      const { event: existing, version } = await readEvent(runtime, eventId);
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
      await writeEvent(runtime, updated, version);
      return updated;
    },

    async changeStatusForTenant(_tenant: TenantContext, eventId: string, status: SourcingEventStatus, updatedByUserId: string): Promise<SourcingEvent> {
      await ensureSchema();
      const { event: existing, version } = await readEvent(runtime, eventId);
      if (!existing) throw new SourcingEventNotFoundError();
      const updated: SourcingEvent = { ...existing, status, updatedAt: now(), updatedByUserId };
      await writeEvent(runtime, updated, version);
      return updated;
    },
  };
}
