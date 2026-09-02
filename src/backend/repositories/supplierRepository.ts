import type { Supplier, SupplierInput, SupplierSourceConfiguration, SupplierStatus } from '../../shared/types/domain';
import type { TenantContext } from '../tenancy/tenantContext';

export interface SupplierRepository {
  listForTenant(tenant: TenantContext): Promise<Supplier[]>;
  getForTenant(tenant: TenantContext, supplierId: string): Promise<Supplier | undefined>;
  createForTenant(tenant: TenantContext, input: SupplierInput): Promise<Supplier>;
  updateForTenant(tenant: TenantContext, supplierId: string, input: SupplierInput): Promise<Supplier>;
  changeStatusForTenant(tenant: TenantContext, supplierId: string, status: SupplierStatus): Promise<Supplier>;
  getSourceConfiguration(tenant: TenantContext): Promise<SupplierSourceConfiguration | undefined>;
  saveSourceConfiguration(tenant: TenantContext, configuration: SupplierSourceConfiguration): Promise<SupplierSourceConfiguration>;
}
