import { useEffect, useState } from 'react';
import { createInMemorySupplierRepository } from '../backend/repositories/inMemorySupplierRepository';
import { createMondayStorageSupplierRepository } from '../backend/repositories/mondayStorageSupplierRepository';
import { mockSourcingEvents } from '../backend/repositories/mockSourcingRepository';
import { mockSuppliers } from '../backend/repositories/mockSupplierData';
import { createInMemorySourcingEventRepository } from '../backend/repositories/inMemorySourcingEventRepository';
import { createMondayStorageSourcingEventRepository } from '../backend/repositories/mondayStorageSourcingEventRepository';
import { createSupplierService, type SupplierService } from '../backend/services/supplierService';
import { createSourcingEventService, type SourcingEventService } from '../backend/services/sourcingEventService';
import { developmentTenantContextProvider } from '../backend/tenancy/tenantContext';
import { createMondayTenantContextProvider } from '../backend/tenancy/mondayTenantContextProvider';
import { mockMondayBoardProvider } from '../backend/providers/mockMondayBoardProvider';
import { createMondayApiBoardProvider } from '../backend/providers/mondayApiBoardProvider';
import { createMondayRuntimeAdapter, detectRuntimeMode, RuntimeMode } from '../backend/runtime/mondayRuntime';
import type { RuntimeCapabilities } from '../backend/runtime/runtimeCapabilities';
import { deriveCapabilities, fullCapabilities } from '../backend/runtime/runtimeCapabilities';
import { createBuyerApiClient, type BuyerApiClient } from './api/buyerApiClient';
import { Icon } from './components/Icon';
import { ErrorBoundary } from './ErrorBoundary';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { SuppliersPage } from './suppliers/SuppliersPage';
import { SourcingEventsPage } from './sourcing/SourcingEventsPage';
import { SettingsPage } from './settings/SettingsPage';
import { AwardWorkspacePage } from './awards/AwardWorkspacePage';
import './styles.css';

const ONBOARDING_KEY = 'ariavel_onboarding_done';

