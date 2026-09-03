// @vitest-environment node
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyBuyerSessionToken, MondaySessionAuthError } from '../src/server/auth/mondaySessionAuth';

const CLIENT_SECRET = 'test-client-secret-minimum-32-chars!!';
const SIGNING_SECRET = 'completely-different-signing-secret!!';

function makeToken(dat: object, secret = CLIENT_SECRET, opts: jwt.SignOptions = { expiresIn: '1h' }) {
  return jwt.sign({ dat }, secret, opts);
}

describe('verifyBuyerSessionToken', () => {
  it('accepts valid token with correct payload shape', () => {
    const token = makeToken({ account_id: 123, user_id: 456, short_lived_token: 'slt' });
    const session = verifyBuyerSessionToken(token, CLIENT_SECRET);
    expect(session.accountId).toBe(123);
    expect(session.userId).toBe(456);
    expect(session.shortLivedToken).toBe('slt');
  });

  it('rejects token signed with wrong secret (Signing Secret cannot impersonate buyer)', () => {
    const token = makeToken({ account_id: 123, user_id: 456 }, SIGNING_SECRET);
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects expired token', () => {
    const token = makeToken({ account_id: 123, user_id: 456 }, CLIENT_SECRET, { expiresIn: '-1s' });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects malformed token string', () => {
    expect(() => verifyBuyerSessionToken('not.a.jwt', CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token missing dat field', () => {
    const token = jwt.sign({ accountId: 123, userId: 456 }, CLIENT_SECRET, { expiresIn: '1h' });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token with null dat', () => {
    const token = jwt.sign({ dat: null }, CLIENT_SECRET, { expiresIn: '1h' });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token with missing account_id', () => {
    const token = makeToken({ user_id: 456 });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token with zero account_id', () => {
    const token = makeToken({ account_id: 0, user_id: 456 });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token with missing user_id', () => {
    const token = makeToken({ account_id: 123 });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token with zero user_id', () => {
    const token = makeToken({ account_id: 123, user_id: 0 });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('rejects token with string account_id (type guard)', () => {
    const token = makeToken({ account_id: '123', user_id: 456 });
    expect(() => verifyBuyerSessionToken(token, CLIENT_SECRET)).toThrow(MondaySessionAuthError);
  });

  it('derives same accountId regardless of what buyer sends', () => {
    // Two different account IDs produce different sessions — buyer cannot inject another account
    const tokenA = makeToken({ account_id: 1001, user_id: 1 });
    const tokenB = makeToken({ account_id: 1002, user_id: 1 });
    const sessionA = verifyBuyerSessionToken(tokenA, CLIENT_SECRET);
    const sessionB = verifyBuyerSessionToken(tokenB, CLIENT_SECRET);
    expect(sessionA.accountId).toBe(1001);
    expect(sessionB.accountId).toBe(1002);
    expect(sessionA.accountId).not.toBe(sessionB.accountId);
  });
});
