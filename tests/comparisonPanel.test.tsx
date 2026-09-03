// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComparisonPanel } from '../src/frontend/sourcing/ComparisonPanel';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import type { SourcingEvent } from '../src/shared/types/domain';
import type { ComparisonSnapshot } from '../src/shared/types/bid';

afterEach(cleanup);

const event: SourcingEvent = {
  id: 'ev-1', tenantId: 't1', reference: 'RFQ-1', title: 'Test RFQ', status: 'OPEN', currency: 'EUR',
  ownerUserId: 'u1', lines: [{ id: 'l1', description: 'Widget', quantity: 100, unit: 'pcs' }],
  supplierSelections: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  createdByUserId: 'u1', updatedByUserId: 'u1',
};

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
    listQuotes: vi.fn(), getQuote: vi.fn(),
    buildComparison: vi.fn(),
    getLatestComparison: vi.fn().mockResolvedValue(null),
    listComparisons: vi.fn().mockResolvedValue([]),
    setManualTechnicalScore: vi.fn(),
    getSettings: vi.fn(), updateSettings: vi.fn(),
    createRecommendedAwardScenario: vi.fn(), createEmptyAwardScenario: vi.fn(),
    listAwardScenarios: vi.fn(), getAwardScenario: vi.fn(),
    awardLine: vi.fn(), clearAwardLine: vi.fn(), markAwardLineNoAward: vi.fn(),
    removeAwardLineAllocation: vi.fn(), finalizeAwardScenario: vi.fn(),
    listAuditEvents: vi.fn(), exportAuditCsv: vi.fn(),
    exportTenantData: vi.fn(), deleteTenantData: vi.fn(),
    ...overrides,
  };
}

describe('ComparisonPanel', () => {
  it('shows an empty state when no comparison has been built yet', async () => {
    render(<ComparisonPanel event={event} apiClient={mockClient()} serverAvailable={true} />);
    expect(await screen.findByText('No comparison yet')).toBeInTheDocument();
  });

  it('renders the bid matrix once a comparison snapshot exists', async () => {
    const client = mockClient({ getLatestComparison: vi.fn().mockResolvedValue(makeSnapshot()) });
    render(<ComparisonPanel event={event} apiClient={client} serverAvailable={true} />);
    expect(await screen.findByText('Rebuild comparison')).toBeInTheDocument();
    expect(document.querySelector('.bid-matrix')).toBeTruthy();
  });

  it('builds a new comparison and shows the resulting matrix', async () => {
    const user = userEvent.setup();
    const client = mockClient({ buildComparison: vi.fn().mockResolvedValue(makeSnapshot()) });
    render(<ComparisonPanel event={event} apiClient={client} serverAvailable={true} />);

    await user.click(await screen.findByText('Build comparison'));
    await user.click(screen.getByText('Build snapshot'));

    await waitFor(() => expect(client.buildComparison).toHaveBeenCalledWith('ev-1', event.lines, expect.objectContaining({ baseCurrency: 'EUR' })));
    expect(await screen.findByText('Rebuild comparison')).toBeInTheDocument();
  });

  it('shows an offline message when there is no apiClient', () => {
    render(<ComparisonPanel event={event} apiClient={null} serverAvailable={false} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });
});
