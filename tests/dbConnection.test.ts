// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

const ORIGINAL_URI = process.env['MNDY_MONGODB_CONNECTION_STRING'];

afterEach(() => {
  vi.doUnmock('mongodb');
  vi.resetModules();
  if (ORIGINAL_URI === undefined) delete process.env['MNDY_MONGODB_CONNECTION_STRING'];
  else process.env['MNDY_MONGODB_CONNECTION_STRING'] = ORIGINAL_URI;
});

describe('getDb', () => {
  it('UAT regression: selects the database via client.db() with no explicit name', async () => {
    // Real UAT root cause: monday Code's managed Document DB namespaces any
    // explicitly-requested db name onto its own provisioned prefix with
    // "#" (e.g. "v15f192efe2084f4ab702e7188501d#ariavel_sourcing"), which
    // is not a legal Mongo database name — every collection operation
    // through that handle failed with MongoServerError: Invalid database
    // name. client.db() with no argument uses the database the connection
    // string itself already specifies, avoiding that namespacing.
    const dbFn = vi.fn().mockReturnValue({ collection: vi.fn() });
    const connect = vi.fn().mockResolvedValue(undefined);
    vi.doMock('mongodb', () => ({
      MongoClient: vi.fn().mockImplementation(() => ({ connect, db: dbFn, close: vi.fn() })),
    }));
    process.env['MNDY_MONGODB_CONNECTION_STRING'] = 'mongodb://example.test/v-provisioned-db';

    const { getDb } = await import('../src/server/db/connection');
    await getDb();

    expect(dbFn).toHaveBeenCalledWith();
    expect(dbFn).not.toHaveBeenCalledWith('ariavel_sourcing');
  });

  it('throws when MNDY_MONGODB_CONNECTION_STRING is not set', async () => {
    delete process.env['MNDY_MONGODB_CONNECTION_STRING'];
    const { getDb } = await import('../src/server/db/connection');
    await expect(getDb()).rejects.toThrow('MNDY_MONGODB_CONNECTION_STRING is not set');
  });
});
