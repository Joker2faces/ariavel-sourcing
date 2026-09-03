import { createHash, randomBytes } from 'crypto';
export function generateRawToken() {
    return randomBytes(32).toString('hex');
}
export function hashToken(rawToken) {
    return createHash('sha256').update(rawToken).digest('hex');
}
