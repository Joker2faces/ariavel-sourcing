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
