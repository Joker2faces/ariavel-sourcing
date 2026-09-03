// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityPanel } from '../src/frontend/sourcing/ActivityPanel';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import type { SourcingEvent } from '../src/shared/types/domain';
import type { AuditEvent } from '../src/server/types/audit';

afterEach(cleanup);

// jsdom does not implement these — stub them so the export flow doesn't throw.
if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock-url');
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();

const event: SourcingEvent = {
  id: 'ev-1', tenantId: 't1', reference: 'RFQ-1', title: 'Test RFQ', status: 'OPEN', currency: 'EUR',
  ownerUserId: 'u1', lines: [], supplierSelections: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  createdByUserId: 'u1', updatedByUserId: 'u1',
};

function makeEvents(): AuditEvent[] {
  return [
    { id: 'a1', tenantId: 't1', action: 'INVITATION_CREATED', entityId: 'inv-1', entityType: 'invitation', actorType: 'buyer', actorId: 'u1', timestamp: '2026-01-01T10:00:00Z', eventId: 'ev-1' },
    { id: 'a2', tenantId: 't1', action: 'QUOTE_SUBMITTED', entityId: 'q-1', entityType: 'quote', actorType: 'supplier', actorId: 'sup-1', timestamp: '2026-01-01T11:00:00Z', eventId: 'ev-1' },
  ];
}

function mockClient(overrides: Partial<BuyerApiClient> = {}): BuyerApiClient {
  return {
    listInvitations: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn(), regenerateInvitation: vi.fn(),
    listQuotes: vi.fn(), getQuote: vi.fn(), buildComparison: vi.fn(), getLatestComparison: vi.fn(), listComparisons: vi.fn(),
    setManualTechnicalScore: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn(),
    createRecommendedAwardScenario: vi.fn(), createEmptyAwardScenario: vi.fn(), listAwardScenarios: vi.fn(), getAwardScenario: vi.fn(),
    awardLine: vi.fn(), clearAwardLine: vi.fn(), markAwardLineNoAward: vi.fn(), removeAwardLineAllocation: vi.fn(), finalizeAwardScenario: vi.fn(),
    listAuditEvents: vi.fn().mockResolvedValue(makeEvents()),
    exportAuditCsv: vi.fn().mockResolvedValue(new Blob(['csv'])),
    exportTenantData: vi.fn(), deleteTenantData: vi.fn(),
    ...overrides,
  };
}

describe('ActivityPanel', () => {
  it('shows a not-connected message with no apiClient', () => {
    render(<ActivityPanel event={event} apiClient={null} serverAvailable={false} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });

  it('lists activity for the event', async () => {
    render(<ActivityPanel event={event} apiClient={mockClient()} serverAvailable={true} />);
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Invitation created')).toBeInTheDocument();
    expect(within(list).getByText('Quote submitted')).toBeInTheDocument();
  });

  it('filters by actor', async () => {
    const user = userEvent.setup();
    render(<ActivityPanel event={event} apiClient={mockClient()} serverAvailable={true} />);
    const list = await screen.findByRole('list');
    await user.selectOptions(screen.getByLabelText('Filter by actor'), 'supplier');
    expect(within(list).queryByText('Invitation created')).not.toBeInTheDocument();
    expect(within(list).getByText('Quote submitted')).toBeInTheDocument();
  });

  it('shows an empty state when there is no activity', async () => {
    render(<ActivityPanel event={event} apiClient={mockClient({ listAuditEvents: vi.fn().mockResolvedValue([]) })} serverAvailable={true} />);
    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });

  it('triggers a CSV export', async () => {
    const user = userEvent.setup();
    const client = mockClient();
    render(<ActivityPanel event={event} apiClient={client} serverAvailable={true} />);
    await screen.findByRole('list');
    await user.click(screen.getByText('Export CSV'));
    expect(client.exportAuditCsv).toHaveBeenCalledWith('ev-1');
  });
});
