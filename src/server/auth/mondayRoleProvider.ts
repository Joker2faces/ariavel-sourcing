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
 *
 * Scope: the `me` query requires the `me:read` OAuth scope specifically
 * (distinct from `users:read`, which gates the `users` query) — confirmed
 * against developer.monday.com/api-reference/reference/me. `boards:read`
 * (this app's only other scope) does not cover it.
 *
 * Fields: `is_admin`/`is_guest`/`is_view_only` are deprecated as of API
 * version 2026-07 in favor of a single `kind` field (ADMIN/MEMBER/GUEST/
 * VIEW_ONLY/AGENT_MEMBER/PORTAL), scheduled for removal in 2026-10
 * (developer.monday.com/api-reference/docs/migrating-user-entity-to-2026-10).
 * This app pins MONDAY_API_VERSION '2026-07' (src/backend/runtime/
 * mondayRuntime.ts) — squarely inside the deprecated-but-not-yet-removed
 * window, so both `kind` and the legacy booleans are queried together;
 * `kind` is authoritative when present, the booleans are the fallback for
 * any account still served an older response shape. Revisit this file
 * before pinning API version 2026-10 or later — the boolean fields will be
 * removed and this fallback becomes dead code.
 */

export interface MondayUserRole {
  isAdmin: boolean;
  isGuest: boolean;
  isViewOnly: boolean;
}

export type MondayRoleProvider = (shortLivedToken: string) => Promise<MondayUserRole>;

const ME_QUERY = `query { me { kind is_admin is_guest is_view_only } }`;
const CACHE_TTL_MS = 60_000;

interface CacheEntry { role: MondayUserRole; expiresAt: number }

interface RawMe {
  kind?: string | null;
  is_admin?: boolean;
  is_guest?: boolean;
  is_view_only?: boolean;
}

const KNOWN_KINDS = new Set(['ADMIN', 'MEMBER', 'GUEST', 'VIEW_ONLY', 'AGENT_MEMBER', 'PORTAL']);

function roleFromRawMe(me: RawMe): MondayUserRole {
  const kind = me.kind?.toUpperCase();
  if (kind) {
    // AGENT_MEMBER and PORTAL are non-human/portal-scoped kinds introduced
    // alongside `kind` — treat them as view-only rather than silently
    // granting edit capability to a kind this code doesn't recognize yet.
    // Any kind outside the set monday currently documents (a future kind
    // added on monday's side before this code is updated for it) must also
    // deny mutation by default — falling through to
    // { isAdmin: false, isGuest: false, isViewOnly: false } would read as
    // "ordinary member" to requireAwardEditCapability and silently grant
    // write access to a role this code has never evaluated.
    return {
      isAdmin: kind === 'ADMIN',
      isGuest: kind === 'GUEST',
      isViewOnly: kind === 'VIEW_ONLY' || kind === 'AGENT_MEMBER' || kind === 'PORTAL' || !KNOWN_KINDS.has(kind),
    };
  }
  return {
    isAdmin: Boolean(me.is_admin),
    isGuest: Boolean(me.is_guest),
    isViewOnly: Boolean(me.is_view_only),
  };
}

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

    const json = (await response.json()) as { data?: { me?: RawMe }; errors?: unknown };
    const me = json?.data?.me;
    if (!me) {
      throw new Error('monday role lookup returned no user data');
    }

    const role = roleFromRawMe(me);
    cache.set(shortLivedToken, { role, expiresAt: now + cacheTtlMs });
    return role;
  };
}
