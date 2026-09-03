// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwardWorkspacePage } from '../src/frontend/awards/AwardWorkspacePage';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import type { SourcingEventService } from '../src/backend/services/sourcingEventService';
import type { SourcingEvent } from '../src/shared/types/domain';
import type { AwardScenario } from '../src/shared/types/award';
import type { ComparisonSnapshot } from '../src/shared/types/bid';

afterEach(cleanup);

const event: SourcingEvent = {
  id: 'ev-1', tenantId: 't1', reference: 'RFQ-1', title: 'Test RFQ', status: 'OPEN', currency: 'EUR',
  ownerUserId: 'u1', lines: [{ id: 'l1', description: 'Widget', quantity: 100, unit: 'pcs' }],
  supplierSelections: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  createdByUserId: 'u1', updatedByUserId: 'u1',
};

function mockEventService(): SourcingEventService {
  return { list: vi.fn().mockResolvedValue([event]) } as unknown as SourcingEventService;
}

function makeScenario(overrides: Partial<AwardScenario> = {}): AwardScenario {
  return {
    id: 'scn-1', tenantId: 't1', eventId: 'ev-1', comparisonSnapshotId: 'snap-1', name: 'Recommended',
    awardType: 'LINE',
    lines: [{ lineId: 'l1', lineDescription: 'Widget', requestedQuantity: 100, unit: 'pcs', status: 'AWARDED', allocations: [
      { supplierId: 'sup-A', supplierName: 'Alpha', quantity: 100, awardedUnitPrice: 9, awardedCurrency: 'EUR', landedUnitCost: 9.5, extendedLandedCost: 950 },
    ], isManualOverride: false }],
    summary: { totalAllocatedCost: 950, supplierCount: 1, lineCount: 1, awardedLineCount: 1, noAwardLineCount: 0, supplierConcentration: [] },
    isFinalized: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdByUserId: 'u1',
    ...overrides,
  };
}

function makeSnapshot(): ComparisonSnapshot {
  return {
    id: 'snap-1', tenantId: 't1', eventId: 'ev-1', baseCurrency: 'EUR', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
    normalizedQuotes: [], lineBestPrices: [], commercialComparisons: [], evaluationCriteria: [], supplierScores: [],
    createdAt: '2026-01-01T00:00:00Z', createdByUserId: 'u1',
  };
}

function mockClient(overrides: Partial<BuyerApiClient> = {}): BuyerApiClient {
  return {
    listInvitations: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn(), regenerateInvitation: vi.fn(),
    listQuotes: vi.fn(), getQuote: vi.fn(), buildComparison: vi.fn(), getLatestComparison: vi.fn(),
    listComparisons: vi.fn().mockResolvedValue([makeSnapshot()]), setManualTechnicalScore: vi.fn(),
    getSettings: vi.fn(), updateSettings: vi.fn(),
    createRecommendedAwardScenario: vi.fn(), createEmptyAwardScenario: vi.fn(),
    listAwardScenarios: vi.fn().mockResolvedValue([]),
    getAwardScenario: vi.fn(),
    awardLine: vi.fn(), clearAwardLine: vi.fn(), markAwardLineNoAward: vi.fn(),
    removeAwardLineAllocation: vi.fn(), finalizeAwardScenario: vi.fn(),
    listAuditEvents: vi.fn(), exportAuditCsv: vi.fn(),
    exportTenantData: vi.fn(), deleteTenantData: vi.fn(),
    ...overrides,
  };
}

describe('AwardWorkspacePage', () => {
  it('shows a not-connected message with no apiClient', () => {
    render(<AwardWorkspacePage eventService={mockEventService()} apiClient={null} serverAvailable={false} />);
    expect(screen.getByText('Sign in through monday to continue')).toBeInTheDocument();
  });

  it('prompts to choose an event before showing scenarios', async () => {
    render(<AwardWorkspacePage eventService={mockEventService()} apiClient={mockClient()} serverAvailable={true} />);
    expect(await screen.findByText('Choose a sourcing event')).toBeInTheDocument();
  });

  it('offers to create a scenario once an event with no scenarios is selected', async () => {
    const user = userEvent.setup();
    render(<AwardWorkspacePage eventService={mockEventService()} apiClient={mockClient()} serverAvailable={true} />);
    await user.selectOptions(await screen.findByLabelText('Select sourcing event'), 'ev-1');
    expect(await screen.findByText('No award scenarios yet')).toBeInTheDocument();
    expect(screen.getByText('+ Recommended scenario')).toBeInTheDocument();
  });

  it('renders an existing scenario with its lines and finalize button', async () => {
    const user = userEvent.setup();
    const client = mockClient({ listAwardScenarios: vi.fn().mockResolvedValue([makeScenario()]), getAwardScenario: vi.fn().mockResolvedValue(makeScenario()) });
    render(<AwardWorkspacePage eventService={mockEventService()} apiClient={client} serverAvailable={true} />);
    await user.selectOptions(await screen.findByLabelText('Select sourcing event'), 'ev-1');
    await user.selectOptions(await screen.findByLabelText('Select award scenario'), 'scn-1');

    expect(await screen.findByText('Finalize award')).toBeInTheDocument();
    expect(screen.getByText(/Alpha — 100 pcs/)).toBeInTheDocument();
  });

  it('finalizes a scenario when every line has been decided', async () => {
    const user = userEvent.setup();
    const finalized = makeScenario({ isFinalized: true, finalizedAt: '2026-01-02T00:00:00Z' });
    const client = mockClient({
      listAwardScenarios: vi.fn().mockResolvedValue([makeScenario()]),
      getAwardScenario: vi.fn().mockResolvedValue(makeScenario()),
      finalizeAwardScenario: vi.fn().mockResolvedValue(finalized),
    });
    render(<AwardWorkspacePage eventService={mockEventService()} apiClient={client} serverAvailable={true} />);
    await user.selectOptions(await screen.findByLabelText('Select sourcing event'), 'ev-1');
    await user.selectOptions(await screen.findByLabelText('Select award scenario'), 'scn-1');

    await user.click(await screen.findByText('Finalize award'));
    await waitFor(() => expect(client.finalizeAwardScenario).toHaveBeenCalledWith('scn-1'));
    expect(await screen.findByText(/this award is now immutable/)).toBeInTheDocument();
  });
});
