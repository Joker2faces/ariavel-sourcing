import { useEffect, useMemo, useState } from 'react';
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
import type { SourcingEvent, SourcingEventStatus } from '../shared/types/domain';
import { isClosingSoon, formatDeadlineDisplay } from '../shared/utils/deadline';
import { Icon } from './components/Icon';
import { ErrorBoundary } from './ErrorBoundary';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { SuppliersPage } from './suppliers/SuppliersPage';
import { SourcingEventsPage } from './sourcing/SourcingEventsPage';
import { SettingsPage } from './settings/SettingsPage';
import './styles.css';

const ONBOARDING_KEY = 'ariavel_onboarding_done';

const nav = [{ label: 'Sourcing Events', icon: 'clipboard' }, { label: 'Suppliers', icon: 'users' }, { label: 'Awards', icon: 'trophy' }, { label: 'Settings', icon: 'settings' }] as const;

const STATUS_LABEL: Record<SourcingEventStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_INVITATION: 'Ready',
  OPEN: 'Open',
  EVALUATING: 'Evaluating',
  AWARDED: 'Awarded',
  CANCELLED: 'Cancelled',
};

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

    if (mode !== RuntimeMode.MONDAY) {
      // Local development / test mode has no monday session to mint a buyer JWT
      // from, so the buyer API (invitations, quotes, comparisons, awards) is not
      // reachable here — only supplier/event data (backed by in-memory mocks).
      const supplierRepo = createInMemorySupplierRepository(mockSuppliers);
      const eventRepo = createInMemorySourcingEventRepository(mockSourcingEvents);
      const supplierSvc = createSupplierService(supplierRepo, developmentTenantContextProvider, mockMondayBoardProvider);
      const eventSvc = createSourcingEventService(eventRepo, developmentTenantContextProvider, supplierSvc);
      setServices({ supplierService: supplierSvc, eventService: eventSvc, capabilities: fullCapabilities, apiClient: null, serverAvailable: false });
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const runtime = createMondayRuntimeAdapter();
        const tenantProvider = createMondayTenantContextProvider(runtime);
        await tenantProvider.initialize();
        const context = await runtime.getContext();
        const caps = deriveCapabilities(context);
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
    return () => { cancelled = true; };
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

  return (
    <ErrorBoundary>
      {showOnboarding && <OnboardingFlow onComplete={dismissOnboarding} onSkip={dismissOnboarding} />}
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon name="grid" size={24} /></span><span>Ariavel Sourcing</span></div>
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
          : activeNav === 'Settings' && services
          ? <SettingsPage capabilities={services.capabilities} serverBaseUrl="" serverAvailable={services.serverAvailable} apiClient={services.apiClient} />
          : <PlaceholderPage title={activeNav} />}
      </main>
    </div>
    </ErrorBoundary>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="content-wrap">
      <div className="page-heading"><div><h1>{title}</h1><p>This section is coming in a future milestone.</p></div></div>
      <div className="empty-state"><h2>Coming soon</h2><p>{title} will be available in a future milestone.</p></div>
    </div>
  );
}

export function SourcingHub({ eventService }: { eventService: SourcingEventService }) {
  const [events, setEvents] = useState<SourcingEvent[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { void eventService.list().then(setEvents); }, [eventService]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      draft: events.filter(e => e.status === 'DRAFT').length,
      ready: events.filter(e => e.status === 'READY_FOR_INVITATION').length,
      closing: events.filter(e => e.status !== 'CANCELLED' && e.deadline && isClosingSoon(e.deadline, now)).length,
      total: events.filter(e => e.status !== 'CANCELLED').length,
    };
  }, [events]);

  if (showWizard) {
    return <div className="content-wrap"><div className="notice" role="status">Use the Sourcing Events page to create RFQs.</div></div>;
  }

  return (
    <div className="content-wrap">
      <div className="page-heading">
        <div><h1>Sourcing Events</h1><p>Keep every supplier quote aligned, comparable and ready for a confident decision.</p></div>
        <button className="primary-button" onClick={() => setShowWizard(true)}>+ <span>Create sourcing event</span></button>
      </div>
      {notice && <div className="notice" role="status">{notice}</div>}
      <section className="summary-grid" aria-label="Sourcing summary">
        <SummaryCard label="Draft Events" value={counts.draft} tone="blue" icon="clipboard" />
        <SummaryCard label="Ready for Invitation" value={counts.ready} tone="green" icon="check" />
        <SummaryCard label="Closing Soon" value={counts.closing} tone="orange" icon="clock" />
        <SummaryCard label="Total Active" value={counts.total} tone="blue" icon="calendar" />
      </section>
      <section className="events-panel">
        <div className="panel-header"><h2>Recent sourcing events</h2></div>
        <div className="table-wrap">
          <table><thead><tr><th>Reference</th><th>Event</th><th>Status</th><th>Deadline</th><th>Lines</th><th>Suppliers</th><th aria-label="Actions" /></tr></thead>
            <tbody>{events.slice(0, 10).map(event => (
              <tr key={event.id}>
                <td className="rfq-ref">{event.reference}</td>
                <td className="event-name">{event.title}</td>
                <td><HubStatus status={event.status} /></td>
                <td>{event.deadline ? formatDeadlineDisplay(event.deadline) : '—'}</td>
                <td>{event.lines.length}</td>
                <td>{event.supplierSelections.length}</td>
                <td><button className="open-button" onClick={() => setNotice(`Opening ${event.reference}`)}>Open</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="panel-footer"><span>1–{Math.min(10, events.length)} of {events.length}</span></div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: 'clipboard' | 'clock' | 'calendar' | 'check' }) {
  return <div className="summary-card"><span>{label}</span><strong className={tone}>{value}</strong><span className={`summary-icon ${tone}`}><Icon name={icon} size={23} /></span></div>;
}

function HubStatus({ status }: { status: SourcingEventStatus }) {
  const cls = status === 'DRAFT' ? 'awaiting_quotes'
    : status === 'READY_FOR_INVITATION' ? 'active'
    : status === 'OPEN' ? 'active'
    : status === 'EVALUATING' ? 'closing_soon'
    : status === 'AWARDED' ? 'awarded'
    : 'closing_soon';
  return <span className={`status ${cls}`}><span className="status-dot">•</span>{STATUS_LABEL[status]}</span>;
}
