import type { SourcingEvent, SourcingEventInput, SourcingLine, SourcingSupplierSelection } from '../types/domain';

export interface SourcingLineErrors {
  description?: string;
  quantity?: string;
  unit?: string;
  targetUnitPrice?: string;
}

export interface SourcingEventErrors {
  reference?: string;
  title?: string;
  currency?: string;
  deadline?: string;
  lines?: string;
  suppliers?: string;
}

export interface ReadyForInvitationErrors extends SourcingEventErrors {
  lineErrors?: SourcingLineErrors[];
  supplierWarnings?: string[];
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function optText(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

export function normalizeSourcingEventInput(input: SourcingEventInput): SourcingEventInput {
  return {
    ...input,
    reference: input.reference.trim(),
    title: input.title.trim(),
    description: optText(input.description),
    currency: input.currency.trim().toUpperCase(),
    deadline: optText(input.deadline),
    targetDeliveryDate: optText(input.targetDeliveryDate),
    category: optText(input.category),
    ownerUserId: input.ownerUserId.trim(),
    ownerName: optText(input.ownerName),
    internalNotes: optText(input.internalNotes),
    lines: input.lines.map(normalizeLine),
  };
}

export function normalizeLine(line: SourcingLine): SourcingLine {
  return {
    ...line,
    description: line.description.trim(),
    sku: optText(line.sku),
    unit: line.unit.trim(),
    category: optText(line.category),
    specification: optText(line.specification),
    requestedDeliveryDate: optText(line.requestedDeliveryDate),
  };
}

export function validateSourcingLine(line: SourcingLine): SourcingLineErrors {
  const errors: SourcingLineErrors = {};
  const normalized = normalizeLine(line);
  if (!normalized.description) errors.description = 'Item description is required.';
  else if (normalized.description.length > 200) errors.description = 'Description must be 200 characters or fewer.';
  if (!Number.isFinite(normalized.quantity) || normalized.quantity <= 0) errors.quantity = 'Quantity must be greater than zero.';
  if (!normalized.unit) errors.unit = 'Unit is required.';
  if (normalized.targetUnitPrice !== undefined && (normalized.targetUnitPrice < 0 || !Number.isFinite(normalized.targetUnitPrice))) errors.targetUnitPrice = 'Target unit price must be zero or greater.';
  return errors;
}

export function validateSourcingEventInput(input: SourcingEventInput): { valid: boolean; errors: SourcingEventErrors; value: SourcingEventInput } {
  const value = normalizeSourcingEventInput(input);
  const errors: SourcingEventErrors = {};
  if (!value.reference) errors.reference = 'Reference is required.';
  else if (value.reference.length > 50) errors.reference = 'Reference must be 50 characters or fewer.';
  if (!value.title) errors.title = 'Event title is required.';
  else if (value.title.length > 120) errors.title = 'Title must be 120 characters or fewer.';
  if (!value.currency) errors.currency = 'Currency is required.';
  else if (!CURRENCY_PATTERN.test(value.currency)) errors.currency = 'Enter a three-letter currency code (e.g. EUR).';
  if (value.deadline && !ISO_DATE_PATTERN.test(value.deadline)) errors.deadline = 'Deadline must be a valid date.';
  return { valid: Object.keys(errors).length === 0, errors, value };
}

export function validateReadyForInvitation(event: SourcingEvent): { valid: boolean; errors: ReadyForInvitationErrors; warnings: string[] } {
  const errors: ReadyForInvitationErrors = {};
  const warnings: string[] = [];

  if (!event.reference) errors.reference = 'Reference is required.';
  if (!event.title) errors.title = 'Event title is required.';
  if (!event.currency || !CURRENCY_PATTERN.test(event.currency)) errors.currency = 'A valid currency code is required.';
  if (event.deadline && !ISO_DATE_PATTERN.test(event.deadline)) errors.deadline = 'Deadline must be a valid date.';

  if (event.lines.length === 0) {
    errors.lines = 'At least one line item is required.';
  } else {
    const lineErrors = event.lines.map(validateSourcingLine);
    const hasLineErrors = lineErrors.some(e => Object.keys(e).length > 0);
    if (hasLineErrors) {
      errors.lines = 'One or more line items have validation errors.';
      errors.lineErrors = lineErrors;
    }
  }

  if (event.supplierSelections.length === 0) {
    errors.suppliers = 'At least one supplier must be selected.';
  } else {
    const missing = event.supplierSelections.filter(s => !s.emailSnapshot);
    if (missing.length > 0) {
      warnings.push(`${missing.length} selected supplier${missing.length > 1 ? 's have' : ' has'} no email address. Invitation may not be possible.`);
    }
  }

  return { valid: Object.keys(errors).filter(k => k !== 'lineErrors' && k !== 'supplierWarnings').length === 0, errors, warnings };
}

export function validateSupplierSelectionEligibility(selection: SourcingSupplierSelection): string | null {
  if (!selection.supplierId) return 'Supplier ID is required.';
  if (!selection.supplierNameSnapshot) return 'Supplier name snapshot is required.';
  return null;
}

export function isEligibleForSelection(status: string): boolean {
  return status === 'ACTIVE';
}
