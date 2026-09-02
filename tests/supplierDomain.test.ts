import { describe, expect, it } from 'vitest';
import { normalizeSupplierInput, validateSupplierInput } from '../src/shared/validation/supplierValidation';
import type { SupplierInput } from '../src/shared/types/domain';

const validInput: SupplierInput = {
  name: 'Acme Materials',
  status: 'ACTIVE',
  email: 'quotes@acme.example',
  currency: 'EUR',
  rating: 4,
  preferred: false,
  sourceType: 'ARIAVEL',
};

describe('supplier validation', () => {
  it('rejects a supplier whose trimmed name is empty', () => {
    expect(validateSupplierInput({ ...validInput, name: '   ' }).errors.name).toBe('Supplier name is required.');
  });

  it('rejects malformed optional email addresses', () => {
    expect(validateSupplierInput({ ...validInput, email: 'not-an-email' }).errors.email).toBe('Enter a valid email address.');
  });

  it.each(['EU', 'euro', '12A'])('rejects invalid currency %s', currency => {
    expect(validateSupplierInput({ ...validInput, currency }).errors.currency).toBe('Use a three-letter currency code.');
  });

  it.each([0, 6, 2.5])('rejects rating %s outside the integer 1–5 range', rating => {
    expect(validateSupplierInput({ ...validInput, rating }).errors.rating).toBe('Rating must be a whole number from 1 to 5.');
  });

  it('rejects a status outside the supplier status domain', () => {
    const result = validateSupplierInput({ ...validInput, status: 'ARCHIVED' as SupplierInput['status'] });
    expect(result.errors.status).toBe('Select a valid supplier status.');
  });

  it('normalizes whitespace, empty optionals and commercial codes', () => {
    expect(normalizeSupplierInput({
      ...validInput,
      name: '  Acme Materials  ',
      supplierCode: '  AC-100  ',
      country: '   ',
      currency: ' eur ',
      defaultIncoterm: ' dap ',
    })).toEqual({
      ...validInput,
      name: 'Acme Materials',
      supplierCode: 'AC-100',
      country: undefined,
      currency: 'EUR',
      defaultIncoterm: 'DAP',
    });
  });

  it('accepts a normalized valid supplier', () => {
    expect(validateSupplierInput(validInput)).toEqual({ valid: true, errors: {}, value: validInput });
  });
});
