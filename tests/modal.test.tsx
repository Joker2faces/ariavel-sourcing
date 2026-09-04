// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../src/frontend/components/Modal';

afterEach(cleanup);

describe('Modal', () => {
  it('moves focus into the dialog on open and returns it to the trigger on close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Modal onClose={() => setOpen(false)} ariaLabel="Test dialog">
              <button>First</button>
              <button>Last</button>
            </Modal>
          )}
        </div>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByText('Open');
    trigger.focus();
    await user.click(trigger);

    expect(screen.getByRole('dialog')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('traps Tab within the dialog, cycling from the last focusable element back to the first', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="Test dialog">
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );
    const first = screen.getByText('First');
    const last = screen.getByText('Last');
    last.focus();

    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape without submitting anything and calls onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} ariaLabel="Test dialog">
        <button>Only action</button>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
