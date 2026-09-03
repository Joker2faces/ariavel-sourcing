import type { SourcingEvent, SourcingEventInput, SourcingEventStatus, SourcingLine, SourcingSupplierSelection, Supplier } from '../../shared/types/domain';
import type { TenantContextProvider } from '../tenancy/tenantContext';
import type { SourcingEventRepository } from '../repositories/sourcingEventRepository';
import type { SupplierService } from './supplierService';
import { SourcingEventNotFoundError } from '../repositories/inMemorySourcingEventRepository';
import { StorageVersionConflictError } from '../repositories/mondayStorageSupplierRepository';
import { normalizeSourcingEventInput, validateReadyForInvitation, validateSourcingEventInput } from '../../shared/validation/sourcingEventValidation';
import { isClosingSoon, isOverdue } from '../../shared/utils/deadline';
import { generateReference } from '../../shared/utils/reference';
import { isEligibleForSelection } from '../../shared/validation/sourcingEventValidation';

export { SourcingEventNotFoundError, StorageVersionConflictError };

export class SourcingEventValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super('Sourcing event validation failed.');
    this.name = 'SourcingEventValidationError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: SourcingEventStatus, to: SourcingEventStatus) {
    super(`Cannot transition from ${from} to ${to}.`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class DuplicateReferenceError extends Error {
  constructor(reference: string) {
    super(`Reference "${reference}" is already in use.`);
    this.name = 'DuplicateReferenceError';
  }
}

export interface SourcingEventFilters {
  search?: string;
  status?: SourcingEventStatus | '';
  currency?: string;
  category?: string;
  deadlineState?: 'upcoming' | 'overdue' | 'closing_soon' | 'none' | '';
}

export interface SourcingEventSummary {
  total: number;
  draft: number;
  readyForInvitation: number;
  closingSoon: number;
  cancelled: number;
}

export interface NewLineId { id: string; }

const ALLOWED_TRANSITIONS: Record<SourcingEventStatus, SourcingEventStatus[]> = {
  DRAFT: ['READY_FOR_INVITATION', 'CANCELLED'],
  READY_FOR_INVITATION: ['DRAFT', 'CANCELLED'],
  CANCELLED: [],
};

function lineId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createSourcingEventService(
  repository: SourcingEventRepository,
  tenantProvider: TenantContextProvider,
  supplierService: SupplierService,
) {
  const tenant = () => tenantProvider.getTenantContext();

  async function ensureReferenceUnique(reference: string, excludeId?: string): Promise<void> {
    const all = await repository.listForTenant(tenant());
    const conflict = all.find(e => e.reference === reference && e.id !== excludeId);
    if (conflict) throw new DuplicateReferenceError(reference);
  }

  return {
    async list(filters: SourcingEventFilters = {}): Promise<SourcingEvent[]> {
      const all = await repository.listForTenant(tenant());
      const query = filters.search?.trim().toLowerCase() ?? '';
      const now = new Date();
      return all.filter(e => {
        const searchable = [e.reference, e.title, e.category, e.description].filter(Boolean).join(' ').toLowerCase();
        if (query && !searchable.includes(query)) return false;
        if (filters.status && e.status !== filters.status) return false;
        if (filters.currency && e.currency !== filters.currency) return false;
        if (filters.category && e.category !== filters.category) return false;
        if (filters.deadlineState) {
          if (filters.deadlineState === 'none' && e.deadline) return false;
          if (filters.deadlineState === 'overdue' && (!e.deadline || !isOverdue(e.deadline, now))) return false;
          if (filters.deadlineState === 'closing_soon' && (!e.deadline || !isClosingSoon(e.deadline, now))) return false;
          if (filters.deadlineState === 'upcoming' && (!e.deadline || isOverdue(e.deadline, now))) return false;
        }
        return true;
      }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    get: (id: string) => repository.getForTenant(tenant(), id),

    async getSummary(): Promise<SourcingEventSummary> {
      const all = await repository.listForTenant(tenant());
      const active = all.filter(e => e.status !== 'CANCELLED');
      const now = new Date();
      return {
        total: active.length,
        draft: all.filter(e => e.status === 'DRAFT').length,
        readyForInvitation: all.filter(e => e.status === 'READY_FOR_INVITATION').length,
        closingSoon: active.filter(e => e.deadline && isClosingSoon(e.deadline, now)).length,
        cancelled: all.filter(e => e.status === 'CANCELLED').length,
      };
    },

    generateReference: () => generateReference(),

    async create(input: SourcingEventInput, ownerUserId: string): Promise<SourcingEvent> {
      const { valid, errors, value } = validateSourcingEventInput(input);
      if (!valid) throw new SourcingEventValidationError(errors as Record<string, string>);
      await ensureReferenceUnique(value.reference);
      return repository.createForTenant(tenant(), value, ownerUserId);
    },

    async update(id: string, input: SourcingEventInput, updatedByUserId: string): Promise<SourcingEvent> {
      const existing = await repository.getForTenant(tenant(), id);
      if (!existing) throw new SourcingEventNotFoundError();
      if (existing.status === 'CANCELLED') throw new InvalidStatusTransitionError('CANCELLED', existing.status);
      const { valid, errors, value } = validateSourcingEventInput(input);
      if (!valid) throw new SourcingEventValidationError(errors as Record<string, string>);
      await ensureReferenceUnique(value.reference, id);
      return repository.updateForTenant(tenant(), id, value, updatedByUserId);
    },

    async changeStatus(id: string, status: SourcingEventStatus, updatedByUserId: string): Promise<SourcingEvent> {
      const existing = await repository.getForTenant(tenant(), id);
      if (!existing) throw new SourcingEventNotFoundError();
      if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
        throw new InvalidStatusTransitionError(existing.status, status);
      }
      if (status === 'READY_FOR_INVITATION') {
        const { valid, errors } = validateReadyForInvitation(existing);
        if (!valid) throw new SourcingEventValidationError(errors as Record<string, string>);
      }
      return repository.changeStatusForTenant(tenant(), id, status, updatedByUserId);
    },

    addLine(lines: SourcingLine[], description: string): SourcingLine[] {
      return [...lines, { id: lineId(), description, quantity: 1, unit: 'pcs' }];
    },

    updateLine(lines: SourcingLine[], updated: SourcingLine): SourcingLine[] {
      return lines.map(l => l.id === updated.id ? { ...updated } : l);
    },

    removeLine(lines: SourcingLine[], lineId: string): SourcingLine[] {
      return lines.filter(l => l.id !== lineId);
    },

    duplicateLine(lines: SourcingLine[], lineId: string): SourcingLine[] {
      const original = lines.find(l => l.id === lineId);
      if (!original) return lines;
      return [...lines, { ...original, id: globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}` }];
    },

    async listEligibleSuppliers(): Promise<Supplier[]> {
      const config = await supplierService.getSourceConfiguration();
      let all: Supplier[];
      if (config?.mode === 'MONDAY_BOARD' && supplierService.listBoardSuppliers) {
        const { suppliers } = await supplierService.listBoardSuppliers();
        all = suppliers;
      } else {
        all = await supplierService.list();
      }
      return all.filter(s => isEligibleForSelection(s.status));
    },

    buildSupplierSelection(supplier: Supplier): SourcingSupplierSelection {
      return {
        supplierId: supplier.id,
        source: supplier.sourceType === 'MONDAY_BOARD' ? 'MONDAY_BOARD' : 'ARIAVEL',
        mondayBoardId: supplier.mondayBoardId,
        mondayItemId: supplier.mondayItemId,
        supplierNameSnapshot: supplier.name,
        supplierCodeSnapshot: supplier.supplierCode,
        emailSnapshot: supplier.email,
        selectedAt: new Date().toISOString(),
      };
    },

    validateReady: (event: SourcingEvent) => validateReadyForInvitation(event),

    async duplicate(id: string, ownerUserId: string): Promise<SourcingEvent> {
      const existing = await repository.getForTenant(tenant(), id);
      if (!existing) throw new SourcingEventNotFoundError();
      const ref = generateReference();
      const input: SourcingEventInput = {
        reference: ref,
        title: `Copy of ${existing.title}`,
        description: existing.description,
        currency: existing.currency,
        deadline: undefined,
        targetDeliveryDate: existing.targetDeliveryDate,
        category: existing.category,
        ownerUserId,
        ownerName: existing.ownerName,
        lines: existing.lines.map(l => ({ ...l, id: lineId() })),
        supplierSelections: existing.supplierSelections.map(s => ({ ...s, selectedAt: new Date().toISOString() })),
        internalNotes: existing.internalNotes,
      };
      const normalized = normalizeSourcingEventInput(input);
      return repository.createForTenant(tenant(), normalized, ownerUserId);
    },
  };
}

export type SourcingEventService = ReturnType<typeof createSourcingEventService>;
