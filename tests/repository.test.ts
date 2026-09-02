import { describe, expect, it } from 'vitest';
import { mockSourcingRepository } from '../src/backend/repositories/mockSourcingRepository';
describe('mock sourcing repository', () => { it('returns recent events with tenant-scoped records', async () => { const records = await mockSourcingRepository.listRecentEvents(); expect(records).toHaveLength(10); expect(records.every(record => record.tenantId === 'mock-tenant')).toBe(true); }); });
