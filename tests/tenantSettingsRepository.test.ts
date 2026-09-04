// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { Db } from 'mongodb';
import { createTenantSettingsRepository } from '../src/server/db/tenantSettingsRepository';
import { defaultTenantSettings } from '../src/shared/types/tenantSettings';

// Real repository-level tests against createTenantSettingsRepository itself
// (not the in-memory stand-in every other test uses) — a duck-typed fake
// Mongo Db/Collection is enough to exercise the actual findOne/updateOne/
// replaceOne calls this repository issues, without needing a live Mongo
// server in this environment.
function makeFakeCollection(overrides: Partial<{
  findOne: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  replaceOne: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    replaceOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    ...overrides,
  };
}

function makeFakeDb(collection: ReturnType<typeof makeFakeCollection>): Db {
  return { collection: vi.fn().mockReturnValue(collection) } as unknown as Db;
}

describe('createTenantSettingsRepository', () => {
  it('get() returns null when no document exists for the tenant', async () => {
    const collection = makeFakeCollection({ findOne: vi.fn().mockResolvedValue(null) });
    const repo = createTenantSettingsRepository(makeFakeDb(collection));

    const result = await repo.get('monday-account-42');

    expect(result).toBeNull();
    expect(collection.findOne).toHaveBeenCalledWith({ tenantId: 'monday-account-42' });
  });

  it('get() returns the persisted settings, with the Mongo _id stripped', async () => {
    const settings = defaultTenantSettings('monday-account-42', '2026-09-04T00:00:00.000Z');
    const stored = { _id: 'mongo-object-id', ...settings, organization: { ...settings.organization, companyDisplayName: 'Acme' } };
    const collection = makeFakeCollection({ findOne: vi.fn().mockResolvedValue(stored) });
    const repo = createTenantSettingsRepository(makeFakeDb(collection));

    const result = await repo.get('monday-account-42');

    expect(result).not.toBeNull();
    expect(result?.organization.companyDisplayName).toBe('Acme');
    expect(result).not.toHaveProperty('_id');
  });

  it('propagates a real Document DB failure instead of swallowing it — the route layer is what turns this into a 500', async () => {
    // This is the exact failure category the live UAT 500 could be:
    // a collection-level exception (bad connection, auth, or a
    // BSON/document-shape mismatch on this specific collection) that
    // /health's db.command({ ping: 1 }) check would never catch.
    const collection = makeFakeCollection({ findOne: vi.fn().mockRejectedValue(new Error('MongoServerSelectionError: connection timed out')) });
    const repo = createTenantSettingsRepository(makeFakeDb(collection));

    await expect(repo.get('monday-account-42')).rejects.toThrow('MongoServerSelectionError');
  });

  it('setWithVersion(expectedVersion=0) upserts a fresh document and returns it', async () => {
    const settings = defaultTenantSettings('monday-account-42', '2026-09-04T00:00:00.000Z');
    const collection = makeFakeCollection({ updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }) });
    const repo = createTenantSettingsRepository(makeFakeDb(collection));

    const result = await repo.setWithVersion(settings, 0);

    expect(result).toEqual(settings);
    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: settings.tenantId },
      { $setOnInsert: settings },
      { upsert: true },
    );
  });

  it('setWithVersion(expectedVersion=0) returns null (not an error) when a document already exists — first-create race', async () => {
    const settings = defaultTenantSettings('monday-account-42', '2026-09-04T00:00:00.000Z');
    const collection = makeFakeCollection({ updateOne: vi.fn().mockResolvedValue({ upsertedCount: 0 }) });
    const repo = createTenantSettingsRepository(makeFakeDb(collection));

    const result = await repo.setWithVersion(settings, 0);

    expect(result).toBeNull();
  });

  it('setWithVersion(expectedVersion>0) replaces only on a matching version, returns null on conflict', async () => {
    const settings = { ...defaultTenantSettings('monday-account-42', '2026-09-04T00:00:00.000Z'), version: 2 };
    const collection = makeFakeCollection({ replaceOne: vi.fn().mockResolvedValue({ matchedCount: 0 }) });
    const repo = createTenantSettingsRepository(makeFakeDb(collection));

    const result = await repo.setWithVersion(settings, 1);

    expect(result).toBeNull();
    expect(collection.replaceOne).toHaveBeenCalledWith({ tenantId: settings.tenantId, version: 1 }, settings);
  });
});
