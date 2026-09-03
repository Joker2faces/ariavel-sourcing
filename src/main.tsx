import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './frontend/App';
import { PortalApp } from './frontend/portal/PortalApp';
import './frontend/styles.css';

// The supplier portal is a distinct runtime mode from the monday buyer app —
// suppliers reach it via a token link in an email, never through monday.com,
// so it must never depend on monday context or fall through to the buyer
// shell. A `?token=` query param is the only signal that decides this; it is
// checked before any monday-runtime detection ever runs.
const portalToken = new URLSearchParams(window.location.search).get('token');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {portalToken ? <PortalApp token={portalToken} /> : <App />}
  </StrictMode>,
);
