/**
 * monday Code exposes two distinct facilities: Environment Variables and
 * Secrets. A value entered under Developer Center -> Host on monday ->
 * Server-side code -> Secrets is NOT automatically exposed as
 * process.env.<KEY> — it must be read via the SDK's SecretsManager, which
 * (in a real deployed container, detected by the K_SERVICE env var Cloud
 * Run sets) reads from a mounted secrets file, not the process environment.
 * Reading process.env.MONDAY_CLIENT_SECRET directly is exactly the bug that
 * caused every buyer route to 503 with the secret already configured.
 */
export interface SecretProvider {
  get(key: string): Promise<string | undefined>;
}

export async function createMondayCodeSecretProvider(): Promise<SecretProvider> {
  const { SecretsManager } = await import('@mondaycom/apps-sdk');
  const secretsManager = new SecretsManager();
  return {
    async get(key) {
      const value = secretsManager.get(key);
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    },
  };
}

/** Local development / first-boot fallback — reads plain process.env. */
export function createEnvironmentSecretProvider(): SecretProvider {
  return {
    async get(key) {
      const value = process.env[key];
      return value && value.length > 0 ? value : undefined;
    },
  };
}

/** Test-only provider with no environment or filesystem dependency. */
export function createInMemorySecretProvider(secrets: Record<string, string> = {}): SecretProvider {
  return {
    async get(key) {
      return secrets[key];
    },
  };
}

/**
 * K_SERVICE is set by Cloud Run (which monday Code runs on) and is exactly
 * the signal the SDK's own isLocalEnvironment() check uses internally — so
 * this selection matches how SecretsManager itself decides where to read
 * from, rather than introducing a second, possibly inconsistent heuristic.
 */
export async function createDefaultSecretProvider(): Promise<SecretProvider> {
  if (process.env['K_SERVICE']) {
    return createMondayCodeSecretProvider();
  }
  return createEnvironmentSecretProvider();
}
