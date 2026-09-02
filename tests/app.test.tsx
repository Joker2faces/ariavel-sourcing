import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import App from '../src/frontend/App';

describe('Sourcing Hub', () => {
  it('renders the dashboard and responds to create event', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('Recent sourcing events')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: /Create sourcing event/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Create event flow is ready for the next milestone.');
  });
});
