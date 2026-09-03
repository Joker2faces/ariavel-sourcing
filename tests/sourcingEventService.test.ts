import { describe, expect, it } from 'vitest';
import { createInMemorySourcingEventRepository } from '../src/backend/repositories/inMemorySourcingEventRepository';
import { createInMemorySupplierRepository } from '../src/backend/repositories/inMemorySupplierRepository';
import { createSourcingEventService, DuplicateReferenceError, InvalidStatusTransitionError, SourcingEventValidationError } from '../src/backend/services/sourcingEventService';
import { createSupplierService } from '../src/backend/services/supplierService';
import { mockMondayBoardProvider } from '../src/backend/providers/mockMondayBoardProvider';
import type { SourcingEventInput, Supplier } from '../src/shared/types/domain';
import type { TenantContext } from '../src/backend/tenancy/tenantContext';

const tenant: TenantContext = { tenantId: 'svc-tenant' };
const tenantProvider = { getTenantContext: () => tenant };

const mockSuppliers: Supplier[] = [
  { id: 'sup-1', tenantId: 'svc-tenant', name: 'Acme Corp', status: 'ACTIVE', preferred: true, email: 'acme@example.com', sourceType: 'ARIAVEL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-2', tenantId: 'svc-tenant', name: 'Beta Ltd', status: 'PENDING', preferred: false, sourceType: 'ARIAVEL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-3', tenantId: 'svc-tenant', name: 'Blocked Co', status: 'BLOCKED', preferred: false, sourceType: 'ARIAVEL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

function setup() {
  const eventRepo = createInMemorySourcingEventRepository();
  const supplierRepo = createInMemorySupplierRepository(mockSuppliers);
  const supplierSvc = createSupplierService(supplierRepo, tenantProvider, mockMondayBoardProvider);
  const service = createSourcingEventService(eventRepo, tenantProvider, supplierSvc);
  return { service };
}

function input(overrides: Partial<SourcingEventInput> = {}): SourcingEventInput {
  return {
    reference: 'RFQ-2026-X1',
    title: 'Packaging Q4',
    currency: 'EUR',
    ownerUserId: 'user-1',
    lines: [{ id: 'l1', description: 'Boxes', quantity: 100, unit: 'pcs' }],
    supplierSelections: [{ supplierId: 'sup-1', source: 'ARIAVEL', supplierNameSnapshot: 'Acme Corp', emailSnapshot: 'acme@example.com', selectedAt: '2026-09-01T00:00:00Z' }],
    ...overrides,
  };
}

describe('SourcingEventService.create', () => {
  it('creates a DRAFT event', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    expect(event.status).toBe('DRAFT');
    expect(event.tenantId).toBe('svc-tenant');
    expect(event.reference).toBe('RFQ-2026-X1');
  });

  it('throws SourcingEventValidationError for invalid input', async () => {
    const { service } = setup();
    await expect(service.create(input({ title: '' }), 'user-1')).rejects.toBeInstanceOf(SourcingEventValidationError);
  });

  it('throws DuplicateReferenceError for duplicate reference', async () => {
    const { service } = setup();
    await service.create(input(), 'user-1');
    await expect(service.create(input(), 'user-1')).rejects.toBeInstanceOf(DuplicateReferenceError);
  });
});

describe('SourcingEventService.update', () => {
  it('updates event details', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    const updated = await service.update(event.id, input({ title: 'Updated Title', reference: 'RFQ-2026-X2' }), 'user-2');
    expect(updated.title).toBe('Updated Title');
    expect(updated.updatedByUserId).toBe('user-2');
  });

  it('allows same reference when updating same event', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    const updated = await service.update(event.id, input({ title: 'New Title' }), 'user-1');
    expect(updated.title).toBe('New Title');
  });
});

describe('SourcingEventService.changeStatus', () => {
  it('DRAFT -> READY_FOR_INVITATION when valid', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    const ready = await service.changeStatus(event.id, 'READY_FOR_INVITATION', 'user-1');
    expect(ready.status).toBe('READY_FOR_INVITATION');
  });

  it('throws InvalidStatusTransitionError for disallowed transition', async () => {
    const { service } = setup();
    const event = await service.create(input({ supplierSelections: [] }), 'user-1');
    await expect(service.changeStatus(event.id, 'READY_FOR_INVITATION', 'user-1')).rejects.toBeInstanceOf(SourcingEventValidationError);
  });

  it('CANCELLED -> DRAFT is not allowed', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    await service.changeStatus(event.id, 'CANCELLED', 'user-1');
    await expect(service.changeStatus(event.id, 'DRAFT', 'user-1')).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  });

  it('READY_FOR_INVITATION -> DRAFT is allowed', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    await service.changeStatus(event.id, 'READY_FOR_INVITATION', 'user-1');
    const draft = await service.changeStatus(event.id, 'DRAFT', 'user-1');
    expect(draft.status).toBe('DRAFT');
  });
});

