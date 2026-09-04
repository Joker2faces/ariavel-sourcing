// Structured stage-boundary diagnostics for tracing a specific request
// through backend/Document-DB layers without exposing secrets.
//
// mapps code:logs' console viewer was observed to render pure single-argument
// JSON-string console.error/log lines as "[console]null" during real UAT
// investigation — almost certainly because a log platform underneath
// promotes a line that IS valid JSON into a structured payload the CLI's
// text renderer doesn't know how to read back. Passing the tag and the
// JSON payload as two separate console arguments keeps the line from being
// parsed as a single JSON document, which keeps it visible through that
// viewer while still being machine-greppable.
export function stageLog(
  level: 'log' | 'warn' | 'error',
  stage: string,
  fields: Record<string, unknown>,
): void {
  console[level](stage, JSON.stringify(fields));
}

export function safeError(err: unknown): { errorName: string; error: string } {
  return {
    errorName: err instanceof Error ? err.name : typeof err,
    error: err instanceof Error ? err.message : String(err),
  };
}
