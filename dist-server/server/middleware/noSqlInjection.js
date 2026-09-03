function hasDangerousKeys(value, depth = 0) {
    if (depth > 5)
        return false;
    if (value === null || typeof value !== 'object')
        return false;
    for (const key of Object.keys(value)) {
        if (key.startsWith('$') || key.includes('.'))
            return true;
        if (hasDangerousKeys(value[key], depth + 1))
            return true;
    }
    return false;
}
export function noSqlInjectionMiddleware(req, res, next) {
    if (req.body && hasDangerousKeys(req.body)) {
        res.status(400).json({ error: 'Invalid request payload' });
        return;
    }
    next();
}
