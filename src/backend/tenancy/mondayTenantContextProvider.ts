import type { MondayRuntimeAdapter } from '../runtime/mondayRuntime';
import type { TenantContext, TenantContextProvider } from './tenantContext';

export function createMondayTenantContextProvider(
  runtime: MondayRuntimeAdapter,
): TenantContextProvider & { initialize(): Promise<TenantContext> } {
  let resolved: TenantContext | undefined;

  return {
    async initialize(): Promise<TenantContext> {
      const context = await runtime.getContext();
      const accountId = String(context.account.id);
      if (!accountId) throw new Error('Monday context did not provide an account ID. Cannot derive tenant.');
      resolved = { tenantId: accountId };
      return resolved;
    },

    getTenantContext(): TenantContext {
      if (!resolved) throw new Error('Tenant context used before initialization. Call initialize() first.');
      return resolved;
    },
  };
}