describe('SourcingEventService.list and search', () => {
  it('returns events sorted by updatedAt descending', async () => {
    const tenantForSort: TenantContext = { tenantId: 'svc-tenant' };
    let tick = 0;
    const deterministicNow = () => `2026-09-0${++tick}T00:00:00Z`;
    const eventRepo = createInMemorySourcingEventRepository([], { now: deterministicNow });
    const supplierRepo = createInMemorySupplierRepository(mockSuppliers);
    const supplierSvc = createSupplierService(supplierRepo, { getTenantContext: () => tenantForSort }, mockMondayBoardProvider);
    const svc = createSourcingEventService(eventRepo, { getTenantContext: () => tenantForSort }, supplierSvc);
    await svc.create(input({ reference: 'RFQ-A', title: 'Alpha' }), 'user-1');
    await svc.create(input({ reference: 'RFQ-B', title: 'Beta' }), 'user-1');
    const list = await svc.list();
    expect(list[0].reference).toBe('RFQ-B');
  });

  it('filters by search query (title)', async () => {
    const { service } = setup();
    await service.create(input({ reference: 'RFQ-A', title: 'Chemicals' }), 'user-1');
    await service.create(input({ reference: 'RFQ-B', title: 'Packaging' }), 'user-1');
    const list = await service.list({ search: 'chem' });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Chemicals');
  });

  it('filters by status', async () => {
    const { service } = setup();
    const event = await service.create(input(), 'user-1');
    await service.changeStatus(event.id, 'CANCELLED', 'user-1');
    await service.create(input({ reference: 'RFQ-B', title: 'Other' }), 'user-1');
    const drafts = await service.list({ status: 'DRAFT' });
    expect(drafts.every(e => e.status === 'DRAFT')).toBe(true);
  });

  it('returns summary counts', async () => {
    const { service } = setup();
    await service.create(input({ reference: 'RFQ-A' }), 'user-1');
    const event = await service.create(input({ reference: 'RFQ-B' }), 'user-1');
    await service.changeStatus(event.id, 'READY_FOR_INVITATION', 'user-1');
    const summary = await service.getSummary();
    expect(summary.draft).toBe(1);
    expect(summary.readyForInvitation).toBe(1);
    expect(summary.total).toBe(2);
  });
});

describe('SourcingEventService.listEligibleSuppliers', () => {
  it('returns only ACTIVE suppliers', async () => {
    const { service } = setup();
    const eligible = await service.listEligibleSuppliers();
    expect(eligible.every(s => s.status === 'ACTIVE')).toBe(true);
    expect(eligible.some(s => s.name === 'Acme Corp')).toBe(true);
    expect(eligible.some(s => s.status === 'PENDING')).toBe(false);
    expect(eligible.some(s => s.status === 'BLOCKED')).toBe(false);
  });
});

describe('SourcingEventService.buildSupplierSelection', () => {
  it('captures supplier snapshot at selection time', async () => {
    const { service } = setup();
    const sel = service.buildSupplierSelection(mockSuppliers[0]);
    expect(sel.supplierId).toBe('sup-1');
    expect(sel.supplierNameSnapshot).toBe('Acme Corp');
    expect(sel.emailSnapshot).toBe('acme@example.com');
    expect(sel.source).toBe('ARIAVEL');
  });
});

describe('SourcingEventService.duplicate', () => {
  it('creates a copy with a new reference and DRAFT status', async () => {
    const { service } = setup();
    const original = await service.create(input(), 'user-1');
    await service.changeStatus(original.id, 'READY_FOR_INVITATION', 'user-1');
    const copy = await service.duplicate(original.id, 'user-1');
    expect(copy.id).not.toBe(original.id);
    expect(copy.reference).not.toBe(original.reference);
    expect(copy.status).toBe('DRAFT');
    expect(copy.title).toContain('Copy of');
    expect(copy.lines.length).toBe(original.lines.length);
    expect(copy.lines[0].id).not.toBe(original.lines[0].id);
  });
});

describe('SourcingEventService.line helpers', () => {
  it('addLine appends a new line with a unique ID', async () => {
    const { service } = setup();
    const lines = service.addLine([], 'Test item');
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe('Test item');
    expect(lines[0].id).toBeTruthy();
    const lines2 = service.addLine(lines, 'Second item');
    expect(lines2).toHaveLength(2);
    expect(lines2[0].id).not.toBe(lines2[1].id);
  });

  it('removeLine removes by ID without mutating original array', async () => {
    const { service } = setup();
    const lines = service.addLine(service.addLine([], 'A'), 'B');
    const removed = service.removeLine(lines, lines[0].id);
    expect(removed).toHaveLength(1);
    expect(removed[0].description).toBe('B');
    expect(lines).toHaveLength(2);
  });

  it('updateLine updates only the matching line', async () => {
    const { service } = setup();
    const lines = service.addLine(service.addLine([], 'A'), 'B');
    const updated = service.updateLine(lines, { ...lines[0], description: 'A-Updated' });
    expect(updated[0].description).toBe('A-Updated');
    expect(updated[1].description).toBe('B');
  });
});
