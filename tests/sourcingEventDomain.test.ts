import { describe, expect, it } from 'vitest';
import {
  validateSourcingEventInput,
  validateSourcingLine,
  validateReadyForInvitation,
  normalizeSourcingEventInput,
} from '../src/shared/validation/sourcingEventValidation';
import type { SourcingEvent, SourcingEventInput } from '../src/shared/types/domain';

function baseInput(overrides: Partial<SourcingEventInput> = {}): SourcingEventInput {
  return {
    reference: 'RFQ-2026-A7K3',
    title: 'Industrial Solvents Q4',
    currency: 'EUR',
    ownerUserId: 'user-1',
    lines: [],
    supplierSelections: [],
    ...overrides,
  };
}

function baseEvent(overrides: Partial<SourcingEvent> = {}): SourcingEvent {
  return {
    id: 'evt-1',
    tenantId: 'tenant-1',
    reference: 'RFQ-2026-A7K3',
    title: 'Industrial Solvents Q4',
    status: 'DRAFT',
    currency: 'EUR',
    ownerUserId: 'user-1',
    lines: [{ id: 'l1', description: 'Ethanol 99%', quantity: 500, unit: 'L' }],
    supplierSelections: [{ supplierId: 's1', source: 'ARIAVEL', supplierNameSnapshot: 'Chemco', emailSnapshot: 'orders@chemco.example', selectedAt: '2026-09-01T00:00:00Z' }],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    ...overrides,
  };
}

describe('normalizeSourcingEventInput', () => {
  it('uppercases currency', () => {
    const n = normalizeSourcingEventInput(baseInput({ currency: 'eur' }));
    expect(n.currency).toBe('EUR');
  });

  it('trims whitespace from title and reference', () => {
    const n = normalizeSourcingEventInput(baseInput({ title: '  Solvents  ', reference: ' RFQ-2026-A1  ' }));
    expect(n.title).toBe('Solvents');
    expect(n.reference).toBe('RFQ-2026-A1');
  });

  it('converts empty optional strings to undefined', () => {
    const n = normalizeSourcingEventInput(baseInput({ description: '  ', category: '' }));
    expect(n.description).toBeUndefined();
    expect(n.category).toBeUndefined();
  });
});

describe('validateSourcingEventInput', () => {
  it('accepts a valid input', () => {
    const { valid } = validateSourcingEventInput(baseInput());
    expect(valid).toBe(true);
  });

  it('rejects missing reference', () => {
    const { valid, errors } = validateSourcingEventInput(baseInput({ reference: '' }));
    expect(valid).toBe(false);
    expect(errors.reference).toBeTruthy();
  });

  it('rejects missing title', () => {
    const { valid, errors } = validateSourcingEventInput(baseInput({ title: '' }));
    expect(valid).toBe(false);
    expect(errors.title).toBeTruthy();
  });

  it('rejects invalid currency', () => {
    const { valid, errors } = validateSourcingEventInput(baseInput({ currency: 'EE' }));
    expect(valid).toBe(false);
    expect(errors.currency).toBeTruthy();
  });

  it('accepts valid 3-letter currency', () => {
    const { valid } = validateSourcingEventInput(baseInput({ currency: 'USD' }));
    expect(valid).toBe(true);
  });

  it('rejects invalid date in deadline', () => {
    const { valid, errors } = validateSourcingEventInput(baseInput({ deadline: 'not-a-date' }));
    expect(valid).toBe(false);
    expect(errors.deadline).toBeTruthy();
  });

  it('accepts valid ISO deadline', () => {
    const { valid } = validateSourcingEventInput(baseInput({ deadline: '2026-12-31' }));
    expect(valid).toBe(true);
  });

  it('rejects reference longer than 50 chars', () => {
    const { valid, errors } = validateSourcingEventInput(baseInput({ reference: 'R'.repeat(51) }));
    expect(valid).toBe(false);
    expect(errors.reference).toBeTruthy();
  });
});

