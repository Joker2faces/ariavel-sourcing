import { randomBytes } from 'crypto';
export function requestIdMiddleware(req, res, next) {
    const id = randomBytes(8).toString('hex');
    req.requestId = id;
    res.setHeader('X-Request-ID', id);
    next();
}
