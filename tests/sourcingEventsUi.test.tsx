// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/frontend/App';
import { createInMemorySourcingEventRepository } from '../src/backend/repositories/inMemorySourcingEventRepository';
import { createInMemorySupplierRepository } from '../src/backend/repositories/inMemorySupplierRepository';
import { createSourcingEventService } from '../src/backend/services/sourcingEventService';
import { createSupplierService } from '../src/backend/services/supplierService';
import { mockMondayBoardProvider } from '../src/backend/providers/mockMondayBoardProvider';
import type { Supplier, SourcingEvent } from '../src/shared/types/domain';

afterEach(cleanup);

const DEV_TENANT = 'ariavel-development-tenant';

const mockSuppliers: Supplier[] = [
  { id: 'sup-1', tenantId: DEV_TENANT, name: 'Acme Corp', status: 'ACTIVE', preferred: true, email: 'acme@example.com', supplierCode: 'AC-001', category: 'Chemicals', country: 'Germany', sourceType: 'ARIAVEL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-2', tenantId: DEV_TENANT, name: 'Beta Ltd', status: 'ACTIVE', preferred: false, email: 'beta@example.com', sourceType: 'ARIAVEL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sup-blocked', tenantId: DEV_TENANT, name: 'Blocked Co', status: 'BLOCKED', preferred: false, sourceType: 'ARIAVEL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const seedEvents: SourcingEvent[] = [
  {
    id: 'ev-1', tenantId: DEV_TENANT, reference: 'RFQ-2026-AA', title: 'Packaging Q4', status: 'DRAFT',
    currency: 'EUR', ownerUserId: 'user-1', ownerName: 'Dev User',
    lines: [{ id: 'l1', description: 'Boxes 60x40', quantity: 500, unit: 'pcs' }],
    supplierSelections: [{ supplierId: 'sup-1', source: 'ARIAVEL', supplierNameSnapshot: 'Acme Corp', emailSnapshot: 'acme@example.com', selectedAt: '2026-09-01T00:00:00Z' }],
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    createdByUserId: 'user-1', updatedByUserId: 'user-1',
  },
  {
    id: 'ev-2', tenantId: DEV_TENANT, reference: 'RFQ-2026-BB', title: 'Safety Equipment', status: 'READY_FOR_INVITATION',
    currency: 'USD', ownerUserId: 'user-1', ownerName: 'Dev User',
    lines: [{ id: 'l2', description: 'Helmets', quantity: 50, unit: 'pcs' }],
    supplierSelections: [],
    createdAt: '2026-09-01T01:00:00Z', updatedAt: '2026-09-01T01:00:00Z',
    createdByUserId: 'user-1', updatedByUserId: 'user-1',
  },
];

function makeEventService(events: SourcingEvent[] = seedEvents, suppliers: Supplier[] = mockSuppliers) {
  const tenantProvider = { getTenantContext: () => ({ tenantId: DEV_TENANT }) };
  const supplierRepo = createInMemorySupplierRepository(suppliers);
  const supplierSvc = createSupplierService(supplierRepo, tenantProvider, mockMondayBoardProvider);
  const eventRepo = createInMemorySourcingEventRepository(events);
  return createSourcingEventService(eventRepo, tenantProvider, supplierSvc);
}

async function openSourcingEvents() {
  expect(await screen.findByRole('heading', { name: 'Sourcing Events', level: 1 })).toBeInTheDocument();
}

describe('Sourcing Events Page', () => {
  it('renders event list with references and titles', async () => {
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    const refs = await screen.findAllByText('RFQ-2026-AA');
    expect(refs.length).toBeGreaterThan(0);
    const titles = await screen.findAllByText('Packaging Q4');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('shows empty state when no events exist', async () => {
    render(<App eventService={makeEventService([])} />);
    await openSourcingEvents();
    expect(await screen.findByText('No sourcing events yet')).toBeInTheDocument();
  });

  it('searches events by title', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.type(screen.getByRole('searchbox', { name: 'Search events' }), 'Safety');
    expect(await screen.findAllByText('Safety Equipment')).toBeTruthy();
    expect(screen.queryByText('Packaging Q4')).not.toBeInTheDocument();
  });

  it('filters events by status', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.selectOptions(screen.getByLabelText('Status'), 'DRAFT');
    await screen.findAllByText('Packaging Q4');
    expect(screen.queryByText('Safety Equipment')).not.toBeInTheDocument();
  });

  it('resets filters', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.selectOptions(screen.getByLabelText('Status'), 'DRAFT');
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await screen.findAllByText('Safety Equipment');
    await screen.findAllByText('Packaging Q4');
  });

  it('shows empty filter state with reset option', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.type(screen.getByRole('searchbox', { name: 'Search events' }), 'does-not-exist-xyz');
    expect(await screen.findByText(/No sourcing events match/)).toBeInTheDocument();
    const resetBtns = screen.getAllByRole('button', { name: 'Reset filters' });
    expect(resetBtns.length).toBeGreaterThan(0);
  });
});

