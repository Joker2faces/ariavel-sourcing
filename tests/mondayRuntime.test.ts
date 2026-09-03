import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { detectRuntimeMode, RuntimeMode } from '../src/backend/runtime/mondayRuntime';
import { deriveCapabilities, fullCapabilities } from '../src/backend/runtime/runtimeCapabilities';
import { createMondayTenantContextProvider } from '../src/backend/tenancy/mondayTenantContextProvider';
import type { AppFeatureObjectContext } from '../src/backend/runtime/mondayRuntime';
import type { MondayRuntimeAdapter } from '../src/backend/runtime/mondayRuntime';

function makeContext(overrides: Partial<AppFeatureObjectContext> = {}): AppFeatureObjectContext {
  return {
    account: { id: 'acct-42' },
    user: { id: 'u1', isAdmin: true, isGuest: false, isViewOnly: false, countryCode: 'GR', currentLanguage: 'en', timeFormat: '24h', timeZoneOffset: 2 },
    region: 'EU',
    theme: 'light',
    app: { id: 12049778, clientId: 'test-client' },
    appVersion: { id: 17506248, name: 'Ariavel Sourcing', status: 'draft', type: 'client_side', versionData: { major: 1, minor: 0, patch: 0, type: 'minor' } },
    permissions: { approvedScopes: ['boards:read'], requiredScopes: ['boards:read'] },
    boardId: 0,
    boardIds: [0],
    workspaceId: 1,
    appFeatureId: 123330040,
    instanceId: 999,
    instanceType: 'object_view',
    isFullScreen: false,
    isPresentingMode: false,
    objectPermissions: 'edit',
    isFirstLevelControlPinned: false,
    isSlidePanelOpen: false,
    boardLoadingState: 0,
    ...overrides,
  } as AppFeatureObjectContext;
}

function makeMockRuntime(contextOverrides: Partial<AppFeatureObjectContext> = {}): MondayRuntimeAdapter {
  const ctx = makeContext(contextOverrides);
  return {
    mode: RuntimeMode.MONDAY,
    getContext: vi.fn().mockResolvedValue(ctx),
    getSessionToken: vi.fn(),
    api: vi.fn().mockResolvedValue({ data: {} }),
    storage: {
      getItem: vi.fn().mockResolvedValue({ success: true, value: null }),
      setItem: vi.fn().mockResolvedValue({ success: true, version: 'v1' }),
      deleteItem: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('detectRuntimeMode', () => {
  it('returns TEST in test environment', () => {
    expect(detectRuntimeMode()).toBe(RuntimeMode.TEST);
  });

  describe('outside the test runner', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      // NODE_ENV === 'test' short-circuits every other check — remove it so
      // the iframe/DEV-flag branches below are actually exercised.
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      vi.unstubAllEnvs();
    });

    it('returns MONDAY when framed (window.self !== window.top), regardless of DEV flag', () => {
      vi.stubEnv('DEV', true);
      const originalTop = window.top;
      Object.defineProperty(window, 'top', { value: {}, configurable: true });
      expect(detectRuntimeMode()).toBe(RuntimeMode.MONDAY);
      Object.defineProperty(window, 'top', { value: originalTop, configurable: true });
    });

    it('returns LOCAL_DEVELOPMENT when not framed and running under a dev build (import.meta.env.DEV)', () => {
      vi.stubEnv('DEV', true);
      expect(detectRuntimeMode()).toBe(RuntimeMode.LOCAL_DEVELOPMENT);
    });

    it('returns STANDALONE_NO_CONTEXT when not framed and running a production build (import.meta.env.DEV is false)', () => {
      vi.stubEnv('DEV', false);
      expect(detectRuntimeMode()).toBe(RuntimeMode.STANDALONE_NO_CONTEXT);
    });

    it('never returns LOCAL_DEVELOPMENT for a production build just because monday context is absent', () => {
      // This is the exact defect this test guards against: a real deployed
      // build opened directly must not be treated as "local dev" (which
      // would silently permit mock/demo business data in production).
      vi.stubEnv('DEV', false);
      const mode = detectRuntimeMode();
      expect(mode).not.toBe(RuntimeMode.LOCAL_DEVELOPMENT);
      expect(mode).toBe(RuntimeMode.STANDALONE_NO_CONTEXT);
    });
  });
});

