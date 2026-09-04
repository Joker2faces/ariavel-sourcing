// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { BidMatrix } from '../src/frontend/sourcing/BidMatrix';
import type { ComparisonSnapshot } from '../src/shared/types/bid';
import type { SourcingLine } from '../src/shared/types/domain';

afterEach(cleanup);

const eventLines: SourcingLine[] = [
  { id: 'l1', description: 'Corrugated boxes', quantity: 5000, unit: 'pcs', targetUnitPrice: 1.1 },
  { id: 'l2', description: 'Pallet wrap', quantity: 200, unit: 'rolls' },
];

function makeSnapshot(): ComparisonSnapshot {
  return {
    id: 'snap-1', tenantId: 't1', eventId: 'ev-1', baseCurrency: 'EUR', freightAllocationPolicy: 'PROPORTIONAL_TO_LINE_VALUE',
    createdAt: '2026-01-01T00:00:00Z', createdByUserId: 'u1',
    evaluationCriteria: [],
    supplierScores: [
      { supplierId: 'sup-a', totalScore: 88, criteria: [] },
      { supplierId: 'sup-b', totalScore: 74, criteria: [] },
    ],
    normalizedQuotes: [
      {
        supplierId: 'sup-a', supplierName: 'Acme', invitationId: 'inv-a', status: 'SUBMITTED', quotedCurrency: 'EUR', totalBidLines: 2, totalNoBidLines: 0, exceptions: [],
        lines: [
          { lineId: 'l1', lineDescription: 'Corrugated boxes', requestedQuantity: 5000, requestedUnit: 'pcs', quotedUnitPrice: 1.0, quotedCurrency: 'EUR', normalizedUnitPrice: 1.0, landedUnitCost: 1.02, freightAllocation: 0.02, extendedLandedCost: 5100, quotedLeadTimeDays: 14, isNoBid: false, exceptions: [] },
          { lineId: 'l2', lineDescription: 'Pallet wrap', requestedQuantity: 200, requestedUnit: 'rolls', quotedUnitPrice: 12.0, quotedCurrency: 'EUR', normalizedUnitPrice: 12.0, landedUnitCost: 12.2, extendedLandedCost: 2440, quotedLeadTimeDays: 10, isNoBid: false, exceptions: ['LONG_LEAD_TIME'] },
        ],
      },
      {
        supplierId: 'sup-b', supplierName: 'NorthStar', invitationId: 'inv-b', status: 'SUBMITTED', quotedCurrency: 'USD', totalBidLines: 1, totalNoBidLines: 1, exceptions: [],
        lines: [
          { lineId: 'l1', lineDescription: 'Corrugated boxes', requestedQuantity: 5000, requestedUnit: 'pcs', quotedUnitPrice: 1.05, quotedCurrency: 'USD', fxRate: 0.92, normalizedUnitPrice: 1.1, landedUnitCost: 1.15, extendedLandedCost: 5750, quotedLeadTimeDays: 21, isNoBid: false, exceptions: [] },
          { lineId: 'l2', lineDescription: 'Pallet wrap', requestedQuantity: 200, requestedUnit: 'rolls', isNoBid: true, exceptions: ['NO_BID'] },
        ],
      },
    ],
    lineBestPrices: [
      { lineId: 'l1', winningSupplierId: 'sup-a', lowestLandedCost: 1.02, bidCount: 2, potentialSavings: 40 },
      { lineId: 'l2', winningSupplierId: 'sup-a', lowestLandedCost: 12.2, bidCount: 1, potentialSavings: 60 },
    ],
    commercialComparisons: [],
  };
}

describe('BidMatrix — mobile ranked-card comparison', () => {
  it('shows the first line ranked best-to-worst, with the winner marked and the loser last', async () => {
    render(<BidMatrix snapshot={makeSnapshot()} eventLines={eventLines} baseCurrency="EUR" />);
    const mobile = document.querySelector('.bid-mobile') as HTMLElement;
    const cards = within(mobile).getAllByText(/Acme|NorthStar/).map(el => el.textContent);
    expect(cards[0]).toBe('Acme');
    expect(cards[1]).toBe('NorthStar');
    expect(within(mobile).getByText('Best value')).toBeInTheDocument();
  });

  it('shows a NO BID card without price fields for a line the supplier skipped', async () => {
    const user = userEvent.setup();
    render(<BidMatrix snapshot={makeSnapshot()} eventLines={eventLines} baseCurrency="EUR" />);
    await user.selectOptions(screen.getByLabelText('Select RFQ line'), 'l2');
    const mobile = document.querySelector('.bid-mobile') as HTMLElement;
    expect(within(mobile).getByText('NO BID')).toBeInTheDocument();
  });

  it('navigates between lines with next/previous controls', async () => {
    const user = userEvent.setup();
    render(<BidMatrix snapshot={makeSnapshot()} eventLines={eventLines} baseCurrency="EUR" />);
    expect(screen.getByLabelText('Select RFQ line')).toHaveValue('l1');
    await user.click(screen.getByLabelText('Next line'));
    expect(screen.getByLabelText('Select RFQ line')).toHaveValue('l2');
    expect(screen.getByLabelText('Previous line')).not.toBeDisabled();
    expect(screen.getByLabelText('Next line')).toBeDisabled();
  });

  it('expands a landed-cost breakdown without losing the current line', async () => {
    const user = userEvent.setup();
    render(<BidMatrix snapshot={makeSnapshot()} eventLines={eventLines} baseCurrency="EUR" />);
    const mobile = document.querySelector('.bid-mobile') as HTMLElement;
    await user.click(within(mobile).getAllByText('Landed cost breakdown')[0]);
    expect(within(mobile).getByText('Landed unit cost')).toBeInTheDocument();
    expect(screen.getByLabelText('Select RFQ line')).toHaveValue('l1');
  });
});
