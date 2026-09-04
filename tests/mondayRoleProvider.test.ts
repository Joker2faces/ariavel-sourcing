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

  it('queries both kind and the legacy boolean fields (2026-07 pin: deprecated but not yet removed)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { me: { kind: 'ADMIN' } } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await createMondayRoleProvider()('token');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { query: string };
    expect(body.query).toContain('kind');
    expect(body.query).toContain('is_admin');
    expect(body.query).toContain('is_guest');
    expect(body.query).toContain('is_view_only');
  });

  describe('kind field takes priority over the deprecated booleans when present', () => {
    it.each([
      ['ADMIN', { isAdmin: true, isGuest: false, isViewOnly: false }],
      ['admin', { isAdmin: true, isGuest: false, isViewOnly: false }],
      ['MEMBER', { isAdmin: false, isGuest: false, isViewOnly: false }],
      ['GUEST', { isAdmin: false, isGuest: true, isViewOnly: false }],
      ['VIEW_ONLY', { isAdmin: false, isGuest: false, isViewOnly: true }],
      ['AGENT_MEMBER', { isAdmin: false, isGuest: false, isViewOnly: true }],
      ['PORTAL', { isAdmin: false, isGuest: false, isViewOnly: true }],
    ] as const)('kind "%s" maps to %j', async (kind, expected) => {
      // is_admin true here proves kind wins even when the legacy field disagrees.
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { me: { kind, is_admin: true, is_guest: false, is_view_only: false } } }),
      }) as unknown as typeof fetch;
      const role = await createMondayRoleProvider(undefined, 0)('tok');
      expect(role).toEqual(expected);
    });
  });

  it('falls back to the legacy booleans when kind is absent (older/cached response shape)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { me: { is_admin: false, is_guest: true, is_view_only: false } } }),
    }) as unknown as typeof fetch;
    const role = await createMondayRoleProvider(undefined, 0)('tok');
    expect(role).toEqual({ isAdmin: false, isGuest: true, isViewOnly: false });
  });
});
