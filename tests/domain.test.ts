import { describe, expect, it } from 'vitest';
import { isValidSourcingEvent } from '../src/shared/validation/domain';
import type { SourcingEvent } from '../src/shared/types/domain';

const valid: SourcingEvent = {
  id: 'rfq-1',
  tenantId: 'tenant-1',
  reference: 'RFQ-2026-A7K3',
  title: 'Packaging Materials Q4',
  status: 'DRAFT',
  currency: 'EUR',
  ownerUserId: 'user-1',
  lines: [],
  supplierSelections: [],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
};

describe('isValidSourcingEvent', () => {
  it('accepts a valid M4 event', () => expect(isValidSourcingEvent(valid)).toBe(true));
  it('rejects missing title', () => expect(isValidSourcingEvent({ ...valid, title: '' })).toBe(false));
  it('rejects missing reference', () => expect(isValidSourcingEvent({ ...valid, reference: '' })).toBe(false));
  it('rejects missing currency', () => expect(isValidSourcingEvent({ ...valid, currency: '' })).toBe(false));
});
