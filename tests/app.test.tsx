import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/frontend/App';

afterEach(cleanup);

describe('Sourcing Hub', () => {
  it('renders the sourcing events page and shows mock events', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sourcing Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create sourcing event/i })).toBeInTheDocument();
    // Mock events loaded from mockSourcingEvents (may appear in table + mobile cards)
    const matches = await screen.findAllByText('Q3 Packaging Materials');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('opens the create event wizard when Create sourcing event is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Sourcing Events' });
    await user.click(screen.getByRole('button', { name: /Create sourcing event/i }));
    expect(await screen.findByRole('heading', { name: 'Create Sourcing Event' })).toBeInTheDocument();
  });

  it('provides a mobile primary navigation that can open Supplier Master', async () => {
    const user = userEvent.setup();
    render(<App />);
    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile primary navigation' });
    await user.click(within(mobileNavigation).getByRole('button', { name: 'Suppliers' }));
    expect(await screen.findByRole('heading', { name: 'Suppliers' })).toBeInTheDocument();
  });
});