describe('validateSourcingLine', () => {
  it('accepts a valid line', () => {
    const errors = validateSourcingLine({ id: 'l1', description: 'Ethanol 99%', quantity: 500, unit: 'L' });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('rejects missing description', () => {
    const errors = validateSourcingLine({ id: 'l1', description: '', quantity: 1, unit: 'pcs' });
    expect(errors.description).toBeTruthy();
  });

  it('rejects zero quantity', () => {
    const errors = validateSourcingLine({ id: 'l1', description: 'Item', quantity: 0, unit: 'pcs' });
    expect(errors.quantity).toBeTruthy();
  });

  it('rejects negative quantity', () => {
    const errors = validateSourcingLine({ id: 'l1', description: 'Item', quantity: -1, unit: 'pcs' });
    expect(errors.quantity).toBeTruthy();
  });

  it('rejects missing unit', () => {
    const errors = validateSourcingLine({ id: 'l1', description: 'Item', quantity: 1, unit: '' });
    expect(errors.unit).toBeTruthy();
  });

  it('rejects negative target price', () => {
    const errors = validateSourcingLine({ id: 'l1', description: 'Item', quantity: 1, unit: 'pcs', targetUnitPrice: -0.01 });
    expect(errors.targetUnitPrice).toBeTruthy();
  });

  it('accepts zero target price', () => {
    const errors = validateSourcingLine({ id: 'l1', description: 'Item', quantity: 1, unit: 'pcs', targetUnitPrice: 0 });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describe('validateReadyForInvitation', () => {
  it('passes for a fully valid event', () => {
    const { valid } = validateReadyForInvitation(baseEvent());
    expect(valid).toBe(true);
  });

  it('fails when no lines', () => {
    const { valid, errors } = validateReadyForInvitation(baseEvent({ lines: [] }));
    expect(valid).toBe(false);
    expect(errors.lines).toBeTruthy();
  });

  it('fails when no suppliers selected', () => {
    const { valid, errors } = validateReadyForInvitation(baseEvent({ supplierSelections: [] }));
    expect(valid).toBe(false);
    expect(errors.suppliers).toBeTruthy();
  });

  it('warns when selected supplier has no email', () => {
    const event = baseEvent({
      supplierSelections: [{ supplierId: 's1', source: 'ARIAVEL', supplierNameSnapshot: 'Chemco', selectedAt: '2026-09-01T00:00:00Z' }],
    });
    const { valid, warnings } = validateReadyForInvitation(event);
    expect(valid).toBe(true);
    expect(warnings.some(w => w.includes('email'))).toBe(true);
  });

  it('fails when title is missing', () => {
    const { valid, errors } = validateReadyForInvitation(baseEvent({ title: '' }));
    expect(valid).toBe(false);
    expect(errors.title).toBeTruthy();
  });

  it('fails when currency is missing', () => {
    const { valid, errors } = validateReadyForInvitation(baseEvent({ currency: '' }));
    expect(valid).toBe(false);
    expect(errors.currency).toBeTruthy();
  });
});

describe('deadline utilities', () => {
  it('isOverdue returns true when deadline is in the past', async () => {
    const { isOverdue } = await import('../src/shared/utils/deadline');
    expect(isOverdue('2020-01-01', new Date('2026-09-01T00:00:00Z'))).toBe(true);
  });

  it('isOverdue returns false when deadline is in the future', async () => {
    const { isOverdue } = await import('../src/shared/utils/deadline');
    expect(isOverdue('2030-12-31', new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });

  it('isClosingSoon returns true within 3 days', async () => {
    const { isClosingSoon } = await import('../src/shared/utils/deadline');
    const now = new Date('2026-09-01T00:00:00Z');
    expect(isClosingSoon('2026-09-03', now)).toBe(true);
  });

  it('isClosingSoon returns false beyond 3 days', async () => {
    const { isClosingSoon } = await import('../src/shared/utils/deadline');
    const now = new Date('2026-09-01T00:00:00Z');
    expect(isClosingSoon('2026-09-10', now)).toBe(false);
  });

  it('generateReference produces RFQ-YYYY-XXXXX pattern', async () => {
    const { generateReference } = await import('../src/shared/utils/reference');
    const ref = generateReference(2026);
    expect(ref).toMatch(/^RFQ-2026-[A-Z0-9]{5}$/);
  });
});
