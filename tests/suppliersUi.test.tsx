import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/frontend/App';
import { createInMemorySupplierRepository } from '../src/backend/repositories/inMemorySupplierRepository';
import { createSupplierService } from '../src/backend/services/supplierService';
import { mockMondayBoardProvider } from '../src/backend/providers/mockMondayBoardProvider';
import type { Supplier } from '../src/shared/types/domain';

afterEach(cleanup);

const records: Supplier[] = [
  { id: 's1', tenantId: 'test-tenant', name: 'Acme Materials', supplierCode: 'AC-100', status: 'ACTIVE', category: 'Raw Materials', country: 'Germany', primaryContactName: 'Maya Patel', email: 'sales@acme.example', phone: '+49 30 555 0101', currency: 'EUR', paymentTerms: '30 days', defaultIncoterm: 'DAP', preferred: true, rating: 4, notes: 'Primary metals partner.', sourceType: 'ARIAVEL', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
  { id: 's2', tenantId: 'test-tenant', name: 'NorthStar Packaging', supplierCode: 'NS-220', status: 'PENDING', category: 'Packaging', country: 'Bulgaria', primaryContactName: 'Elena Petrova', email: 'quotes@northstar.example', currency: 'EUR', paymentTerms: '60 days', preferred: false, rating: 5, sourceType: 'MONDAY_BOARD', mondayBoardId: 'mock-board-suppliers', mondayItemId: 'mock-item-2', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
  { id: 's3', tenantId: 'test-tenant', name: 'BlueRoute Logistics', status: 'INACTIVE', category: 'Logistics', country: 'Greece', preferred: false, sourceType: 'IMPORT', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
];

function renderSuppliers(seed = records) {
  const supplierService = createSupplierService(createInMemorySupplierRepository(seed), { getTenantContext: () => ({ tenantId: 'test-tenant' }) }, mockMondayBoardProvider);
  render(<App supplierService={supplierService} />);
  return userEvent.setup();
}

async function openSuppliers(user: ReturnType<typeof userEvent.setup>) {
  const desktopNavigation = screen.getByRole('navigation', { name: 'Primary navigation' });
  await user.click(within(desktopNavigation).getByRole('button', { name: 'Suppliers' }));
  expect(await screen.findByRole('heading', { name: 'Suppliers', level: 1 })).toBeInTheDocument();
}

describe('Supplier Master', () => {
  it('renders supplier summary and responsive supplier records', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    expect(screen.getByText('Total suppliers').parentElement).toHaveTextContent('3');
    expect(screen.getAllByText('Acme Materials').length).toBeGreaterThan(0);
  });

  it('searches and combines filters, then resets them', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    await user.type(screen.getByRole('searchbox', { name: 'Search suppliers' }), 'northstar');
    expect(screen.getAllByText('NorthStar Packaging').length).toBeGreaterThan(0);
    expect(screen.queryByText('BlueRoute Logistics')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search suppliers' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'INACTIVE');
    await user.selectOptions(screen.getByLabelText('Category'), 'Logistics');
    await user.selectOptions(screen.getByLabelText('Country'), 'Greece');
    expect(screen.getAllByText('BlueRoute Logistics').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getAllByText('Acme Materials').length).toBeGreaterThan(0);
  });

  it('shows an actionable empty filtered state', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    await user.type(screen.getByRole('searchbox', { name: 'Search suppliers' }), 'does not exist');
    expect(screen.getByText('No suppliers match your filters.')).toBeInTheDocument();
  });

  it('opens supplier details and edits the supplier', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    await user.click(screen.getAllByRole('button', { name: 'View Acme Materials' })[0]);
    const details = await screen.findByRole('dialog', { name: 'Supplier details' });
    expect(within(details).getByText('Primary metals partner.')).toBeInTheDocument();
    await user.click(within(details).getByRole('button', { name: 'Edit supplier' }));
    const form = await screen.findByRole('dialog', { name: 'Edit supplier' });
    const name = within(form).getByLabelText('Supplier name');
    await user.clear(name);
    await user.type(name, 'Acme Materials Europe');
    await user.click(within(form).getByRole('button', { name: 'Save supplier' }));
    expect(await screen.findByText('Supplier updated.')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Materials Europe').length).toBeGreaterThan(0);
  });

  it('validates and creates a supplier through the service', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    await user.click(screen.getByRole('button', { name: 'Add supplier' }));
    const form = await screen.findByRole('dialog', { name: 'Add supplier' });
    await user.click(within(form).getByRole('button', { name: 'Save supplier' }));
    expect(within(form).getByText('Supplier name is required.')).toBeInTheDocument();
    await user.type(within(form).getByLabelText('Supplier name'), 'Vertex Equipment');
    await user.type(within(form).getByLabelText('Email'), 'orders@vertex.example');
    await user.click(within(form).getByRole('button', { name: 'Save supplier' }));
    expect(await screen.findByText('Supplier created.')).toBeInTheDocument();
    expect(screen.getAllByText('Vertex Equipment').length).toBeGreaterThan(0);
  });

  it('changes supplier status without deleting the supplier', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    await user.click(screen.getAllByRole('button', { name: 'More actions for Acme Materials' })[0]);
    await user.click(screen.getAllByRole('menuitem', { name: 'Deactivate' })[0]);
    expect(await screen.findByText('Supplier status changed.')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Materials').length).toBeGreaterThan(0);
  });

  it('configures a monday board source only after required mapping is valid', async () => {
    const user = renderSuppliers();
    await openSuppliers(user);
    await user.click(screen.getByRole('button', { name: 'Configure supplier source' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configure supplier source' });
    await user.click(within(dialog).getByLabelText('Existing monday board'));
    await user.selectOptions(within(dialog).getByLabelText('Supplier board'), 'mock-board-suppliers');
    expect(within(dialog).getByText('Supplier Name must be mapped.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save source configuration' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Supplier Name monday column'), 'name');
    expect(within(dialog).getByText('Preview mapped suppliers')).toBeInTheDocument();
    expect(within(dialog).getByText('Acme Materials')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save source configuration' }));
    expect(await screen.findByText('Supplier source configured.')).toBeInTheDocument();
  });

  it('renders the no-supplier onboarding state', async () => {
    const user = renderSuppliers([]);
    await openSuppliers(user);
    expect(screen.getByText('No suppliers yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect existing monday board' })).toBeInTheDocument();
  });
});
