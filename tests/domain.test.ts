import { describe, expect, it } from 'vitest';
import { isValidSourcingEvent } from '../src/shared/validation/domain';

const valid = { id: 'rfq-1', tenantId: 'tenant-1', title: 'Packaging', status: 'active' as const, deadline: '2026-09-03', currency: 'EUR', createdAt: '2026-08-01', createdBy: 'user-1', supplierResponseCount: 2, supplierCount: 4 };
describe('sourcing event validation', () => { it('accepts a valid event', () => expect(isValidSourcingEvent(valid)).toBe(true)); it('rejects response counts above invited suppliers', () => expect(isValidSourcingEvent({ ...valid, supplierResponseCount: 5 })).toBe(false)); it('rejects missing title', () => expect(isValidSourcingEvent({ ...valid, title: '' })).toBe(false)); });
