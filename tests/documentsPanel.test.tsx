// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentsPanel } from '../src/frontend/sourcing/DocumentsPanel';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import type { SourcingEvent } from '../src/shared/types/domain';
import type { SupplierInvitation } from '../src/server/types/invitation';
import type { Attachment } from '../src/shared/types/document';

afterEach(cleanup);

const event: SourcingEvent = {
  id: 'ev-1', tenantId: 't1', reference: 'RFQ-1', title: 'Test RFQ', status: 'OPEN', currency: 'EUR',
  ownerUserId: 'u1', lines: [], supplierSelections: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  createdByUserId: 'u1', updatedByUserId: 'u1',
};

function makeInvitation(overrides: Partial<SupplierInvitation> = {}): SupplierInvitation {
  return {
    id: 'inv-1', tenantId: 't1', eventId: 'ev-1', eventReference: 'RFQ-1', eventTitleSnapshot: 'Test RFQ',
    supplierId: 'sup-1', supplierNameSnapshot: 'Acme', supplierEmailSnapshot: 'a@acme.com',
    tokenHash: 'hash', status: 'SUBMITTED', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdByUserId: 'u1',
    ...overrides,
  };
}

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1', tenantId: 't1', entityType: 'event', entityId: 'ev-1', objectKey: 'key-1',
    filename: 'spec.pdf', mimeType: 'application/pdf', sizeBytes: 1024, status: 'READY',
    uploadedByUserId: 'u1', uploadedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockClient(overrides: Partial<BuyerApiClient> = {}): BuyerApiClient {
  return {
    listInvitations: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn(), regenerateInvitation: vi.fn(),
    listQuotes: vi.fn(), getQuote: vi.fn(), buildComparison: vi.fn(), getLatestComparison: vi.fn(), listComparisons: vi.fn(),
    setManualTechnicalScore: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn(),
    createRecommendedAwardScenario: vi.fn(), createEmptyAwardScenario: vi.fn(), listAwardScenarios: vi.fn(), getAwardScenario: vi.fn(),
    awardLine: vi.fn(), clearAwardLine: vi.fn(), markAwardLineNoAward: vi.fn(), removeAwardLineAllocation: vi.fn(), finalizeAwardScenario: vi.fn(),
    listAuditEvents: vi.fn(), exportAuditCsv: vi.fn(), exportTenantData: vi.fn(), deleteTenantData: vi.fn(),
    listEventAttachments: vi.fn().mockResolvedValue([]),
    initiateEventAttachmentUpload: vi.fn(),
    uploadAttachmentBytes: vi.fn(),
    confirmAttachmentUpload: vi.fn(),
    deleteAttachment: vi.fn(),
    downloadAttachment: vi.fn(),
    listQuoteAttachments: vi.fn().mockResolvedValue([]),
    downloadQuoteTemplate: vi.fn(),
    ...overrides,
  };
}

describe('DocumentsPanel', () => {
  it('shows RFQ documents and lets a buyer download one', async () => {
    const user = userEvent.setup();
    const client = mockClient({ listEventAttachments: vi.fn().mockResolvedValue([makeAttachment()]) });
    render(<DocumentsPanel event={event} invitations={[]} apiClient={client} serverAvailable={true} />);

    expect(await screen.findByText('spec.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Download spec.pdf/i }));
    expect(client.downloadAttachment).toHaveBeenCalledWith('att-1', 'spec.pdf');
  });

  it('shows an empty state when there are no RFQ documents', async () => {
    render(<DocumentsPanel event={event} invitations={[]} apiClient={mockClient()} serverAvailable={true} />);
    expect(await screen.findByText('No RFQ documents yet')).toBeInTheDocument();
  });

  it('uploads a file: initiates, PUTs bytes, confirms, then reloads the list', async () => {
    const client = mockClient({
      initiateEventAttachmentUpload: vi.fn().mockResolvedValue({ attachmentId: 'att-2', uploadUrl: '/upload', objectKey: 'k', expiresAt: '2026-01-01T00:00:00Z' }),
      listEventAttachments: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeAttachment({ id: 'att-2', filename: 'new-doc.pdf' })]),
    });
    render(<DocumentsPanel event={event} invitations={[]} apiClient={client} serverAvailable={true} />);
    await screen.findByText('No RFQ documents yet');

    const file = new File(['%PDF'], 'new-doc.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Upload RFQ document') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => expect(client.initiateEventAttachmentUpload).toHaveBeenCalledWith('ev-1', 'new-doc.pdf', 'application/pdf', file.size));
    expect(client.uploadAttachmentBytes).toHaveBeenCalledWith('/upload', file);
    expect(client.confirmAttachmentUpload).toHaveBeenCalledWith('att-2');
    expect(await screen.findByText('new-doc.pdf')).toBeInTheDocument();
  });

  it('rejects an oversized file client-side without calling the API', async () => {
    const client = mockClient();
    render(<DocumentsPanel event={event} invitations={[]} apiClient={client} serverAvailable={true} />);
    await screen.findByText('No RFQ documents yet');

    const bigFile = new File([new Uint8Array(1)], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 26 * 1024 * 1024 });
    await userEvent.upload(screen.getByLabelText('Upload RFQ document'), bigFile);

    expect(await screen.findByText(/larger than the 25 MB limit/)).toBeInTheDocument();
    expect(client.initiateEventAttachmentUpload).not.toHaveBeenCalled();
  });

  it('groups supplier quote documents by supplier name', async () => {
    const client = mockClient({
      listQuoteAttachments: vi.fn().mockResolvedValue([makeAttachment({ id: 'att-3', entityType: 'quote', entityId: 'inv-1', filename: 'certificate.pdf' })]),
    });
    render(<DocumentsPanel event={event} invitations={[makeInvitation()]} apiClient={client} serverAvailable={true} />);

    expect(await screen.findByText('certificate.pdf')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('shows sign-in state with no apiClient, and backend-unavailable when apiClient exists but health check failed', () => {
    render(<DocumentsPanel event={event} invitations={[]} apiClient={null} serverAvailable={false} />);
    expect(screen.getByText('Sign in through monday to continue')).toBeInTheDocument();
    cleanup();
    render(<DocumentsPanel event={event} invitations={[]} apiClient={mockClient()} serverAvailable={false} />);
    expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
  });
});
