import type { Request, Response, NextFunction } from 'express';
import { stageLog } from '../observability/stageLog.js';

/**
 * Low-noise completion log for every /api/buyer and /api/portal request —
 * method, route, status, durationMs, requestId only. No request bodies, no
 * Authorization headers, no session tokens, no query strings. This is
 * intentionally generic (unlike the fine-grained SETTINGS_ and AWARD_
 * stage logs) so any backend route that starts failing in real UAT is at
 * least visible without needing hand-instrumentation first.
 */
export function requestCompletionLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    stageLog(res.statusCode >= 500 ? 'error' : 'log', 'API_REQUEST_COMPLETE', {
      requestId: req.requestId,
      method: req.method,
      route: req.route ? `${req.baseUrl}${req.route.path as string}` : req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
}
