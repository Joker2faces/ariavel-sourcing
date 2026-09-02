export interface TenantContext { tenantId: string; }
export interface TenantContextProvider { getTenantContext(): TenantContext; }

export const developmentTenantContextProvider: TenantContextProvider = {
  getTenantContext: () => ({ tenantId: 'ariavel-development-tenant' }),
};
