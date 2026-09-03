import type { Request, Response, NextFunction } from 'express';

function hasDangerousKeys(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (value === null || typeof value !== 'object') return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) return true;
    if (hasDangerousKeys((value as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

export function noSqlInjectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.body && hasDangerousKeys(req.body)) {
    res.status(400).json({ error: 'Invalid request payload' });
    return;
  }
  next();
}
