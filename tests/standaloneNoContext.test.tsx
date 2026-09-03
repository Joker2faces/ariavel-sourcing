// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// App.tsx imports detectRuntimeMode from this module — mock it so the
// STANDALONE_NO_CONTEXT branch (a real deployed build opened directly,
// outside monday's iframe) can be exercised without an actual DOM/iframe
// setup, matching how detectRuntimeMode() would classify it in production.
vi.mock('../src/backend/runtime/mondayRuntime', async () => {
  const actual = await vi.importActual<typeof import('../src/backend/runtime/mondayRuntime')>(
    '../src/backend/runtime/mondayRuntime',
  );
  return { ...actual, detectRuntimeMode: () => actual.RuntimeMode.STANDALONE_NO_CONTEXT };
});

afterEach(cleanup);

describe('App — standalone (deployed build opened directly, no monday context)', () => {
  it('shows the "open inside monday" state, never a fictional business page', async () => {
    const { default: App } = await import('../src/frontend/App');
    render(<App />);

    expect(await screen.findByText('This workspace is available inside monday.com.')).toBeInTheDocument();
    expect(screen.getByText('Open Ariavel Sourcing from your monday workspace to continue.')).toBeInTheDocument();
  });

  it('never falls back to mock/demo data just because monday context is absent', async () => {
    const { default: App } = await import('../src/frontend/App');
    render(<App />);

    await screen.findByText('This workspace is available inside monday.com.');
    // These are the mock fixtures used in LOCAL_DEVELOPMENT/TEST mode — a
    // standalone deployed build must never show them.
    expect(screen.queryByText('Q3 Packaging Materials')).not.toBeInTheDocument();
    expect(screen.queryByText('Sourcing Events')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('never claims the backend is offline — the backend is what served this page', async () => {
    const { default: App } = await import('../src/frontend/App');
    render(<App />);

    await screen.findByText('This workspace is available inside monday.com.');
    expect(screen.queryByText(/backend is offline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not connected/i)).not.toBeInTheDocument();
  });
});
