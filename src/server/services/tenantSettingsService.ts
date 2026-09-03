import type { TenantSettingsRepository } from '../db/tenantSettingsRepository.js';
import type { AuditRepository } from '../db/auditRepository.js';
import { defaultTenantSettings, type TenantSettings, type TenantSettingsInput } from '../../shared/types/tenantSettings.js';

export class SettingsConflictError extends Error {
  constructor() { super('Settings were changed by someone else — reload and try again'); }
}

export interface TenantSettingsService {
  getSettings(tenantId: string): Promise<TenantSettings>;
  updateSettings(tenantId: string, input: TenantSettingsInput, expectedVersion: number, userId: string, now: string): Promise<TenantSettings>;
}

function mergeSettings(current: TenantSettings, input: TenantSettingsInput, now: string, userId: string): TenantSettings {
  return {
    ...current,
    organization: { ...current.organization, ...input.organization },
    sourcing: { ...current.sourcing, ...input.sourcing },
    comparison: {
      ...current.comparison,
      ...input.comparison,
      weights: { ...current.comparison.weights, ...input.comparison?.weights },
    },
    security: { ...current.security, ...input.security },
    onboardingCompletedAt: input.onboardingCompletedAt ?? current.onboardingCompletedAt,
    version: current.version + 1,
    updatedAt: now,
    updatedByUserId: userId,
  };
}

export function createTenantSettingsService(
  repo: TenantSettingsRepository,
  auditRepo: AuditRepository,
): TenantSettingsService {
  return {
    async getSettings(tenantId) {
      const existing = await repo.get(tenantId);
      return existing ?? defaultTenantSettings(tenantId, new Date().toISOString());
    },

    async updateSettings(tenantId, input, expectedVersion, userId, now) {
      const current = (await repo.get(tenantId)) ?? defaultTenantSettings(tenantId, now);
      const merged = mergeSettings(current, input, now, userId);
      const saved = await repo.setWithVersion(merged, expectedVersion);
      if (!saved) throw new SettingsConflictError();
      await auditRepo.log(tenantId, 'SETTINGS_UPDATED', tenantId, 'settings', 'buyer', userId, now, {
        fields: Object.keys(input).join(','),
      });
      return saved;
    },
  };
}
