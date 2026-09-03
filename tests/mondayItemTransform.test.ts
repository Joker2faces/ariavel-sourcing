import { describe, expect, it } from 'vitest';
import { transformMondayItemToInput } from '../src/shared/mapping/supplierMapping';
import type { MondayItemDescriptor, SupplierFieldMapping } from '../src/shared/types/domain';

function item(overrides: Partial<MondayItemDescriptor> = {}): MondayItemDescriptor {
  return { id: 'i1', name: 'Test Supplier', columnValues: {}, ...overrides };
}

const nameMapping: SupplierFieldMapping = { supplierField: 'name', mondayColumnId: 'name' };
const emailMapping: SupplierFieldMapping = { supplierField: 'email', mondayColumnId: 'email_col' };
const statusMapping: SupplierFieldMapping = { supplierField: 'status', mondayColumnId: 'status_col' };
const ratingMapping: SupplierFieldMapping = { supplierField: 'rating', mondayColumnId: 'rating_col' };
const preferredMapping: SupplierFieldMapping = { supplierField: 'preferred', mondayColumnId: 'pref_col' };

describe('transformMondayItemToInput', () => {
  it('produces valid SupplierInput from name-only mapping', () => {
    const { input, warnings } = transformMondayItemToInput(item(), [nameMapping]);
    expect(input).not.toBeNull();
    expect(input?.name).toBe('Test Supplier');
    expect(input?.sourceType).toBe('MONDAY_BOARD');
    expect(warnings).toHaveLength(0);
  });

  it('returns null input and warning when name is missing', () => {
    const { input, warnings } = transformMondayItemToInput(item({ name: '' }), [nameMapping]);
    expect(input).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe('name');
  });

  it('maps email column correctly', () => {
    const { input } = transformMondayItemToInput(
      item({ columnValues: { email_col: 'test@example.com' } }),
      [nameMapping, emailMapping],
    );
    expect(input?.email).toBe('test@example.com');
  });

  it('normalizes known status aliases', () => {
    const { input: approved } = transformMondayItemToInput(item({ columnValues: { status_col: 'Approved' } }), [nameMapping, statusMapping]);
    expect(approved?.status).toBe('ACTIVE');
    const { input: onboarding } = transformMondayItemToInput(item({ columnValues: { status_col: 'Onboarding' } }), [nameMapping, statusMapping]);
    expect(onboarding?.status).toBe('PENDING');
    const { input: suspended } = transformMondayItemToInput(item({ columnValues: { status_col: 'Suspended' } }), [nameMapping, statusMapping]);
    expect(suspended?.status).toBe('BLOCKED');
  });

  it('defaults to ACTIVE when status column not mapped or unrecognised', () => {
    const { input } = transformMondayItemToInput(item(), [nameMapping]);
    expect(input?.status).toBe('ACTIVE');
  });

  it('parses valid integer rating 1–5', () => {
    const { input, warnings } = transformMondayItemToInput(item({ columnValues: { rating_col: '4' } }), [nameMapping, ratingMapping]);
    expect(input?.rating).toBe(4);
    expect(warnings).toHaveLength(0);
  });

  it('rejects out-of-range rating and emits warning', () => {
    const { input, warnings } = transformMondayItemToInput(item({ columnValues: { rating_col: '6' } }), [nameMapping, ratingMapping]);
    expect(input?.rating).toBeUndefined();
    expect(warnings.some(w => w.field === 'rating')).toBe(true);
  });

  it('normalizes preferred to true for truthy values', () => {
    for (const val of ['true', 'yes', '1', 'checked', 'True', 'YES']) {
      const { input } = transformMondayItemToInput(item({ columnValues: { pref_col: val } }), [nameMapping, preferredMapping]);
      expect(input?.preferred).toBe(true);
    }
  });

  it('normalizes preferred to false for absent or falsy values', () => {
    const { input } = transformMondayItemToInput(item({ columnValues: { pref_col: 'false' } }), [nameMapping, preferredMapping]);
    expect(input?.preferred).toBe(false);
    const { input: no } = transformMondayItemToInput(item(), [nameMapping, preferredMapping]);
    expect(no?.preferred).toBe(false);
  });

  it('sets mondayItemId from item ID', () => {
    const { input } = transformMondayItemToInput(item({ id: 'real-item-99' }), [nameMapping]);
    expect(input?.mondayItemId).toBe('real-item-99');
  });

  it('handles null column values gracefully', () => {
    const { input, warnings } = transformMondayItemToInput(
      item({ columnValues: { email_col: null } }),
      [nameMapping, emailMapping],
    );
    expect(input?.email).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });
});
