// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createTenantSettingsService, SettingsConflictError } from '../src/server/services/tenantSettingsService';
import { createInMemoryTenantSettingsRepository } from '../src/server/db/inMemoryTenantSettingsRepository';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';

const TENANT = 'monday-account-9999';
const USER_ID = 'user-1';
const NOW = '2026-09-03T10:00:00.000Z';

function buildService() {
  return createTenantSettingsService(createInMemoryTenantSettingsRepository(), createInMemoryAuditRepository());
}

describe('TenantSettingsService', () => {
  it('returns sensible defaults when nothing has been saved yet', async () => {
    const svc = buildService();
    const settings = await svc.getSettings(TENANT);
    expect(settings.organization.defaultCurrency).toBe('EUR');
    expect(settings.comparison.weights.landedCost + settings.comparison.weights.leadTime + settings.comparison.weights.completeness).toBe(100);
    expect(settings.version).toBe(0);
  });

  it('creates settings on first update (expectedVersion 0) and persists them', async () => {
    const svc = buildService();
    const updated = await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'Acme Corp' } }, 0, USER_ID, NOW);
    expect(updated.organization.companyDisplayName).toBe('Acme Corp');
    expect(updated.version).toBe(1);

    const reloaded = await svc.getSettings(TENANT);
    expect(reloaded.organization.companyDisplayName).toBe('Acme Corp');
    expect(reloaded.version).toBe(1);
  });

  it('merges partial updates without clobbering unrelated fields', async () => {
    const svc = buildService();
    await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'Acme Corp', supportEmail: 'a@acme.com' } }, 0, USER_ID, NOW);
    const second = await svc.updateSettings(TENANT, { sourcing: { defaultRfqDeadlineDays: 45 } }, 1, USER_ID, NOW);
    expect(second.organization.companyDisplayName).toBe('Acme Corp');
    expect(second.organization.supportEmail).toBe('a@acme.com');
    expect(second.sourcing.defaultRfqDeadlineDays).toBe(45);
  });

  it('merges partial evaluation weights without resetting untouched weights', async () => {
    const svc = buildService();
    await svc.updateSettings(TENANT, {}, 0, USER_ID, NOW);
    const updated = await svc.updateSettings(TENANT, { comparison: { weights: { landedCost: 70 } } }, 1, USER_ID, NOW);
    expect(updated.comparison.weights.landedCost).toBe(70);
    expect(updated.comparison.weights.leadTime).toBe(20);
    expect(updated.comparison.weights.completeness).toBe(20);
  });

  it('rejects a stale expectedVersion with a conflict', async () => {
    const svc = buildService();
    await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'v1' } }, 0, USER_ID, NOW);
    await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'v2' } }, 1, USER_ID, NOW);

    await expect(
      svc.updateSettings(TENANT, { organization: { companyDisplayName: 'stale-write' } }, 1, USER_ID, NOW),
    ).rejects.toThrow(SettingsConflictError);
  });

  it('rejects creating twice with expectedVersion 0 (concurrent first-create)', async () => {
    const svc = buildService();
    await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'first' } }, 0, USER_ID, NOW);
    await expect(
      svc.updateSettings(TENANT, { organization: { companyDisplayName: 'second' } }, 0, USER_ID, NOW),
    ).rejects.toThrow(SettingsConflictError);
  });

  it('keeps tenants fully isolated from each other', async () => {
    const svc = buildService();
    await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'Tenant A' } }, 0, USER_ID, NOW);
    const otherTenantSettings = await svc.getSettings('monday-account-other');
    expect(otherTenantSettings.organization.companyDisplayName).toBe('');
  });

  it('records onboardingCompletedAt and preserves it across later updates', async () => {
    const svc = buildService();
    const withOnboarding = await svc.updateSettings(TENANT, { onboardingCompletedAt: NOW }, 0, USER_ID, NOW);
    expect(withOnboarding.onboardingCompletedAt).toBe(NOW);
    const later = await svc.updateSettings(TENANT, { organization: { companyDisplayName: 'X' } }, 1, USER_ID, NOW);
    expect(later.onboardingCompletedAt).toBe(NOW);
  });
});
