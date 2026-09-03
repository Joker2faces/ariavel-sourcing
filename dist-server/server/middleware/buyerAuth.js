import { verifyBuyerSessionToken, MondaySessionAuthError } from '../auth/mondaySessionAuth.js';
export function createBuyerAuthMiddleware(clientSecret) {
    return (req, res, next) => {
        // MONDAY_CLIENT_SECRET not yet configured (first-release bootstrap).
        // Refuse all buyer requests with 503 — authentication is NOT bypassed.
        if (!clientSecret) {
            res.status(503).json({ error: 'Service not configured — MONDAY_CLIENT_SECRET is missing' });
            return;
        }
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Missing Authorization header' });
            return;
        }
        const token = authHeader.slice(7);
        try {
            req.buyerAuth = verifyBuyerSessionToken(token, clientSecret);
            next();
        }
        catch (err) {
            if (err instanceof MondaySessionAuthError) {
                res.status(401).json({ error: err.message });
            }
            else {
                res.status(401).json({ error: 'Authentication failed' });
            }
        }
    };
}
export function tenantIdFromAuth(req) {
    if (!req.buyerAuth)
        throw new Error('No buyer auth on request');
    return `monday-account-${req.buyerAuth.accountId}`;
}
export function userIdFromAuth(req) {
    if (!req.buyerAuth)
        throw new Error('No buyer auth on request');
    return String(req.buyerAuth.userId);
}
