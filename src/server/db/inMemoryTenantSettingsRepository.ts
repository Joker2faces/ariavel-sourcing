import type { TenantSettingsRepository } from './tenantSettingsRepository.js';
import type { TenantSettings } from '../../shared/types/tenantSettings.js';

export function createInMemoryTenantSettingsRepository(): TenantSettingsRepository {
  const store = new Map<string, TenantSettings>();

  return {
    async get(tenantId) {
      const doc = store.get(tenantId);
      return doc ? { ...doc } : null;
    },

    async setWithVersion(settings, expectedVersion) {
      const existing = store.get(settings.tenantId);
      if (expectedVersion === 0) {
        if (existing) return null;
        store.set(settings.tenantId, { ...settings });
        return { ...settings };
      }
      if (!existing || existing.version !== expectedVersion) return null;
      store.set(settings.tenantId, { ...settings });
      return { ...settings };
    },
  };
}
