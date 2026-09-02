import { describe, expect, it } from 'vitest';
import { createInMemorySupplierRepository, SupplierNotFoundError } from '../src/backend/repositories/inMemorySupplierRepository';
import type { Supplier, SupplierInput, SupplierSourceConfiguration } from '../src/shared/types/domain';

const input: SupplierInput = { name: 'Acme Materials', status: 'ACTIVE', preferred: false, sourceType: 'ARIAVEL' };
const tenantA = { tenantId: 'tenant-a' };
const tenantB = { tenantId: 'tenant-b' };
const seeded: Supplier[] = [
  { ...input, id: 'supplier-a', tenantId: tenantA.tenantId, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
  { ...input, name: 'Hidden Supplier', id: 'supplier-b', tenantId: tenantB.tenantId, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
];

describe('in-memory supplier repository', () => {
  it('lists only suppliers belonging to the requested tenant', async () => {
    const repository = createInMemorySupplierRepository(seeded);
    expect((await repository.listForTenant(tenantA)).map(record => record.id)).toEqual(['supplier-a']);
  });

  it('prevents cross-tenant reads', async () => {
    const repository = createInMemorySupplierRepository(seeded);
    expect(await repository.getForTenant(tenantA, 'supplier-b')).toBeUndefined();
  });

  it('creates stable tenant-scoped suppliers without exposing mutable storage', async () => {
    const repository = createInMemorySupplierRepository([], { now: () => '2026-09-02T10:00:00.000Z', createId: () => 'supplier-new' });
    const created = await repository.createForTenant(tenantA, input);
    created.name = 'Changed outside repository';
    expect(await repository.getForTenant(tenantA, 'supplier-new')).toEqual(expect.objectContaining({ id: 'supplier-new', tenantId: 'tenant-a', name: 'Acme Materials' }));
  });

  it('updates a supplier inside its tenant', async () => {
    const repository = createInMemorySupplierRepository(seeded, { now: () => '2026-09-02T12:00:00.000Z' });
    const updated = await repository.updateForTenant(tenantA, 'supplier-a', { ...input, name: 'Acme Europe', preferred: true });
    expect(updated).toEqual(expect.objectContaining({ name: 'Acme Europe', preferred: true, updatedAt: '2026-09-02T12:00:00.000Z' }));
  });

  it('rejects cross-tenant updates without revealing the record', async () => {
    const repository = createInMemorySupplierRepository(seeded);
    await expect(repository.updateForTenant(tenantA, 'supplier-b', input)).rejects.toBeInstanceOf(SupplierNotFoundError);
  });

  it('changes supplier status without deleting the record', async () => {
    const repository = createInMemorySupplierRepository(seeded);
    expect((await repository.changeStatusForTenant(tenantA, 'supplier-a', 'BLOCKED')).status).toBe('BLOCKED');
    expect(await repository.getForTenant(tenantA, 'supplier-a')).toBeDefined();
  });

  it('stores source configuration per tenant', async () => {
    const repository = createInMemorySupplierRepository();
    const config: SupplierSourceConfiguration = { mode: 'ARIAVEL' };
    await repository.saveSourceConfiguration(tenantA, config);
    expect(await repository.getSourceConfiguration(tenantA)).toEqual(config);
    expect(await repository.getSourceConfiguration(tenantB)).toBeUndefined();
  });
});
