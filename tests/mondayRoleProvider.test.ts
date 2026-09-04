// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMondayRoleProvider } from '../src/server/auth/mondayRoleProvider';

describe('mondayRoleProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves role flags from the monday API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { me: { is_admin: true, is_guest: false, is_view_only: false } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = createMondayRoleProvider();
    const role = await provider('short-lived-token');

    expect(role).toEqual({ isAdmin: true, isGuest: false, isViewOnly: false });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.monday.com/v2',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'short-lived-token' }) }),
    );
  });

  it('caches the result for the same token within the TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { me: { is_admin: false, is_guest: false, is_view_only: false } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = createMondayRoleProvider('https://api.monday.com/v2', 60_000);
    await provider('token-a');
    await provider('token-a');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the API responds with a non-OK status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const provider = createMondayRoleProvider();
    await expect(provider('bad-token')).rejects.toThrow(/status 500/);
  });

  it('throws when the API response has no user data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as unknown as typeof fetch;
    const provider = createMondayRoleProvider();
    await expect(provider('token')).rejects.toThrow(/no user data/);
  });
});
