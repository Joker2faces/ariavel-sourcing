import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMondayStorageSupplierRepository, StorageVersionConflictError } from '../src/backend/repositories/mondayStorageSupplierRepository';
import type { MondayRuntimeAdapter, StorageGetResult, StorageSetResult } from '../src/backend/runtime/mondayRuntime';
import { RuntimeMode } from '../src/backend/runtime/mondayRuntime';
import type { TenantContext } from '../src/backend/tenancy/tenantContext';

const tenant: TenantContext = { tenantId: 'test-acct' };

function makeStorage() {
  const store = new Map<string, { value: string; version: string }>();
  let versionCounter = 0;

  return {
    async getItem(key: string): Promise<StorageGetResult> {
      const entry = store.get(key);
      return { success: true, value: entry?.value ?? null, version: entry?.version };
    },
    async setItem(key: string, value: string, options?: { previous_version?: string }): Promise<StorageSetResult> {
      const current = store.get(key);
      if (options?.previous_version !== undefined && current?.version !== options.previous_version) {
        return { success: false, version: current?.version ?? '' };
      }
      const version = `v${++versionCounter}`;
      store.set(key, { value, version });
      return { success: true, version };
    },
    async deleteItem(key: string): Promise<void> { store.delete(key); },
    _store: store,
  };
}

function makeRuntime(): { runtime: MondayRuntimeAdapter; storage: ReturnType<typeof makeStorage> } {
  const storage = makeStorage();
  const runtime: MondayRuntimeAdapter = {
    mode: RuntimeMode.MONDAY,
    getContext: vi.fn(),
    api: vi.fn(),
    storage,
  };
  return { runtime, storage };
}

describe('MondayStorageSupplierRepository', () => {
  let runtime: MondayRuntimeAdapter;

  beforeEach(() => {
    ({ runtime } = makeRuntime());
  });

  it('creates a supplier and lists it', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const supplier = await repo.createForTenant(tenant, {
      name: 'Acme Corp',
      status: 'ACTIVE',
      preferred: false,
      sourceType: 'ARIAVEL',
    });
    expect(supplier.id).toBeTruthy();
    expect(supplier.name).toBe('Acme Corp');
    expect(supplier.tenantId).toBe('test-acct');
    const list = await repo.listForTenant(tenant);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Acme Corp');
  });

  it('retrieves a supplier by ID', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const created = await repo.createForTenant(tenant, { name: 'NorthStar', status: 'PENDING', preferred: true, sourceType: 'ARIAVEL' });
    const found = await repo.getForTenant(tenant, created.id);
    expect(found?.name).toBe('NorthStar');
  });

  it('returns undefined for missing supplier', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    expect(await repo.getForTenant(tenant, 'missing-id')).toBeUndefined();
  });

  it('updates supplier fields without changing id or tenantId', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const created = await repo.createForTenant(tenant, { name: 'OldName', status: 'ACTIVE', preferred: false, sourceType: 'ARIAVEL' });
    const updated = await repo.updateForTenant(tenant, created.id, { name: 'NewName', status: 'INACTIVE', preferred: true, sourceType: 'ARIAVEL' });
    expect(updated.id).toBe(created.id);
    expect(updated.tenantId).toBe(created.tenantId);
    expect(updated.name).toBe('NewName');
    expect(updated.status).toBe('INACTIVE');
  });

  it('changes supplier status', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const created = await repo.createForTenant(tenant, { name: 'S1', status: 'ACTIVE', preferred: false, sourceType: 'ARIAVEL' });
    const changed = await repo.changeStatusForTenant(tenant, created.id, 'BLOCKED');
    expect(changed.status).toBe('BLOCKED');
  });

  it('persists and retrieves source configuration', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const saved = await repo.saveSourceConfiguration(tenant, { mode: 'ARIAVEL' });
    expect(saved.mode).toBe('ARIAVEL');
    const loaded = await repo.getSourceConfiguration(tenant);
    expect(loaded?.mode).toBe('ARIAVEL');
  });

  it('returns undefined when no source config exists', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    expect(await repo.getSourceConfiguration(tenant)).toBeUndefined();
  });

  it('persists MONDAY_BOARD source configuration with mapping', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const config = {
      mode: 'MONDAY_BOARD' as const,
      boardMapping: {
        boardId: 'b1',
        fieldMappings: [{ supplierField: 'name' as const, mondayColumnId: 'name' }],
        configuredAt: '2026-09-03T00:00:00Z',
      },
    };
    await repo.saveSourceConfiguration(tenant, config);
    const loaded = await repo.getSourceConfiguration(tenant);
    expect(loaded?.mode).toBe('MONDAY_BOARD');
    if (loaded?.mode === 'MONDAY_BOARD') {
      expect(loaded.boardMapping.boardId).toBe('b1');
    }
  });

  it('detects version conflict on concurrent setItem', async () => {
    const { runtime: rt } = makeRuntime();
    const repo = createMondayStorageSupplierRepository(rt);
    const config = { mode: 'ARIAVEL' as const };
    await repo.saveSourceConfiguration(tenant, config);
    await rt.storage.setItem('ariavel:source-config', JSON.stringify({ mode: 'ARIAVEL' }), { previous_version: 'v-wrong' });
    await repo.saveSourceConfiguration(tenant, { mode: 'ARIAVEL' }).catch(err => {
      expect(err).toBeInstanceOf(StorageVersionConflictError);
    });
  });

  it('maintains schema version key on first use', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    await repo.listForTenant(tenant);
    const schemaResult = await runtime.storage.getItem('ariavel:schema-version');
    expect(schemaResult.value).toBe('1');
  });

  it('handles corrupt stored supplier gracefully', async () => {
    const repo = createMondayStorageSupplierRepository(runtime);
    const created = await repo.createForTenant(tenant, { name: 'Good', status: 'ACTIVE', preferred: false, sourceType: 'ARIAVEL' });
    await runtime.storage.setItem(`ariavel:supplier:${created.id}`, 'NOT_JSON');
    const list = await repo.listForTenant(tenant);
    expect(list.filter(s => s.id === created.id)).toHaveLength(0);
  });
});
