import type { SourcingEvent, SourcingEventInput, SourcingEventStatus } from '../../shared/types/domain';
import type { TenantContext } from '../tenancy/tenantContext';

export interface SourcingEventRepository {
  listForTenant(tenant: TenantContext): Promise<SourcingEvent[]>;
  getForTenant(tenant: TenantContext, eventId: string): Promise<SourcingEvent | undefined>;
  createForTenant(tenant: TenantContext, input: SourcingEventInput, ownerUserId: string): Promise<SourcingEvent>;
  updateForTenant(tenant: TenantContext, eventId: string, input: SourcingEventInput, updatedByUserId: string): Promise<SourcingEvent>;
  changeStatusForTenant(tenant: TenantContext, eventId: string, status: SourcingEventStatus, updatedByUserId: string): Promise<SourcingEvent>;
}