// monday's context.theme is "light" | "dark" | "black" — Ariavel's design
// tokens only distinguish light/dark, so "black" (monday's highest-contrast
// dark variant) maps onto the same dark token set rather than inventing a
// third, untested visual identity.
export function applyMondayTheme(theme: string): void {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

const nav = [{ label: 'Sourcing Events', icon: 'clipboard' }, { label: 'Suppliers', icon: 'users' }, { label: 'Awards', icon: 'trophy' }, { label: 'Settings', icon: 'settings' }] as const;

interface RuntimeServices {
  supplierService: SupplierService;
  eventService: SourcingEventService;
  capabilities: RuntimeCapabilities;
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

function useRuntimeServices(injected?: { supplierService?: SupplierService; eventService?: SourcingEventService }): {
  services: RuntimeServices | null;
  loading: boolean;
  error: string;
} {
  const [services, setServices] = useState<RuntimeServices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (injected?.supplierService) {
      const eventRepo = createInMemorySourcingEventRepository(mockSourcingEvents);
      const eventSvc = injected.eventService ?? createSourcingEventService(eventRepo, developmentTenantContextProvider, injected.supplierService);
      setServices({ supplierService: injected.supplierService, eventService: eventSvc, capabilities: fullCapabilities, apiClient: null, serverAvailable: false });
      setLoading(false);
      return;
    }
    if (injected?.eventService) {
      const supplierRepo = createInMemorySupplierRepository(mockSuppliers);
      const supplierSvc = createSupplierService(supplierRepo, developmentTenantContextProvider, mockMondayBoardProvider);
      setServices({ supplierService: supplierSvc, eventService: injected.eventService, capabilities: fullCapabilities, apiClient: null, serverAvailable: false });
      setLoading(false);
      return;
    }

    const mode = detectRuntimeMode();

    if (mode === RuntimeMode.STANDALONE_NO_CONTEXT) {
      // A real deployed build, opened directly with no monday iframe context.
      // There is no valid sessionToken here — never fall back to mock/demo
      // business data just because monday context happens to be absent; that
      // would silently show fictional suppliers/RFQs in a real deployment.
      // App() renders the dedicated "open inside monday" state for this mode
      // without ever reaching a data-loading path.
      setLoading(false);
      return;
    }

    if (mode === RuntimeMode.LOCAL_DEVELOPMENT || mode === RuntimeMode.TEST) {
      // Only a real developer machine (npm run dev) or the test runner reaches
      // here — mock/demo providers are appropriate. There is no monday
      // session to mint a buyer JWT from, so the buyer API (invitations,
      // quotes, comparisons, awards) is not reachable — only supplier/event
      // data (backed by in-memory mocks).
      const supplierRepo = createInMemorySupplierRepository(mockSuppliers);
      const eventRepo = createInMemorySourcingEventRepository(mockSourcingEvents);
      const supplierSvc = createSupplierService(supplierRepo, developmentTenantContextProvider, mockMondayBoardProvider);
      const eventSvc = createSourcingEventService(eventRepo, developmentTenantContextProvider, supplierSvc);
      setServices({ supplierService: supplierSvc, eventService: eventSvc, capabilities: fullCapabilities, apiClient: null, serverAvailable: false });
      setLoading(false);
      return;
    }

    let cancelled = false;
    let unlistenTheme: (() => void) | undefined;
    (async () => {
      try {
        const runtime = createMondayRuntimeAdapter();
        const tenantProvider = createMondayTenantContextProvider(runtime);
        await tenantProvider.initialize();
        const context = await runtime.getContext();
        const caps = deriveCapabilities(context);
        applyMondayTheme(context.theme);
        // Live theme updates — monday.listen("context", ...) fires whenever
        // context changes, theme included, so Ariavel follows the user's
        // in-app monday theme choice without needing a page reload.
        unlistenTheme = runtime.listenContext(next => applyMondayTheme(next.theme));
        const supplierRepo = createMondayStorageSupplierRepository(runtime);
        const eventRepo = createMondayStorageSourcingEventRepository(runtime);
        const boardProvider = createMondayApiBoardProvider(runtime);
        const supplierSvc = createSupplierService(supplierRepo, tenantProvider, boardProvider);
        const eventSvc = createSourcingEventService(eventRepo, tenantProvider, supplierSvc);
        // The backend is served from this same origin (see app.ts static serving),
        // so the API base URL is simply relative — no CDN/backend URL to resolve.
        const apiClient = createBuyerApiClient('', () => runtime.getSessionToken());
        let serverAvailable = true;
        try {
          const health = await fetch('/health');
          serverAvailable = health.ok;
        } catch { serverAvailable = false; }
        if (!cancelled) setServices({ supplierService: supplierSvc, eventService: eventSvc, capabilities: caps, apiClient, serverAvailable });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to connect to monday. Reload the page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; unlistenTheme?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { services, loading, error };
}

export default function App({ supplierService: injSupplier, eventService: injEvent }: { supplierService?: SupplierService; eventService?: SourcingEventService }) {
  const [activeNav, setActiveNav] = useState('Sourcing Events');
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (injSupplier || injEvent) return false;
    if (detectRuntimeMode() !== RuntimeMode.MONDAY) return false;
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });
  const { services, loading, error } = useRuntimeServices({ supplierService: injSupplier, eventService: injEvent });

  // localStorage decides instantly (avoids a flash of the wizard on every load), but
  // once we can reach the backend the tenant-persisted flag is authoritative — it
  // catches "completed onboarding on a different device/browser" and hides the
  // wizard there too, per-tenant rather than per-browser.
  useEffect(() => {
    if (!services?.apiClient) return;
    let cancelled = false;
    services.apiClient.getSettings()
      .then(settings => { if (!cancelled && settings.onboardingCompletedAt) setShowOnboarding(false); })
      .catch(() => { /* offline — keep whatever localStorage already decided */ });
    return () => { cancelled = true; };
  }, [services?.apiClient]);

  const dismissOnboarding = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
    setShowOnboarding(false);
    if (services?.apiClient) {
      services.apiClient.getSettings()
        .then(s => services.apiClient!.updateSettings({ onboardingCompletedAt: new Date().toISOString() }, s.version))
        .catch(() => { /* best-effort — localStorage already recorded completion for this browser */ });
    }
  };

  if (loading) {
    return (
      <div className="app-shell">
        <div className="runtime-loading" role="status" aria-live="polite">
          <div className="runtime-loading-inner">
            <div className="loading-spinner" aria-hidden="true" />
            <span>Connecting to monday…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="runtime-error" role="alert">
          <h2>Connection failed</h2>
          <p>{error}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }

  if (!injSupplier && !injEvent && detectRuntimeMode() === RuntimeMode.STANDALONE_NO_CONTEXT) {
    return <OpenInMondayState />;
  }

  return (
    <ErrorBoundary>
      {showOnboarding && <OnboardingFlow onComplete={dismissOnboarding} onSkip={dismissOnboarding} />}
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="grid" size={20} /></span>
          <span className="brand-word"><strong>Ariavel</strong><small>Sourcing</small></span>
        </div>
        <nav aria-label="Primary navigation">{nav.map(item => <button key={item.label} className={`nav-item ${activeNav === item.label ? 'selected' : ''}`} onClick={() => setActiveNav(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-footer"><span className="monday-dots">●●●</span><span>Built on monday.com</span></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="mobile-brand">Ariavel Sourcing</div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications"><Icon name="bell" /></button><button className="icon-button" aria-label="Help"><Icon name="help" /></button><div className="avatar">AT</div><Icon name="chevron" size={16} /></div></header>
        <nav className="mobile-navigation" aria-label="Mobile primary navigation">
          {nav.map(item => <button key={item.label} className={activeNav === item.label ? 'selected' : ''} onClick={() => setActiveNav(item.label)}><Icon name={item.icon} size={18} /><span>{item.label}</span></button>)}
        </nav>

        {activeNav === 'Suppliers' && services
          ? <SuppliersPage service={services.supplierService} capabilities={services.capabilities} />
          : activeNav === 'Sourcing Events' && services
          ? <SourcingEventsPage service={services.eventService} capabilities={services.capabilities} apiClient={services.apiClient} serverAvailable={services.serverAvailable} />
          : activeNav === 'Awards' && services
          ? <AwardWorkspacePage eventService={services.eventService} apiClient={services.apiClient} serverAvailable={services.serverAvailable} capabilities={services.capabilities} />
          : activeNav === 'Settings' && services
          ? <SettingsPage capabilities={services.capabilities} serverBaseUrl="" serverAvailable={services.serverAvailable} apiClient={services.apiClient} />
          : null}
      </main>
    </div>
    </ErrorBoundary>
  );
}

/**
 * Shown when this app's own production bundle is opened directly, outside
 * monday's iframe — e.g. someone navigates to the monday Code service URL
 * in a normal browser tab. There is no valid sessionToken here, so this is
 * never a "backend offline" condition (the backend usually IS running —
 * this page is served BY it) and never a reason to fall back to mock data.
 */
function OpenInMondayState() {
  const isDev = import.meta.env.DEV;
  return (
    <div className="standalone-shell">
      <div className="standalone-card">
        <span className="standalone-mark" aria-hidden="true"><Icon name="grid" size={28} /></span>
        <h1>Ariavel Sourcing</h1>
        <p>This workspace is available inside monday.com.</p>
        <p className="standalone-hint">Open Ariavel Sourcing from your monday workspace to continue.</p>
        {isDev && (
          <p className="standalone-dev-note">
            Development note: this build has no monday iframe context, so buyer session authentication cannot run. Use <code>npm run dev</code> for mock-data local development instead.
          </p>
        )}
      </div>
    </div>
  );
}
