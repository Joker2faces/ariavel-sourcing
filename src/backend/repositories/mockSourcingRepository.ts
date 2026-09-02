import type { SourcingEvent } from '../../shared/types/domain';
import type { SourcingRepository } from './sourcingRepository';

const events: SourcingEvent[] = [
  ['Q3 Packaging Materials', 'active', '2026-09-05T17:00:00', 8, 15],
  ['Warehouse Safety Equipment', 'active', '2026-09-07T12:00:00', 6, 12],
  ['Regional Freight Tender', 'closing_soon', '2026-09-02T10:00:00', 9, 18],
  ['IT Hardware & Peripherals', 'awaiting_quotes', '2026-09-09T15:00:00', 3, 10],
  ['Facility Cleaning Services', 'active', '2026-09-12T09:00:00', 5, 9],
  ['MRO Supplies', 'awaiting_quotes', '2026-09-10T11:00:00', 2, 8],
  ['Employee Uniforms', 'closing_soon', '2026-09-03T16:00:00', 7, 12],
  ['Marketing Collateral Print', 'active', '2026-09-13T17:00:00', 4, 7],
  ['Renewable Energy Solutions', 'completed', '2026-08-15T17:00:00', 12, 12],
  ['Office Furniture', 'completed', '2026-08-10T12:00:00', 10, 10],
].map(([title, status, deadline, response, supplier], index) => ({ id: `rfq-${index + 1}`, tenantId: 'mock-tenant', title: title as string, status: status as SourcingEvent['status'], deadline: deadline as string, currency: 'EUR', createdAt: '2026-08-01T09:00:00', createdBy: 'mock-user', supplierResponseCount: response as number, supplierCount: supplier as number }));

export const mockSourcingRepository: SourcingRepository = { async listRecentEvents() { return events; } };
