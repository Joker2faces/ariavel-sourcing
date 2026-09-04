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
    quoteTemplateUrl: vi.fn().mockReturnValue('/api/portal/invitations/tok/quote-template'),
    importQuote: vi.fn().mockResolvedValue({ status: 'VALID', rows: [], errors: [], warnings: [] }),
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

  it('marking a line No Bid clears and disables its priced fields', async () => {
    const user = userEvent.setup();
    const client = mockClient();
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');

    const priceInput = screen.getByLabelText('Unit price for Corrugated boxes');
    await user.type(priceInput, '4.50');
    expect(priceInput).toHaveValue(4.5);

    const noBidCheckbox = screen.getByLabelText('No bid for Corrugated boxes');
    await user.click(noBidCheckbox);

    expect(priceInput).toBeDisabled();
    expect(priceInput).toHaveValue(null);
    expect(screen.getByLabelText('Currency for Corrugated boxes')).toBeDisabled();
    expect(screen.getByLabelText('Lead time in days for Corrugated boxes')).toBeDisabled();
    expect(screen.getByLabelText('Minimum order quantity for Corrugated boxes')).toBeDisabled();

    await user.click(screen.getByText('Save draft'));
    await waitFor(() => expect(client.saveDraft).toHaveBeenCalledWith('tok', expect.objectContaining({
      lines: [expect.objectContaining({ lineId: 'l1', unitPrice: undefined, currency: undefined })],
    })));
  });

  it('closes the submit confirmation on Escape without submitting', async () => {
    const user = userEvent.setup();
    const client = mockClient();
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');

    await user.click(screen.getByText('Review & submit'));
    expect(screen.getByText('Submit this quote?')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Submit this quote?')).not.toBeInTheDocument();
    expect(client.submit).not.toHaveBeenCalled();
  });

  it('offers a template download link built from the invitation lines', async () => {
    const client = mockClient();
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');
    expect(client.quoteTemplateUrl).toHaveBeenCalledWith('tok', 'RFQ-42', expect.arrayContaining([expect.objectContaining({ lineId: 'l1' })]));
    expect(screen.getByText('Download template').closest('a')).toHaveAttribute('href', '/api/portal/invitations/tok/quote-template');
  });

  it('imports a CSV file and fills in the matching line, without auto-submitting', async () => {
    const user = userEvent.setup();
    const client = mockClient({
      importQuote: vi.fn().mockResolvedValue({
        status: 'VALID',
        rows: [{ lineId: 'l1', unitPrice: 4.5, currency: 'USD', leadTimeDays: 10, moq: 100 }],
        errors: [],
        warnings: [],
      }),
    });
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');

    const file = new File(['line_id,unit_price\nl1,4.5'], 'quote.csv', { type: 'text/csv' });
    const input = screen.getByLabelText('Import quote from CSV file');
    await user.upload(input, file);

    await waitFor(() => expect(client.importQuote).toHaveBeenCalledWith('tok', expect.stringContaining('l1'), ['l1'], 'RFQ-42'));
    expect(await screen.findByText(/Imported 1 line/)).toBeInTheDocument();
    expect(screen.getByLabelText('Unit price for Corrugated boxes')).toHaveValue(4.5);
    expect(client.saveDraft).not.toHaveBeenCalled();
    expect(client.submit).not.toHaveBeenCalled();
  });

  it('shows import errors without touching existing line values', async () => {
    const user = userEvent.setup();
    const client = mockClient({
      importQuote: vi.fn().mockResolvedValue({
        status: 'ERROR',
        rows: [],
        errors: [{ row: 2, field: 'line_id', message: 'line_id "bogus" does not exist in this RFQ' }],
        warnings: [],
      }),
    });
    render(<PortalApp token="tok" client={client} />);
    await screen.findByText('Corrugated boxes');

    const file = new File(['line_id,unit_price\nbogus,4.5'], 'quote.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Import quote from CSV file'), file);

    expect(await screen.findByText(/could not be imported/)).toBeInTheDocument();
    expect(screen.getByText(/does not exist in this RFQ/)).toBeInTheDocument();
    expect(screen.getByLabelText('Unit price for Corrugated boxes')).toHaveValue(null);
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
