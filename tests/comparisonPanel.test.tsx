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
    listEventAttachments: vi.fn(), initiateEventAttachmentUpload: vi.fn(), uploadAttachmentBytes: vi.fn(),
    confirmAttachmentUpload: vi.fn(), deleteAttachment: vi.fn(), downloadAttachment: vi.fn(),
    listQuoteAttachments: vi.fn(), downloadQuoteTemplate: vi.fn(),
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
    expect(screen.getByText('Sign in through monday to continue')).toBeInTheDocument();
  });

  it('switches to the Evaluation view and lets a buyer set a technical score', async () => {
    const user = userEvent.setup();
    const snapshot: ComparisonSnapshot = {
      ...makeSnapshot(),
      evaluationCriteria: [{ key: 'LANDED_COST', label: 'Landed cost', weight: 60 }, { key: 'LEAD_TIME', label: 'Lead time', weight: 40 }],
      supplierScores: [{ supplierId: 'sup-1', totalScore: 82, criteria: [
        { key: 'LANDED_COST', rawValue: 100, normalizedScore: 90, weightedContribution: 54 },
        { key: 'LEAD_TIME', rawValue: 10, normalizedScore: 70, weightedContribution: 28 },
      ] }],
      normalizedQuotes: [{ supplierId: 'sup-1', supplierName: 'Acme', status: 'SUBMITTED', quoteCurrency: 'EUR', lines: [], totalBidLines: 0 } as unknown as ComparisonSnapshot['normalizedQuotes'][number]],
    };
    const client = mockClient({
      getLatestComparison: vi.fn().mockResolvedValue(snapshot),
      setManualTechnicalScore: vi.fn().mockResolvedValue({ ...snapshot, supplierScores: [{ ...snapshot.supplierScores[0], manualTechnicalScore: 88 }] }),
    });
    render(<ComparisonPanel event={event} apiClient={client} serverAvailable={true} />);

    await user.click(await screen.findByText('Evaluation'));
    expect(document.querySelector('.evaluation-panel')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Set technical score for Acme/i }));
    await user.type(screen.getByLabelText('Technical score'), '88');
    await user.click(screen.getByText('Save'));

    await waitFor(() => expect(client.setManualTechnicalScore).toHaveBeenCalledWith('snap-1', 'sup-1', 88, undefined));
  });
});
