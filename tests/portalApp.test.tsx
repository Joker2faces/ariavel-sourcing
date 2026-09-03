// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalApp } from '../src/frontend/portal/PortalApp';
import { PortalApiError, type PortalApiClient } from '../src/frontend/portal/portalApiClient';
import type { InvitationPublicDTO } from '../src/server/types/invitation';

afterEach(cleanup);

function makeInvitation(overrides: Partial<InvitationPublicDTO> = {}): InvitationPublicDTO {
  return {
    id: 'inv-1',
    eventReference: 'RFQ-42',
    eventTitle: 'Q3 Packaging Materials',
    supplierName: 'Acme Supplies',
    lines: [{ lineId: 'l1', description: 'Corrugated boxes', quantity: 5000, unit: 'pcs' }],
    status: 'OPENED',
    ...overrides,
  };
}

function mockClient(overrides: Partial<PortalApiClient> = {}): PortalApiClient {
  return {
    getInvitation: vi.fn().mockResolvedValue(makeInvitation()),
    getQuote: vi.fn().mockResolvedValue(null),
    saveDraft: vi.fn().mockResolvedValue({ id: 'q1', status: 'DRAFT', lines: [] }),
    submit: vi.fn().mockResolvedValue({ status: 'SUBMITTED', submittedAt: '2026-02-01T10:00:00Z' }),
    ...overrides,
  };
}

describe('PortalApp — public supplier portal, no monday context', () => {
  it('runs with no monday iframe, no sessionToken, and no runtime-mode detection involved', async () => {
    // window.self === window.top here (jsdom default) — the same condition
    // that would show the buyer app's "open in monday" state. The portal
    // must not care about that signal at all; it is driven purely by the
    // token prop and its own API client.
    expect(window.self).toBe(window.top);
    render(<PortalApp token="raw-token-abc" client={mockClient()} />);
    expect(await screen.findByText('Q3 Packaging Materials')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown token', async () => {
    const client = mockClient({ getInvitation: vi.fn().mockRejectedValue(new PortalApiError(404, 'Invitation not found')) });
    render(<PortalApp token="bad-token" client={client} />);
    expect(await screen.findByText("We couldn't find this invitation")).toBeInTheDocument();
  });

  it('shows a closed state for an expired or revoked invitation', async () => {
    const client = mockClient({ getInvitation: vi.fn().mockRejectedValue(new PortalApiError(410, 'Invitation has expired')) });
    render(<PortalApp token="expired-token" client={client} />);
    expect(await screen.findByText('This invitation is no longer open')).toBeInTheDocument();
    expect(screen.getByText('Invitation has expired')).toBeInTheDocument();
  });

  it('renders the RFQ lines from the invitation and lets the supplier fill in a price', async () => {
    const user = userEvent.setup();
    const client = mockClient();
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');
    expect(screen.getAllByText(/5000 pcs/).length).toBeGreaterThan(0);

    const priceInput = screen.getByLabelText('Unit price for Corrugated boxes');
    await user.type(priceInput, '1.25');
    await user.click(screen.getByText('Save draft'));

    await waitFor(() => expect(client.saveDraft).toHaveBeenCalledWith('tok', expect.objectContaining({
      lines: [expect.objectContaining({ lineId: 'l1', unitPrice: 1.25 })],
    })));
  });

  it('requires confirmation before submitting, then shows an immutable submitted state', async () => {
    const user = userEvent.setup();
    const client = mockClient();
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');

    await user.click(screen.getByText('Review & submit'));
    expect(screen.getByText('Submit this quote?')).toBeInTheDocument();

    await user.click(screen.getByText('Submit quote'));

    await waitFor(() => expect(client.submit).toHaveBeenCalledWith('tok'));
    expect(await screen.findByText('Quote submitted')).toBeInTheDocument();
    expect(screen.queryByText('Save draft')).not.toBeInTheDocument();
  });

  it('shows the already-submitted state directly for a SUBMITTED invitation, without loading a quote form', async () => {
    const client = mockClient({
      getInvitation: vi.fn().mockResolvedValue(makeInvitation({ status: 'SUBMITTED', submittedAt: '2026-02-01T10:00:00Z' })),
    });
    render(<PortalApp token="tok" client={client} />);
    expect(await screen.findByText('Quote submitted')).toBeInTheDocument();
    expect(client.getQuote).not.toHaveBeenCalled();
  });
});