describe('Create Event Wizard', () => {
  it('opens wizard on Create button click', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    const createBtns = screen.getAllByRole('button', { name: /Create sourcing event/i });
    await user.click(createBtns[0]);
    expect(await screen.findByRole('heading', { name: 'Create Sourcing Event' })).toBeInTheDocument();
  });

  it('step 1 validation blocks progress with missing title', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.click(screen.getAllByRole('button', { name: /Create sourcing event/i })[0]);
    await screen.findByRole('heading', { name: 'Create Sourcing Event' });
    const titleField = screen.getByLabelText(/Title/i);
    await user.clear(titleField);
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('Event title is required.')).toBeInTheDocument();
  });

  it('navigates forward and back through steps', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.click(screen.getAllByRole('button', { name: /Create sourcing event/i })[0]);
    await screen.findByRole('heading', { name: 'Create Sourcing Event' });
    const titleField = screen.getByLabelText(/Title \*/i);
    await user.type(titleField, 'New RFQ Test');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByRole('heading', { name: 'Line Items' })).toBeInTheDocument();
    // wizard-footer has "← Back"; header has "← Back to events" — click footer back
    const backBtns = screen.getAllByRole('button', { name: /Back/i });
    await user.click(backBtns[backBtns.length - 1]);
    expect(await screen.findByRole('heading', { name: 'Event Details' })).toBeInTheDocument();
  });

  it('can add a line item in step 2', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    await screen.findAllByText('RFQ-2026-AA');
    await user.click(screen.getAllByRole('button', { name: /Create sourcing event/i })[0]);
    await screen.findByRole('heading', { name: 'Create Sourcing Event' });
    const titleField = screen.getByLabelText(/Title \*/i);
    await user.type(titleField, 'Line Test RFQ');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await screen.findByRole('heading', { name: 'Line Items' });
    // header button is "+ Add line"; empty-state button is "+ Add line item" — click header one (first)
    const addBtns = screen.getAllByRole('button', { name: /Add line/i });
    await user.click(addBtns[0]);
    expect(screen.getAllByPlaceholderText(/Product or service description/i)).toHaveLength(1);
  });

  it('saves a draft from the wizard', async () => {
    const user = userEvent.setup();
    const eventSvc = makeEventService([]);
    render(<App eventService={eventSvc} />);
    await openSourcingEvents();
    expect(await screen.findByText('No sourcing events yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Create sourcing event/i })[0]);
    await screen.findByRole('heading', { name: 'Create Sourcing Event' });

    // Step 1: fill details
    const titleField = screen.getByLabelText(/Title \*/i);
    await user.clear(titleField);
    await user.type(titleField, 'Draft Save Test');
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Step 2: add line (header "+ Add line" and empty-state "+ Add line item" both match /Add line/i)
    await screen.findByRole('heading', { name: 'Line Items' });
    const addLineBtns = screen.getAllByRole('button', { name: /Add line/i });
    await user.click(addLineBtns[0]);
    const descField = screen.getByPlaceholderText(/Product or service description/i);
    await user.type(descField, 'Test widget');
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Step 3: skip suppliers
    await screen.findByRole('heading', { name: 'Select Suppliers' });
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Step 4: save draft
    await screen.findByRole('heading', { name: 'Review' });
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sourcing event saved as draft.');
    const titles = await screen.findAllByText('Draft Save Test');
    expect(titles.length).toBeGreaterThan(0);
  });
});

describe('Event Detail Drawer', () => {
  it('opens detail drawer on Open click', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    const openBtns = await screen.findAllByRole('button', { name: /Open RFQ-2026-AA/i });
    await user.click(openBtns[0]);
    expect(await screen.findByRole('dialog', { name: /RFQ-2026-AA/i })).toBeInTheDocument();
  });
});

describe('Cancel event', () => {
  it('cancels an event and shows Cancelled status', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService()} />);
    await openSourcingEvents();
    const cancelBtns = await screen.findAllByRole('button', { name: /Cancel RFQ-2026-AA/i });
    await user.click(cancelBtns[0]);
    expect(await screen.findByRole('status')).toHaveTextContent('Sourcing event cancelled.');
  });
});

describe('Supplier eligibility in wizard', () => {
  it('shows eligible suppliers (ACTIVE only)', async () => {
    const user = userEvent.setup();
    render(<App eventService={makeEventService([], mockSuppliers)} />);
    await openSourcingEvents();
    await user.click(screen.getAllByRole('button', { name: /Create sourcing event/i })[0]);
    await screen.findByRole('heading', { name: 'Create Sourcing Event' });
    const titleField = screen.getByLabelText(/Title \*/i);
    await user.type(titleField, 'Eligibility Test');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await screen.findByRole('heading', { name: 'Line Items' });
    // Add a minimal line so step 2 validation passes
    const addEligBtns = screen.getAllByRole('button', { name: /Add line/i });
    await user.click(addEligBtns[0]);
    const descEligField = screen.getByPlaceholderText(/Product or service description/i);
    await user.type(descEligField, 'Test item');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await screen.findByRole('heading', { name: 'Select Suppliers' });
    // ACTIVE suppliers visible
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(await screen.findByText('Beta Ltd')).toBeInTheDocument();
    // BLOCKED not shown (filtered out by eligibility)
    expect(screen.queryByText('Blocked Co')).not.toBeInTheDocument();
  });
});
