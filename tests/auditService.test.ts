// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createAuditService } from '../src/server/services/auditService';
import { createInMemoryAuditRepository } from '../src/server/db/inMemoryAuditRepository';

const TENANT = 'monday-account-1';
const OTHER_TENANT = 'monday-account-2';
const NOW = '2026-09-03T10:00:00.000Z';
const LATER = '2026-09-03T11:00:00.000Z';

function seed() {
  const repo = createInMemoryAuditRepository();
  return repo;
}

describe('AuditService', () => {
  it('lists events for the tenant, most recent first', async () => {
    const repo = seed();
    await repo.log(TENANT, 'INVITATION_CREATED', 'inv-1', 'invitation', 'buyer', 'u1', NOW, 'event-1');
    await repo.log(TENANT, 'INVITATION_OPENED', 'inv-1', 'invitation', 'supplier', 'sup-1', LATER, 'event-1');
    const svc = createAuditService(repo);
    const events = await svc.listEvents(TENANT);
    expect(events).toHaveLength(2);
    expect(events[0].action).toBe('INVITATION_OPENED');
  });

  it('never returns another tenant\'s events', async () => {
    const repo = seed();
    await repo.log(TENANT, 'INVITATION_CREATED', 'inv-1', 'invitation', 'buyer', 'u1', NOW, 'event-1');
    await repo.log(OTHER_TENANT, 'INVITATION_CREATED', 'inv-2', 'invitation', 'buyer', 'u2', NOW, 'event-2');
    const svc = createAuditService(repo);
    const events = await svc.listEvents(TENANT);
    expect(events).toHaveLength(1);
    expect(events[0].tenantId).toBe(TENANT);
  });

  it('filters by eventId', async () => {
    const repo = seed();
    await repo.log(TENANT, 'INVITATION_CREATED', 'inv-1', 'invitation', 'buyer', 'u1', NOW, 'event-1');
    await repo.log(TENANT, 'INVITATION_CREATED', 'inv-2', 'invitation', 'buyer', 'u1', NOW, 'event-2');
    const svc = createAuditService(repo);
    const events = await svc.listEvents(TENANT, { eventId: 'event-1' });
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe('inv-1');
  });

  it('filters by action', async () => {
    const repo = seed();
    await repo.log(TENANT, 'INVITATION_CREATED', 'inv-1', 'invitation', 'buyer', 'u1', NOW, 'event-1');
    await repo.log(TENANT, 'QUOTE_SUBMITTED', 'q-1', 'quote', 'supplier', 'sup-1', NOW, 'event-1');
    const svc = createAuditService(repo);
    const events = await svc.listEvents(TENANT, { action: 'QUOTE_SUBMITTED' });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('QUOTE_SUBMITTED');
  });

  it('exports CSV with a header row and no secrets', async () => {
    const repo = seed();
    await repo.log(TENANT, 'INVITATION_CREATED', 'inv-1', 'invitation', 'buyer', 'u1', NOW, 'event-1', { supplierId: 'sup-1' });
    const svc = createAuditService(repo);
    const csv = await svc.exportCsv(TENANT);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('timestamp,action,entityType,entityId,eventId,actorType,actorId,metadata');
    expect(lines).toHaveLength(2);
    expect(csv).not.toMatch(/tokenHash|rawToken|MONDAY_CLIENT_SECRET|mongodb:\/\//i);
  });

  it('CSV-escapes values containing commas or quotes', async () => {
    const repo = seed();
    await repo.log(TENANT, 'SETTINGS_UPDATED', TENANT, 'settings', 'buyer', 'u1', NOW, undefined, { fields: 'organization,sourcing' });
    const svc = createAuditService(repo);
    const csv = await svc.exportCsv(TENANT);
    expect(csv).toContain('"');
  });
});
