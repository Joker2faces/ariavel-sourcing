import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemorySourcingEventRepository, SourcingEventNotFoundError } from '../src/backend/repositories/inMemorySourcingEventRepository';
import type { SourcingEventInput } from '../src/shared/types/domain';
import type { TenantContext } from '../src/backend/tenancy/tenantContext';

const tenant: TenantContext = { tenantId: 'tenant-A' };
const otherTenant: TenantContext = { tenantId: 'tenant-B' };

function baseInput(overrides: Partial<SourcingEventInput> = {}): SourcingEventInput {
  return {
    reference: 'RFQ-2026-A1',
    title: 'Test Event',
    currency: 'EUR',
    ownerUserId: 'user-1',
    lines: [{ id: 'l1', description: 'Widget', quantity: 10, unit: 'pcs' }],
    supplierSelections: [],
    ...overrides,
  };
}

describe('InMemorySourcingEventRepository', () => {
  let repo: ReturnType<typeof createInMemorySourcingEventRepository>;

  beforeEach(() => { repo = createInMemorySourcingEventRepository(); });

  it('creates and retrieves an event', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    expect(event.id).toBeTruthy();
    expect(event.tenantId).toBe('tenant-A');
    expect(event.status).toBe('DRAFT');
    expect(event.title).toBe('Test Event');
    const found = await repo.getForTenant(tenant, event.id);
    expect(found?.id).toBe(event.id);
  });

  it('lists events for tenant', async () => {
    await repo.createForTenant(tenant, baseInput(), 'user-1');
    await repo.createForTenant(tenant, baseInput({ reference: 'RFQ-2026-A2', title: 'Second' }), 'user-1');
    const list = await repo.listForTenant(tenant);
    expect(list).toHaveLength(2);
  });

  it('enforces tenant isolation', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    const list = await repo.listForTenant(otherTenant);
    expect(list).toHaveLength(0);
    const found = await repo.getForTenant(otherTenant, event.id);
    expect(found).toBeUndefined();
  });

  it('updates event fields without changing id, tenantId, status, or createdByUserId', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    const updated = await repo.updateForTenant(tenant, event.id, baseInput({ title: 'Updated Title' }), 'user-2');
    expect(updated.id).toBe(event.id);
    expect(updated.tenantId).toBe(event.tenantId);
    expect(updated.status).toBe('DRAFT');
    expect(updated.createdByUserId).toBe('user-1');
    expect(updated.updatedByUserId).toBe('user-2');
    expect(updated.title).toBe('Updated Title');
  });

  it('changes status', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    const changed = await repo.changeStatusForTenant(tenant, event.id, 'READY_FOR_INVITATION', 'user-1');
    expect(changed.status).toBe('READY_FOR_INVITATION');
  });

  it('changes status to CANCELLED', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    const cancelled = await repo.changeStatusForTenant(tenant, event.id, 'CANCELLED', 'user-1');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('throws SourcingEventNotFoundError when event missing', async () => {
    await expect(repo.updateForTenant(tenant, 'nonexistent', baseInput(), 'user-1')).rejects.toBeInstanceOf(SourcingEventNotFoundError);
    await expect(repo.changeStatusForTenant(tenant, 'nonexistent', 'CANCELLED', 'user-1')).rejects.toBeInstanceOf(SourcingEventNotFoundError);
  });

  it('returns undefined for missing get', async () => {
    expect(await repo.getForTenant(tenant, 'missing')).toBeUndefined();
  });

  it('returns copies — mutations on returned value do not affect stored record', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    const found = await repo.getForTenant(tenant, event.id);
    if (found) found.title = 'MUTATED';
    const re = await repo.getForTenant(tenant, event.id);
    expect(re?.title).toBe('Test Event');
  });

  it('preserves lines in created event', async () => {
    const event = await repo.createForTenant(tenant, baseInput(), 'user-1');
    expect(event.lines).toHaveLength(1);
    expect(event.lines[0].description).toBe('Widget');
  });
});
