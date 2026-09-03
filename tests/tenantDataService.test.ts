// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createTenantDataService } from '../src/server/services/tenantDataService';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';

const TENANT = 'monday-account-1';
const OTHER_TENANT = 'monday-account-2';
const NOW = '2026-09-03T10:00:00.000Z';

// Minimal fake Mongo Db/Collection — just enough of the surface
// tenantDataService actually calls (find().toArray(), deleteMany()).
function makeFakeDb(seed: Record<string, Array<Record<string, unknown>>>) {
  const store = new Map<string, Array<Record<string, unknown>>>(Object.entries(seed).map(([k, v]) => [k, [...v]]));
  const calls: Array<{ collection: string; op: string; query: Record<string, unknown> }> = [];

  function collection(name: string) {
    if (!store.has(name)) store.set(name, []);
    return {
      find(query: Record<string, unknown>, opts?: { projection?: Record<string, 0 | 1> }) {
        calls.push({ collection: name, op: 'find', query });
        const docs = store.get(name)!.filter(d => Object.entries(query).every(([k, v]) => d[k] === v));
        const excluded = Object.entries(opts?.projection ?? {}).filter(([, v]) => v === 0).map(([k]) => k);
        return {
          toArray: async () => docs.map(d => {
            const copy = { ...d };
            for (const key of excluded) delete copy[key];
            return copy;
          }),
        };
      },
      async deleteMany(query: Record<string, unknown>) {
        calls.push({ collection: name, op: 'deleteMany', query });
        const before = store.get(name)!;
        const remaining = before.filter(d => !Object.entries(query).every(([k, v]) => d[k] === v));
        const deletedCount = before.length - remaining.length;
        store.set(name, remaining);
        return { deletedCount };
      },
    };
  }

  return { db: { collection } as unknown as import('mongodb').Db, calls, store };
}

function seedData() {
  return {
    supplier_invitations: [
      { tenantId: TENANT, id: 'inv-1', tokenHash: 'secret-hash', supplierNameSnapshot: 'Acme' },
      { tenantId: OTHER_TENANT, id: 'inv-2', tokenHash: 'other-hash' },
    ],
    supplier_quotes: [{ tenantId: TENANT, id: 'q-1' }],
    comparison_snapshots: [{ tenantId: TENANT, id: 'snap-1' }],
    award_scenarios: [{ tenantId: TENANT, id: 'award-1' }],
    attachments: [{ tenantId: TENANT, id: 'att-1' }],
    tenantSettings: [{ tenantId: TENANT }],
    audit_events: [{ tenantId: TENANT, id: 'a1', action: 'INVITATION_CREATED' }],
  };
}

describe('TenantDataService — export', () => {
  it('exports every tenant-scoped collection, scoped only to this tenant', async () => {
    const { db } = makeFakeDb(seedData());
    const svc = createTenantDataService(db, createInMemoryAuditRepository());
    const bundle = await svc.exportTenantData(TENANT, 'u1', NOW);

    expect(bundle['supplier_invitations']).toHaveLength(1);
    expect(bundle['supplier_quotes']).toHaveLength(1);
    expect(bundle['comparison_snapshots']).toHaveLength(1);
    expect(bundle['award_scenarios']).toHaveLength(1);
    expect(bundle['attachments']).toHaveLength(1);
    expect(bundle['tenantSettings']).toHaveLength(1);
    expect(bundle['audit_events']).toHaveLength(1);
  });

  it('never includes the token hash', async () => {
    const { db } = makeFakeDb(seedData());
    const svc = createTenantDataService(db, createInMemoryAuditRepository());
    const bundle = await svc.exportTenantData(TENANT, 'u1', NOW);
    const invitation = bundle['supplier_invitations'][0] as Record<string, unknown>;
    expect(invitation['tokenHash']).toBeUndefined();
  });

  it('logs a TENANT_DATA_EXPORTED audit event', async () => {
    const { db } = makeFakeDb(seedData());
    const auditRepo = createInMemoryAuditRepository();
    const svc = createTenantDataService(db, auditRepo);
    await svc.exportTenantData(TENANT, 'u1', NOW);
    const events = auditRepo.getAll();
    expect(events.some(e => e.action === 'TENANT_DATA_EXPORTED' && e.tenantId === TENANT)).toBe(true);
  });
});

describe('TenantDataService — deletion', () => {
  it('deletes every tenant-scoped collection but never touches another tenant\'s rows', async () => {
    const { db, store } = makeFakeDb(seedData());
    const svc = createTenantDataService(db, createInMemoryAuditRepository());
    const counts = await svc.deleteTenantData(TENANT, 'u1', NOW);

    expect(counts['supplier_invitations']).toBe(1);
    expect(store.get('supplier_invitations')).toHaveLength(1);
    expect((store.get('supplier_invitations')![0] as Record<string, unknown>)['tenantId']).toBe(OTHER_TENANT);
  });

  it('never deletes audit_events — the deletion itself must remain provable', async () => {
    const { db, store } = makeFakeDb(seedData());
    const svc = createTenantDataService(db, createInMemoryAuditRepository());
    await svc.deleteTenantData(TENANT, 'u1', NOW);
    // audit_events is untouched by the deleteMany loop (it's a separate in-memory repo call).
    expect(store.get('audit_events')).toHaveLength(1);
  });

  it('logs a TENANT_DATA_DELETED audit event', async () => {
    const { db } = makeFakeDb(seedData());
    const auditRepo = createInMemoryAuditRepository();
    const svc = createTenantDataService(db, auditRepo);
    await svc.deleteTenantData(TENANT, 'u1', NOW);
    const events = auditRepo.getAll();
    expect(events.some(e => e.action === 'TENANT_DATA_DELETED' && e.tenantId === TENANT)).toBe(true);
  });
});
