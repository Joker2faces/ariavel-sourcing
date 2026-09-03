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
 * Verify a monday-originated signed request (webhooks, lifecycle callbacks).
 * Uses MONDAY_SIGNING_SECRET. This is a different trust mechanism from
 * the buyer session token.
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
