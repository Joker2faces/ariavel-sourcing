// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEnvironmentSecretProvider,
  createInMemorySecretProvider,
  createDefaultSecretProvider,
} from '../src/server/secrets/secretProvider';

describe('EnvironmentSecretProvider', () => {
  const KEY = 'TEST_ENV_SECRET_PROVIDER_KEY';

  afterEach(() => { delete process.env[KEY]; });

  it('reads a value from process.env', async () => {
    process.env[KEY] = 'value-from-env';
    const provider = createEnvironmentSecretProvider();
    expect(await provider.get(KEY)).toBe('value-from-env');
  });

  it('returns undefined for a missing key rather than an empty string', async () => {
    const provider = createEnvironmentSecretProvider();
    expect(await provider.get('DEFINITELY_NOT_SET_' + KEY)).toBeUndefined();
  });
});

describe('InMemorySecretProvider (test-only)', () => {
  it('returns exactly the seeded value with no filesystem or SDK dependency', async () => {
    const provider = createInMemorySecretProvider({ MONDAY_CLIENT_SECRET: 'test-secret-value' });
    expect(await provider.get('MONDAY_CLIENT_SECRET')).toBe('test-secret-value');
  });

  it('returns undefined for an unseeded key', async () => {
    const provider = createInMemorySecretProvider({});
    expect(await provider.get('MONDAY_CLIENT_SECRET')).toBeUndefined();
  });
});

describe('MondayCodeSecretProvider', () => {
  beforeEach(() => { vi.resetModules(); });

  it('calls SecretsManager.get() with the requested key, not process.env', async () => {
    const getMock = vi.fn().mockReturnValue('secret-from-sdk');
    vi.doMock('@mondaycom/apps-sdk', () => ({
      SecretsManager: vi.fn().mockImplementation(() => ({ get: getMock })),
    }));
    process.env['MONDAY_CLIENT_SECRET'] = 'this-is-process-env-and-must-not-be-used';

    const { createMondayCodeSecretProvider: freshCreate } = await import('../src/server/secrets/secretProvider');
    const provider = await freshCreate();
    const value = await provider.get('MONDAY_CLIENT_SECRET');

    expect(getMock).toHaveBeenCalledWith('MONDAY_CLIENT_SECRET');
    expect(value).toBe('secret-from-sdk');
    delete process.env['MONDAY_CLIENT_SECRET'];
    vi.doUnmock('@mondaycom/apps-sdk');
  });

  it('fails safe (undefined) when SecretsManager has no value for the key — never falls back to process.env itself', async () => {
    vi.doMock('@mondaycom/apps-sdk', () => ({
      SecretsManager: vi.fn().mockImplementation(() => ({ get: vi.fn().mockReturnValue(undefined) })),
    }));
    process.env['MONDAY_CLIENT_SECRET'] = 'must-not-leak-through';

    const { createMondayCodeSecretProvider: freshCreate } = await import('../src/server/secrets/secretProvider');
    const provider = await freshCreate();
    const value = await provider.get('MONDAY_CLIENT_SECRET');

    expect(value).toBeUndefined();
    delete process.env['MONDAY_CLIENT_SECRET'];
    vi.doUnmock('@mondaycom/apps-sdk');
  });

  it('treats a non-string secret value (e.g. accidental object/number) as unavailable rather than throwing', async () => {
    vi.doMock('@mondaycom/apps-sdk', () => ({
      SecretsManager: vi.fn().mockImplementation(() => ({ get: vi.fn().mockReturnValue({ nested: true }) })),
    }));
    const { createMondayCodeSecretProvider: freshCreate } = await import('../src/server/secrets/secretProvider');
    const provider = await freshCreate();
    expect(await provider.get('MONDAY_CLIENT_SECRET')).toBeUndefined();
    vi.doUnmock('@mondaycom/apps-sdk');
  });
});

describe('createDefaultSecretProvider — runtime selection', () => {
  const K = 'K_SERVICE';

  afterEach(() => { delete process.env[K]; vi.doUnmock('@mondaycom/apps-sdk'); });

  it('selects the environment provider when K_SERVICE is not set (local/dev)', async () => {
    delete process.env[K];
    process.env['SOME_LOCAL_SECRET'] = 'local-value';
    const provider = await createDefaultSecretProvider();
    expect(await provider.get('SOME_LOCAL_SECRET')).toBe('local-value');
    delete process.env['SOME_LOCAL_SECRET'];
  });

  it('selects the monday Code (SecretsManager) provider when K_SERVICE is set (real deployment)', async () => {
    process.env[K] = 'ariavel-sourcing-service';
    const getMock = vi.fn().mockReturnValue('from-secrets-manager');
    vi.doMock('@mondaycom/apps-sdk', () => ({
      SecretsManager: vi.fn().mockImplementation(() => ({ get: getMock })),
    }));
    vi.resetModules();
    const { createDefaultSecretProvider: freshCreate } = await import('../src/server/secrets/secretProvider');
    const provider = await freshCreate();
    expect(await provider.get('MONDAY_CLIENT_SECRET')).toBe('from-secrets-manager');
  });
});

describe('Secret value never leaks', () => {
  it('never appears in a thrown error message when missing', async () => {
    const provider = createInMemorySecretProvider({});
    try {
      const value = await provider.get('MONDAY_CLIENT_SECRET');
      if (!value) throw new Error('MONDAY_CLIENT_SECRET is missing');
    } catch (err) {
      expect((err as Error).message).not.toMatch(/[a-f0-9]{32,}/i); // no leaked secret-shaped value
      expect((err as Error).message).toBe('MONDAY_CLIENT_SECRET is missing');
    }
  });
});
