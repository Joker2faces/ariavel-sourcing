import type { SourcingEvent } from '../types/domain';

export function isValidSourcingEvent(event: SourcingEvent): boolean {
  return Boolean(event.id && event.tenantId && event.title && event.deadline && event.currency && event.supplierCount >= event.supplierResponseCount && event.supplierResponseCount >= 0);
}
