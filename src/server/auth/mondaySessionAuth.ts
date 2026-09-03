/**
 * monday.get("sessionToken") JWT verification.
 *
 * The session token is generated for a monday view/client app and is signed
 * with the APP CLIENT SECRET (not the Signing Secret). The Signing Secret is
 * used separately for monday-originated webhook/lifecycle requests.
 *
 * Current monday session token payload shape:
 *   { dat: { account_id, user_id, short_lived_token? }, iat, exp }
 *
 * Ref: https://developer.monday.com/apps/docs/mondayget#sessiontoken
 */
import jwt from 'jsonwebtoken';

interface MondayTokenDat {
  account_id: number;
  user_id: number;
  short_lived_token?: string;
}

interface MondayTokenRaw {
  dat: MondayTokenDat;
  iat?: number;
  exp?: number;
}

export interface MondayViewSession {
  accountId: number;
  userId: number;
  shortLivedToken?: string;
}

export class MondaySessionAuthError extends Error {
  constructor(msg: string) { super(msg); this.name = 'MondaySessionAuthError'; }
}

export function verifyBuyerSessionToken(rawToken: string, clientSecret: string): MondayViewSession {
  let decoded: MondayTokenRaw;
  try {
    decoded = jwt.verify(rawToken, clientSecret) as MondayTokenRaw;
  } catch {
    throw new MondaySessionAuthError('Invalid or expired session token');
  }

  const dat = decoded?.dat;
  if (!dat || typeof dat !== 'object') {
    throw new MondaySessionAuthError('Session token missing dat payload');
  }
  const accountId = dat.account_id;
  const userId = dat.user_id;
  if (typeof accountId !== 'number' || accountId <= 0) {
    throw new MondaySessionAuthError('Session token missing account_id');
  }
  if (typeof userId !== 'number' || userId <= 0) {
    throw new MondaySessionAuthError('Session token missing user_id');
  }
  return { accountId, userId, shortLivedToken: dat.short_lived_token };
}

/**
 * Verify an HMAC-signed monday-originated request. Uses MONDAY_SIGNING_SECRET.
 * Per current monday docs (developer.monday.com/apps/docs/webhooks-1), this
 * secret verifies board/item integration webhooks specifically — NOT app
 * lifecycle events, which are JWT-signed with the Client Secret instead (see
 * verifyAppLifecycleToken below). Unused until a board/item webhook route is
 * actually added — do not wire this up speculatively.
 */
import crypto from 'crypto';

export function verifyMondaySignedRequest(
  body: string,
  signature: string,
  signingSecret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * App lifecycle events (install / uninstall / subscription changes) arrive as
 * a POST with a JWT in the Authorization header, signed with the app's
 * CLIENT SECRET (not the Signing Secret) — confirmed against current monday
 * docs (developer.monday.com/apps/docs/integration-authorization). Decoded
 * payload shape: { accountId, userId, aud, exp, shortLivedToken, iat } — note
 * the top-level camelCase fields, unlike the buyer sessionToken's nested
 * `dat` wrapper.
 */
interface MondayLifecycleTokenRaw {
  accountId: number;
  userId?: number;
  aud?: string;
  iat?: number;
  exp?: number;
  shortLivedToken?: string;
}

export interface MondayLifecycleEvent {
  accountId: number;
  userId?: number;
}

export function verifyAppLifecycleToken(rawToken: string, clientSecret: string): MondayLifecycleEvent {
  let decoded: MondayLifecycleTokenRaw;
  try {
    decoded = jwt.verify(rawToken, clientSecret) as MondayLifecycleTokenRaw;
  } catch {
    throw new MondaySessionAuthError('Invalid or expired lifecycle event token');
  }
  if (typeof decoded?.accountId !== 'number' || decoded.accountId <= 0) {
    throw new MondaySessionAuthError('Lifecycle event token missing accountId');
  }
  return { accountId: decoded.accountId, userId: decoded.userId };
}
