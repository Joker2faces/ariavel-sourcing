/**
 * Server-side lookup of the acting monday user's role/capability flags.
 *
 * The buyer sessionToken (see mondaySessionAuth.ts) proves *who* the caller
 * is (account_id, user_id) but carries no role information — role/permission
 * data must come from monday's own API. `dat.short_lived_token` is a
 * short-lived API token scoped to the viewing user, issued for exactly this
 * purpose (https://developer.monday.com/apps/docs/mondayget#sessiontoken).
 * We use it to ask monday directly whether this user is a guest/view-only
 * member, rather than trusting the client-supplied `RuntimeCapabilities`
 * used for UI gating (src/backend/entitlement — client-derived, never a
 * substitute for server-side enforcement on mutation routes).
 */

export interface MondayUserRole {
  isAdmin: boolean;
  isGuest: boolean;
  isViewOnly: boolean;
}

export type MondayRoleProvider = (shortLivedToken: string) => Promise<MondayUserRole>;

const ME_QUERY = `query { me { is_admin is_guest is_view_only } }`;
const CACHE_TTL_MS = 60_000;

interface CacheEntry { role: MondayUserRole; expiresAt: number }

export function createMondayRoleProvider(
  apiUrl = 'https://api.monday.com/v2',
  cacheTtlMs = CACHE_TTL_MS,
): MondayRoleProvider {
  const cache = new Map<string, CacheEntry>();

  return async (shortLivedToken: string): Promise<MondayUserRole> => {
    const now = Date.now();
    const cached = cache.get(shortLivedToken);
    if (cached && cached.expiresAt > now) return cached.role;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: shortLivedToken,
      },
      body: JSON.stringify({ query: ME_QUERY }),
    });

    if (!response.ok) {
      throw new Error(`monday role lookup failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: { me?: { is_admin?: boolean; is_guest?: boolean; is_view_only?: boolean } };
      errors?: unknown;
    };
    const me = json?.data?.me;
    if (!me) {
      throw new Error('monday role lookup returned no user data');
    }

    const role: MondayUserRole = {
      isAdmin: Boolean(me.is_admin),
      isGuest: Boolean(me.is_guest),
      isViewOnly: Boolean(me.is_view_only),
    };
    cache.set(shortLivedToken, { role, expiresAt: now + cacheTtlMs });
    return role;
  };
}
