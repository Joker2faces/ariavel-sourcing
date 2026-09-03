// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationsPanel } from '../src/frontend/sourcing/InvitationsPanel';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import type { SourcingEvent } from '../src/shared/types/domain';
import type { SupplierInvitation } from '../src/server/types/invitation';

afterEach(cleanup);

if (!navigator.clipboard) {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
}

const event: SourcingEvent = {
  id: 'ev-1', tenantId: 't1', reference: 'RFQ-1', title: 'Test RFQ', status: 'OPEN', currency: 'EUR',
  ownerUserId: 'u1', lines: [], supplierSelections: [
    { supplierId: 'sup-1', source: 'ARIAVEL', supplierNameSnapshot: 'Acme', emailSnapshot: 'acme@example.com', selectedAt: '2026-01-01T00:00:00Z' },
  ],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdByUserId: 'u1', updatedByUserId: 'u1',
};

function makeInvitation(overrides: Partial<SupplierInvitation> = {}): SupplierInvitation {
  return {
    id: 'inv-1', tenantId: 't1', eventId: 'ev-1', eventReference: 'RFQ-1', eventTitleSnapshot: 'Test RFQ',
    supplierId: 'sup-1', supplierNameSnapshot: 'Acme', supplierEmailSnapshot: 'acme@example.com',
    tokenHash: 'hash', status: 'CREATED', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    createdByUserId: 'u1', expiresAt: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

function mockClient(overrides: Partial<BuyerApiClient> = {}): BuyerApiClient {
  return {
    listInvitations: vi.fn().mockResolvedValue([]),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(), regenerateInvitation: vi.fn(),
    listQuotes: vi.fn().mockResolvedValue([]), getQuote: vi.fn(),
    buildComparison: vi.fn(), getLatestComparison: vi.fn(), listComparisons: vi.fn(),
    setManualTechnicalScore: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn(),
    createRecommendedAwardScenario: vi.fn(), createEmptyAwardScenario: vi.fn(), listAwardScenarios: vi.fn(), getAwardScenario: vi.fn(),
    awardLine: vi.fn(), clearAwardLine: vi.fn(), markAwardLineNoAward: vi.fn(), removeAwardLineAllocation: vi.fn(), finalizeAwardScenario: vi.fn(),
    listAuditEvents: vi.fn(), exportAuditCsv: vi.fn(),
    exportTenantData: vi.fn(), deleteTenantData: vi.fn(),
    ...overrides,
  };
}

describe('InvitationsPanel', () => {
  it('shows an uninvited supplier with a generate-link action, worded as manual delivery', async () => {
    render(<InvitationsPanel event={event} apiClient={mockClient()} serverAvailable={true} />);
    expect(await screen.findByText('Generate invitation link')).toBeInTheDocument();
    expect(screen.queryByText('Send invitation')).not.toBeInTheDocument();
  });

  it('shows the manual-delivery banner (copy link, copy message, mailto) right after generating a link', async () => {
    const user = userEvent.setup();
    const client = mockClient({
      createInvitation: vi.fn().mockResolvedValue({ invitation: makeInvitation(), portalToken: 'raw-token-123' }),
    });
    render(<InvitationsPanel event={event} apiClient={client} serverAvailable={true} />);
    await user.click(await screen.findByText('Generate invitation link'));

    expect(await screen.findByText('Link generated — not automatically sent')).toBeInTheDocument();
    expect(screen.getByText('Copy link')).toBeInTheDocument();
    expect(screen.getByText('Copy invitation message')).toBeInTheDocument();
    const mailLink = screen.getByText('Open email draft');
    expect(mailLink.getAttribute('href')).toContain('mailto:acme%40example.com');
  });

  it('never claims an invitation was emailed automatically', async () => {
    const client = mockClient({
      createInvitation: vi.fn().mockResolvedValue({ invitation: makeInvitation(), portalToken: 'raw-token-123' }),
    });
    render(<InvitationsPanel event={event} apiClient={client} serverAvailable={true} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Generate invitation link'));
    await screen.findByText('Link generated — not automatically sent');
    expect(screen.queryByText(/email sent/i)).not.toBeInTheDocument();
  });

  it('shows a manual refresh control and a last-updated timestamp', async () => {
    render(<InvitationsPanel event={event} apiClient={mockClient({ listInvitations: vi.fn().mockResolvedValue([makeInvitation()]) })} serverAvailable={true} />);
    expect(await screen.findByText('Refresh')).toBeInTheDocument();
    expect(await screen.findByText(/Last updated/)).toBeInTheDocument();
  });

  it('shows the invitation expiry date', async () => {
    render(<InvitationsPanel event={event} apiClient={mockClient({ listInvitations: vi.fn().mockResolvedValue([makeInvitation()]) })} serverAvailable={true} />);
    expect(await screen.findByText(/Expires/)).toBeInTheDocument();
  });
});
