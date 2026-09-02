import type { SupplierInput, SupplierStatus } from '../types/domain';

export type SupplierValidationErrors = Partial<Record<keyof SupplierInput, string>>;
const statuses = new Set<SupplierStatus>(['ACTIVE', 'PENDING', 'INACTIVE', 'BLOCKED']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const currencyPattern = /^[A-Z]{3}$/;

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function normalizeSupplierInput(input: SupplierInput): SupplierInput {
  return {
    ...input,
    name: input.name.trim(),
    supplierCode: optionalText(input.supplierCode),
    category: optionalText(input.category),
    country: optionalText(input.country),
    primaryContactName: optionalText(input.primaryContactName),
    email: optionalText(input.email)?.toLowerCase(),
    phone: optionalText(input.phone),
    currency: optionalText(input.currency)?.toUpperCase(),
    paymentTerms: optionalText(input.paymentTerms),
    defaultIncoterm: optionalText(input.defaultIncoterm)?.toUpperCase(),
    notes: optionalText(input.notes),
    mondayBoardId: optionalText(input.mondayBoardId),
    mondayItemId: optionalText(input.mondayItemId),
  };
}

export function validateSupplierInput(input: SupplierInput): { valid: boolean; errors: SupplierValidationErrors; value: SupplierInput } {
  const value = normalizeSupplierInput(input);
  const errors: SupplierValidationErrors = {};
  if (!value.name) errors.name = 'Supplier name is required.';
  else if (value.name.length > 120) errors.name = 'Supplier name must be 120 characters or fewer.';
  if (value.supplierCode && value.supplierCode.length > 40) errors.supplierCode = 'Supplier code must be 40 characters or fewer.';
  if (value.email && !emailPattern.test(value.email)) errors.email = 'Enter a valid email address.';
  if (value.currency && !currencyPattern.test(value.currency)) errors.currency = 'Use a three-letter currency code.';
  if (value.rating !== undefined && (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5)) errors.rating = 'Rating must be a whole number from 1 to 5.';
  if (!statuses.has(value.status)) errors.status = 'Select a valid supplier status.';
  return { valid: Object.keys(errors).length === 0, errors, value };
}
