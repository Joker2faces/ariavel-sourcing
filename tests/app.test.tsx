import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/frontend/App';

afterEach(cleanup);

describe('Sourcing Hub', () => {
  it('renders the dashboard and responds to create event', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('Recent sourcing events')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: /Create sourcing event/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Create event flow is ready for the next milestone.');
  });

  it('provides a mobile primary navigation that can open Supplier Master', async () => {
    const user = userEvent.setup();
    render(<App />);

    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile primary navigation' });
    await user.click(within(mobileNavigation).getByRole('button', { name: 'Suppliers' }));

    expect(await screen.findByRole('heading', { name: 'Suppliers' })).toBeInTheDocument();
  });
});
