import type { Supplier, SupplierInput, SupplierSourceConfiguration, SupplierStatus } from '../../shared/types/domain';
import type { TenantContext } from '../tenancy/tenantContext';
import type { MondayRuntimeAdapter } from '../runtime/mondayRuntime';
import type { SupplierRepository } from './supplierRepository';
import { SupplierNotFoundError } from './inMemorySupplierRepository';
import {
  STORAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_VERSION_KEY,
  STORAGE_SOURCE_CONFIG_KEY,
  STORAGE_SUPPLIER_INDEX_KEY,
  STORAGE_SUPPLIER_KEY,
} from './mondayStorageKeys';

export class StorageVersionConflictError extends Error {
  constructor(key: string) {
    super(`Storage conflict on "${key}": a concurrent write updated this value. Reload and retry.`);
    this.name = 'StorageVersionConflictError';
  }
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `supplier-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

async function ensureSchemaVersion(runtime: MondayRuntimeAdapter): Promise<void> {
  const result = await runtime.storage.getItem(STORAGE_SCHEMA_VERSION_KEY);
  if (!result.value) {
    await runtime.storage.setItem(STORAGE_SCHEMA_VERSION_KEY, STORAGE_SCHEMA_VERSION);
  }
}

async function readIndex(runtime: MondayRuntimeAdapter): Promise<{ ids: string[]; version?: string }> {
  const result = await runtime.storage.getItem(STORAGE_SUPPLIER_INDEX_KEY);
  if (!result.value) return { ids: [], version: result.version };
  try {
    return { ids: JSON.parse(result.value) as string[], version: result.version };
  } catch {
    return { ids: [], version: result.version };
  }
}

async function writeIndex(runtime: MondayRuntimeAdapter, ids: string[], previousVersion?: string): Promise<void> {
  const result = await runtime.storage.setItem(STORAGE_SUPPLIER_INDEX_KEY, JSON.stringify(ids), previousVersion ? { previous_version: previousVersion } : undefined);
  if (!result.success) throw new StorageVersionConflictError(STORAGE_SUPPLIER_INDEX_KEY);
}

async function readSupplier(runtime: MondayRuntimeAdapter, supplierId: string): Promise<{ supplier: Supplier | null; version?: string }> {
  const result = await runtime.storage.getItem(STORAGE_SUPPLIER_KEY(supplierId));
  if (!result.value) return { supplier: null, version: result.version };
  try {
    return { supplier: JSON.parse(result.value) as Supplier, version: result.version };
  } catch {
    return { supplier: null, version: result.version };
  }
}

async function writeSupplier(runtime: MondayRuntimeAdapter, supplier: Supplier, previousVersion?: string): Promise<void> {
  const result = await runtime.storage.setItem(STORAGE_SUPPLIER_KEY(supplier.id), JSON.stringify(supplier), previousVersion ? { previous_version: previousVersion } : undefined);
  if (!result.success) throw new StorageVersionConflictError(STORAGE_SUPPLIER_KEY(supplier.id));
}

export function createMondayStorageSupplierRepository(runtime: MondayRuntimeAdapter): SupplierRepository {
  let schemaReady = false;
  const ensureSchema = async () => {
    if (!schemaReady) { await ensureSchemaVersion(runtime); schemaReady = true; }
  };

  return {
    async listForTenant(_tenant: TenantContext): Promise<Supplier[]> {
      await ensureSchema();
      const { ids } = await readIndex(runtime);
      const suppliers: Supplier[] = [];
      for (const id of ids) {
        const { supplier } = await readSupplier(runtime, id);
        if (supplier) suppliers.push(supplier);
      }
      return suppliers;
    },

    async getForTenant(_tenant: TenantContext, supplierId: string): Promise<Supplier | undefined> {
      await ensureSchema();
      const { supplier } = await readSupplier(runtime, supplierId);
      return supplier ?? undefined;
    },

    async createForTenant(_tenant: TenantContext, input: SupplierInput): Promise<Supplier> {
      await ensureSchema();
      const timestamp = now();
      const supplier: Supplier = { ...input, id: newId(), tenantId: _tenant.tenantId, createdAt: timestamp, updatedAt: timestamp };
      await writeSupplier(runtime, supplier);
      const { ids, version } = await readIndex(runtime);
      await writeIndex(runtime, [...ids, supplier.id], version);
      return supplier;
    },

    async updateForTenant(_tenant: TenantContext, supplierId: string, input: SupplierInput): Promise<Supplier> {
      await ensureSchema();
      const { supplier: existing, version } = await readSupplier(runtime, supplierId);
      if (!existing) throw new SupplierNotFoundError();
      const updated: Supplier = { ...existing, ...input, id: existing.id, tenantId: existing.tenantId, createdAt: existing.createdAt, updatedAt: now() };
      await writeSupplier(runtime, updated, version);
      return updated;
    },

    async changeStatusForTenant(_tenant: TenantContext, supplierId: string, status: SupplierStatus): Promise<Supplier> {
      await ensureSchema();
      const { supplier: existing, version } = await readSupplier(runtime, supplierId);
      if (!existing) throw new SupplierNotFoundError();
      const updated: Supplier = { ...existing, status, updatedAt: now() };
      await writeSupplier(runtime, updated, version);
      return updated;
    },

    async getSourceConfiguration(_tenant: TenantContext): Promise<SupplierSourceConfiguration | undefined> {
      const result = await runtime.storage.getItem(STORAGE_SOURCE_CONFIG_KEY);
      if (!result.value) return undefined;
      try { return JSON.parse(result.value) as SupplierSourceConfiguration; } catch { return undefined; }
    },

    async saveSourceConfiguration(_tenant: TenantContext, configuration: SupplierSourceConfiguration): Promise<SupplierSourceConfiguration> {
      const existing = await runtime.storage.getItem(STORAGE_SOURCE_CONFIG_KEY);
      const result = await runtime.storage.setItem(STORAGE_SOURCE_CONFIG_KEY, JSON.stringify(configuration), existing.version ? { previous_version: existing.version } : undefined);
      if (!result.success) throw new StorageVersionConflictError(STORAGE_SOURCE_CONFIG_KEY);
      return configuration;
    },
  };
}
