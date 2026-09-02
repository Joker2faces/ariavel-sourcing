import type { Supplier, SupplierSourceConfiguration, SupplierStatus } from '../../shared/types/domain';
import type { TenantContext } from '../tenancy/tenantContext';
import type { SupplierRepository } from './supplierRepository';

export class SupplierNotFoundError extends Error {
  constructor() { super('Supplier was not found.'); this.name = 'SupplierNotFoundError'; }
}

interface RepositoryOptions { now?: () => string; createId?: () => string; }
const copySupplier = (supplier: Supplier): Supplier => ({ ...supplier });
const copyConfiguration = (configuration: SupplierSourceConfiguration): SupplierSourceConfiguration => configuration.mode === 'ARIAVEL'
  ? { mode: 'ARIAVEL' }
  : { mode: 'MONDAY_BOARD', boardMapping: { ...configuration.boardMapping, fieldMappings: configuration.boardMapping.fieldMappings.map(mapping => ({ ...mapping })) } };

export function createInMemorySupplierRepository(initial: Supplier[] = [], options: RepositoryOptions = {}): SupplierRepository {
  const records = new Map(initial.map(supplier => [supplier.id, copySupplier(supplier)]));
  const configurations = new Map<string, SupplierSourceConfiguration>();
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => globalThis.crypto?.randomUUID?.() ?? `supplier-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const find = (tenant: TenantContext, supplierId: string) => {
    const supplier = records.get(supplierId);
    return supplier?.tenantId === tenant.tenantId ? supplier : undefined;
  };
  return {
    async listForTenant(tenant) { return [...records.values()].filter(record => record.tenantId === tenant.tenantId).map(copySupplier); },
    async getForTenant(tenant, supplierId) { const supplier = find(tenant, supplierId); return supplier ? copySupplier(supplier) : undefined; },
    async createForTenant(tenant, input) {
      const timestamp = now();
      const supplier: Supplier = { ...input, id: createId(), tenantId: tenant.tenantId, createdAt: timestamp, updatedAt: timestamp };
      records.set(supplier.id, copySupplier(supplier));
      return copySupplier(supplier);
    },
    async updateForTenant(tenant, supplierId, input) {
      const existing = find(tenant, supplierId);
      if (!existing) throw new SupplierNotFoundError();
      const supplier = { ...existing, ...input, id: existing.id, tenantId: existing.tenantId, createdAt: existing.createdAt, updatedAt: now() };
      records.set(supplierId, copySupplier(supplier));
      return copySupplier(supplier);
    },
    async changeStatusForTenant(tenant, supplierId, status: SupplierStatus) {
      const existing = find(tenant, supplierId);
      if (!existing) throw new SupplierNotFoundError();
      const supplier = { ...existing, status, updatedAt: now() };
      records.set(supplierId, copySupplier(supplier));
      return copySupplier(supplier);
    },
    async getSourceConfiguration(tenant) { const value = configurations.get(tenant.tenantId); return value ? copyConfiguration(value) : undefined; },
    async saveSourceConfiguration(tenant, configuration) { const copy = copyConfiguration(configuration); configurations.set(tenant.tenantId, copy); return copyConfiguration(copy); },
  };
}