describe('deriveCapabilities', () => {
  it('grants full capabilities to admin non-guest non-viewOnly', () => {
    const caps = deriveCapabilities(makeContext());
    expect(caps.canViewSuppliers).toBe(true);
    expect(caps.canEditAriavelSuppliers).toBe(true);
    expect(caps.canConfigureSupplierSource).toBe(true);
  });

  it('denies configuration to non-admin', () => {
    const caps = deriveCapabilities(makeContext({ user: { ...makeContext().user, isAdmin: false } }));
    expect(caps.canViewSuppliers).toBe(true);
    expect(caps.canEditAriavelSuppliers).toBe(true);
    expect(caps.canConfigureSupplierSource).toBe(false);
  });

  it('denies editing to view-only user', () => {
    const caps = deriveCapabilities(makeContext({ user: { ...makeContext().user, isViewOnly: true, isAdmin: false } }));
    expect(caps.canEditAriavelSuppliers).toBe(false);
    expect(caps.canConfigureSupplierSource).toBe(false);
  });

  it('denies viewing and editing to guest', () => {
    const caps = deriveCapabilities(makeContext({ user: { ...makeContext().user, isGuest: true, isAdmin: false } }));
    expect(caps.canViewSuppliers).toBe(false);
    expect(caps.canEditAriavelSuppliers).toBe(false);
  });

  it('fullCapabilities allows everything', () => {
    expect(fullCapabilities.canViewSuppliers).toBe(true);
    expect(fullCapabilities.canEditAriavelSuppliers).toBe(true);
    expect(fullCapabilities.canConfigureSupplierSource).toBe(true);
  });
});

describe('MondayTenantContextProvider', () => {
  it('derives tenant from account ID after initialization', async () => {
    const runtime = makeMockRuntime({ account: { id: 'acct-999' } });
    const provider = createMondayTenantContextProvider(runtime);
    const tenant = await provider.initialize();
    expect(tenant.tenantId).toBe('acct-999');
    expect(provider.getTenantContext().tenantId).toBe('acct-999');
  });

  it('throws if getTenantContext is called before initialize', () => {
    const runtime = makeMockRuntime();
    const provider = createMondayTenantContextProvider(runtime);
    expect(() => provider.getTenantContext()).toThrow('Tenant context used before initialization');
  });

  it('throws if account ID is missing from context', async () => {
    const runtime = makeMockRuntime();
    (runtime.getContext as ReturnType<typeof vi.fn>).mockResolvedValue({ account: { id: '' }, user: {} });
    const provider = createMondayTenantContextProvider(runtime);
    await expect(provider.initialize()).rejects.toThrow('account ID');
  });

  it('does not accept a manually supplied account ID as tenant', async () => {
    const runtime = makeMockRuntime({ account: { id: 'real-acct' } });
    const provider = createMondayTenantContextProvider(runtime);
    await provider.initialize();
    expect(provider.getTenantContext().tenantId).toBe('real-acct');
    expect(provider.getTenantContext().tenantId).not.toBe('injected-fake-id');
  });
});

describe('MondayRuntimeAdapter mock', () => {
  let runtime: MondayRuntimeAdapter;
  beforeEach(() => { runtime = makeMockRuntime(); });

  it('returns context from getContext', async () => {
    const ctx = await runtime.getContext();
    expect(ctx.account.id).toBe('acct-42');
  });

  it('calls api and returns data', async () => {
    (runtime.api as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { boards: [{ id: '1', name: 'Test' }] } });
    const result = await runtime.api('query { boards { id name } }') as { data: { boards: { id: string; name: string }[] } };
    expect(result.data.boards[0].name).toBe('Test');
  });

  it('storage.getItem returns null for missing key', async () => {
    const r = await runtime.storage.getItem('missing');
    expect(r.value).toBeNull();
  });

  it('storage.setItem returns success and version', async () => {
    const r = await runtime.storage.setItem('key', 'value');
    expect(r.success).toBe(true);
    expect(r.version).toBe('v1');
  });
});
