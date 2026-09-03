import type { SourcingEvent } from '../types/domain';

export function isValidSourcingEvent(event: SourcingEvent): boolean {
  return Boolean(
    event.id &&
    event.tenantId &&
    event.reference &&
    event.title &&
    event.currency &&
    event.ownerUserId &&
    Array.isArray(event.lines) &&
    Array.isArray(event.supplierSelections),
  );
}
