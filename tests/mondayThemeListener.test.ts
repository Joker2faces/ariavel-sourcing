import { describe, expect, it, vi } from 'vitest';
import { applyMondayTheme } from '../src/frontend/App';

describe('applyMondayTheme', () => {
  it('maps "light" to data-theme=light', () => {
    applyMondayTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('maps "dark" to data-theme=dark', () => {
    applyMondayTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('maps monday\'s "black" theme onto the same dark token set rather than a fabricated third identity', () => {
    applyMondayTheme('black');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('MondayRuntimeAdapter.listenContext', () => {
  it('subscribes to monday.listen("context", ...) and unwraps res.data to the caller', async () => {
    const listen = vi.fn((_type: string, cb: (res: { data: unknown }) => void) => {
      cb({ data: { theme: 'dark', account: { id: 1 }, user: { id: 1, isAdmin: true, isGuest: false, isViewOnly: false } } });
      return () => {};
    });
    vi.resetModules();
    vi.doMock('monday-sdk-js', () => ({
      default: () => ({
        setApiVersion: vi.fn(),
        listen,
        get: vi.fn(),
        api: vi.fn(),
        storage: { getItem: vi.fn(), setItem: vi.fn(), deleteItem: vi.fn() },
      }),
    }));

    const { createMondayRuntimeAdapter } = await import('../src/backend/runtime/mondayRuntime');
    const runtime = createMondayRuntimeAdapter();
    const received: string[] = [];
    runtime.listenContext(ctx => received.push(ctx.theme));

    expect(listen).toHaveBeenCalledWith('context', expect.any(Function));
    expect(received).toEqual(['dark']);
    vi.doUnmock('monday-sdk-js');
  });
});

describe('MondayRuntimeAdapter.getSessionToken', () => {
  it('resolves normally when sdk.get("sessionToken") replies promptly', async () => {
    vi.resetModules();
    vi.doMock('monday-sdk-js', () => ({
      default: () => ({
        setApiVersion: vi.fn(),
        listen: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: 'a-real-jwt' }),
        api: vi.fn(),
        storage: { getItem: vi.fn(), setItem: vi.fn(), deleteItem: vi.fn() },
      }),
    }));
    const { createMondayRuntimeAdapter } = await import('../src/backend/runtime/mondayRuntime');
    const runtime = createMondayRuntimeAdapter();
    await expect(runtime.getSessionToken()).resolves.toBe('a-real-jwt');
    vi.doUnmock('monday-sdk-js');
  });

  it('UAT regression: rejects instead of hanging forever when the monday postMessage reply never arrives', async () => {
    // sdk.get() round-trips to the parent monday frame via postMessage and
    // carries no timeout of its own. If that reply is ever dropped, the raw
    // SDK promise never settles. This is the exact defect behind the real
    // UAT report of Settings getting stuck on "Loading settings…"
    // indefinitely: without a bound here, every caller up the chain
    // (buyerApiClient -> SettingsPage) would hang forever with no way to
    // recover.
    vi.useFakeTimers();
    vi.resetModules();
    const neverResolves = new Promise<{ data: unknown }>(() => {});
    vi.doMock('monday-sdk-js', () => ({
      default: () => ({
        setApiVersion: vi.fn(),
        listen: vi.fn(),
        get: vi.fn().mockReturnValue(neverResolves),
        api: vi.fn(),
        storage: { getItem: vi.fn(), setItem: vi.fn(), deleteItem: vi.fn() },
      }),
    }));
    const { createMondayRuntimeAdapter } = await import('../src/backend/runtime/mondayRuntime');
    const runtime = createMondayRuntimeAdapter();

    const result = runtime.getSessionToken();
    const assertion = expect(result).rejects.toThrow('Timed out waiting for monday session token');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;

    vi.doUnmock('monday-sdk-js');
    vi.useRealTimers();
  });
});
