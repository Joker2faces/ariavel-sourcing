import { describe, expect, it } from 'vitest';
import { mockSourcingEvents } from '../src/backend/repositories/mockSourcingRepository';
import type { SourcingEvent } from '../src/shared/types/domain';

describe('mock sourcing events', () => {
  it('returns M4 draft events for local development', () => {
    expect(mockSourcingEvents.length).toBeGreaterThan(0);
    expect(mockSourcingEvents.every((e: SourcingEvent) => e.tenantId === 'ariavel-development-tenant')).toBe(true);
    expect(mockSourcingEvents.every((e: SourcingEvent) => Array.isArray(e.lines))).toBe(true);
    expect(mockSourcingEvents.every((e: SourcingEvent) => Array.isArray(e.supplierSelections))).toBe(true);
  });

  it('includes events with line items', () => {
    const withLines = mockSourcingEvents.filter((e: SourcingEvent) => e.lines.length > 0);
    expect(withLines.length).toBeGreaterThan(0);
  });
});
