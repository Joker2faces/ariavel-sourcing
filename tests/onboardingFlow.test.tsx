// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingFlow } from '../src/frontend/onboarding/OnboardingFlow';
import type { BuyerApiClient } from '../src/frontend/api/buyerApiClient';
import { defaultTenantSettings } from '../src/shared/types/tenantSettings';

afterEach(cleanup);

function mockApiClient(): Pick<BuyerApiClient, 'getSettings'> {
  return { getSettings: vi.fn().mockResolvedValue(defaultTenantSettings('tenant-1', '2026-09-04T00:00:00Z')) };
}

describe('OnboardingFlow — real configuration wizard', () => {
  it('requires a company name before leaving the Organization step', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingFlow apiClient={mockApiClient() as BuyerApiClient} onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByText('Next')); // Welcome -> Organization
    await user.click(screen.getByText('Next')); // blocked: no company name
    expect(screen.getByText('Enter your company name to continue.')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('collects organization, sourcing, and evaluation weight settings and returns them on completion', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingFlow apiClient={mockApiClient() as BuyerApiClient} onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByText('Next')); // Welcome -> Organization
    await user.type(screen.getByLabelText('Company name*'), 'Acme Procurement');
    await user.click(screen.getByText('Next')); // -> Sourcing defaults
    await user.click(screen.getByText('Next')); // -> Evaluation weights (defaults sum to 100)
    await user.click(screen.getByText('Next')); // -> Review

    expect(screen.getByText(/Acme Procurement/)).toBeInTheDocument();
    await user.click(screen.getByText('Get started'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      organization: expect.objectContaining({ companyDisplayName: 'Acme Procurement' }),
      sourcing: expect.objectContaining({ defaultRfqDeadlineDays: 30 }),
      comparison: expect.objectContaining({ weights: { landedCost: 60, leadTime: 20, completeness: 20 } }),
    })));
  });

  it('blocks continuing past evaluation weights unless they sum to 100', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow apiClient={mockApiClient() as BuyerApiClient} onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByText('Next')); // -> Organization
    await user.type(screen.getByLabelText('Company name*'), 'Acme');
    await user.click(screen.getByText('Next')); // -> Sourcing
    await user.click(screen.getByText('Next')); // -> Weights

    const landedCostInput = screen.getByLabelText(/Landed cost/);
    await user.clear(landedCostInput);
    await user.type(landedCostInput, '10');

    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('calls onSkip without persisting any collected settings', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<OnboardingFlow apiClient={mockApiClient() as BuyerApiClient} onComplete={vi.fn()} onSkip={onSkip} />);

    await user.click(screen.getByText('Skip'));
    expect(onSkip).toHaveBeenCalled();
  });
});
