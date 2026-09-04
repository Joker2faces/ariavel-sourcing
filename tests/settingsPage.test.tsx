// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../src/frontend/settings/SettingsPage';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import { fullCapabilities } from '../src/backend/runtime/runtimeCapabilities';
import { defaultTenantSettings } from '../src/shared/types/tenantSettings';

afterEach(cleanup);

function mockClient(overrides: Partial<BuyerApiClient> = {}): BuyerApiClient {
  return {
    listInvitations: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn(), regenerateInvitation: vi.fn(),
    listQuotes: vi.fn(), getQuote: vi.fn(), buildComparison: vi.fn(), getLatestComparison: vi.fn(), listComparisons: vi.fn(),
    setManualTechnicalScore: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn(),
    createRecommendedAwardScenario: vi.fn(), createEmptyAwardScenario: vi.fn(), listAwardScenarios: vi.fn(), getAwardScenario: vi.fn(),
    awardLine: vi.fn(), clearAwardLine: vi.fn(), markAwardLineNoAward: vi.fn(), removeAwardLineAllocation: vi.fn(), finalizeAwardScenario: vi.fn(),
    listAuditEvents: vi.fn(), exportAuditCsv: vi.fn(), exportTenantData: vi.fn(), deleteTenantData: vi.fn(),
    listEventAttachments: vi.fn(), initiateEventAttachmentUpload: vi.fn(), uploadAttachmentBytes: vi.fn(),
    confirmAttachmentUpload: vi.fn(), deleteAttachment: vi.fn(), downloadAttachment: vi.fn(),
    listQuoteAttachments: vi.fn(), downloadQuoteTemplate: vi.fn(),
    ...overrides,
  };
}

describe('SettingsPage load states', () => {
  it('shows the Loading state before getSettings resolves', () => {
    const client = mockClient({ getSettings: vi.fn(() => new Promise<never>(() => {})) });
    render(<SettingsPage capabilities={fullCapabilities} serverBaseUrl="" serverAvailable={true} apiClient={client} />);
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
  });

  it('shows Loaded content once getSettings resolves', async () => {
    const client = mockClient({ getSettings: vi.fn().mockResolvedValue(defaultTenantSettings('t1', '2026-01-01T00:00:00Z')) });
    render(<SettingsPage capabilities={fullCapabilities} serverBaseUrl="" serverAvailable={true} apiClient={client} />);
    await waitFor(() => expect(screen.getByText('Configure Ariavel Sourcing for your organization.')).toBeInTheDocument());
    expect(screen.queryByText('Loading settings…')).not.toBeInTheDocument();
  });

  it('UAT regression: shows a recoverable error with Retry instead of hanging forever when getSettings rejects', async () => {
    // Real UAT report: Settings got stuck on "Loading settings…"
    // indefinitely with no way out. The page must never be a dead end —
    // a failed load has to surface a retry path.
    const client = mockClient({ getSettings: vi.fn().mockRejectedValue(new Error('Timed out waiting for monday session token')) });
    render(<SettingsPage capabilities={fullCapabilities} serverBaseUrl="" serverAvailable={true} apiClient={client} />);
    await waitFor(() => expect(screen.getByText('Could not load settings from the server.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Retry re-invokes getSettings and recovers into the Loaded state', async () => {
    const getSettings = vi.fn()
      .mockRejectedValueOnce(new Error('Timed out waiting for monday session token'))
      .mockResolvedValueOnce(defaultTenantSettings('t1', '2026-01-01T00:00:00Z'));
    const client = mockClient({ getSettings });
    const user = userEvent.setup();
    render(<SettingsPage capabilities={fullCapabilities} serverBaseUrl="" serverAvailable={true} apiClient={client} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Configure Ariavel Sourcing for your organization.')).toBeInTheDocument());
    expect(getSettings).toHaveBeenCalledTimes(2);
  });
});
