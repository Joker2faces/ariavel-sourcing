import { useEffect, useMemo, useState } from 'react';
import { createSourcingService } from '../backend/services/sourcingService';
import { mockSourcingRepository } from '../backend/repositories/mockSourcingRepository';
import { createInMemorySupplierRepository } from '../backend/repositories/inMemorySupplierRepository';
import { createMondayStorageSupplierRepository } from '../backend/repositories/mondayStorageSupplierRepository';
import { mockSuppliers } from '../backend/repositories/mockSupplierData';
import { createSupplierService, type SupplierService } from '../backend/services/supplierService';
import { developmentTenantContextProvider } from '../backend/tenancy/tenantContext';
import { createMondayTenantContextProvider } from '../backend/tenancy/mondayTenantContextProvider';
import { mockMondayBoardProvider } from '../backend/providers/mockMondayBoardProvider';
import { createMondayApiBoardProvider } from '../backend/providers/mondayApiBoardProvider';
import { createMondayRuntimeAdapter, detectRuntimeMode, RuntimeMode } from '../backend/runtime/mondayRuntime';
import type { RuntimeCapabilities } from '../backend/runtime/runtimeCapabilities';
import { deriveCapabilities, fullCapabilities } from '../backend/runtime/runtimeCapabilities';
import type { SourcingEvent, SourcingEventStatus } from '../shared/types/domain';
import { Icon } from './components/Icon';
import { SuppliersPage } from './suppliers/SuppliersPage';
import './styles.css';

const sourcingService = createSourcingService(mockSourcingRepository);
const nav = [{ label: 'Sourcing Events', icon: 'clipboard' }, { label: 'Suppliers', icon: 'users' }, { label: 'Awards', icon: 'trophy' }, { label: 'Settings', icon: 'settings' }] as const;
const statusLabel: Record<SourcingEventStatus, string> = { active: 'Active', awaiting_quotes: 'Awaiting Quotes', closing_soon: 'Closing Soon', completed: 'Completed' };

function formatDeadline(value: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }

function useRuntimeSupplierService(injected?: SupplierService): {
  service: SupplierService | null;
  capabilities: RuntimeCapabilities;
  loading: boolean;
  error: string;
} {
  const [service, setService] = useState<SupplierService | null>(injected ?? null);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>(fullCapabilities);
  const [loading, setLoading] = useState(!injected);
  const [error, setError] = useState('');

  useEffect(() => {
    if (injected) return;
    const mode = detectRuntimeMode();

    if (mode !== RuntimeMode.MONDAY) {
      const devService = createSupplierService(createInMemorySupplierRepository(mockSuppliers), developmentTenantContextProvider, mockMondayBoardProvider);
      setService(devService);
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
        const repo = createMondayStorageSupplierRepository(runtime);
        const boardProvider = createMondayApiBoardProvider(runtime);
        const svc = createSupplierService(repo, tenantProvider, boardProvider);
        if (!cancelled) {
          setService(svc);
          setCapabilities(caps);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to connect to monday. Reload the page.';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [injected]);

  return { service, capabilities, loading, error };
}

export default function App({ supplierService: injected }: { supplierService?: SupplierService }) {
  const [activeNav, setActiveNav] = useState('Sourcing Events');
  const { service, capabilities, loading, error } = useRuntimeSupplierService(injected);

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
        {activeNav === 'Suppliers' && service
          ? <SuppliersPage service={service} capabilities={capabilities} />
          : <SourcingHub title={activeNav} />}
      </main>
    </div>
  );
}

function SourcingHub({ title }: { title: string }) {
  const [events, setEvents] = useState<SourcingEvent[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => { void sourcingService.listRecentEvents().then(setEvents); }, []);
  const counts = useMemo(() => ({ active: events.filter(e => e.status === 'active').length, awaiting: events.filter(e => e.status === 'awaiting_quotes').length, closing: events.filter(e => e.status === 'closing_soon').length, completed: events.filter(e => e.status === 'completed').length }), [events]);
  const createEvent = () => { setNotice('Create event flow is ready for the next milestone.'); window.setTimeout(() => setNotice(''), 3500); };
  return <div className="content-wrap"><div className="page-heading"><div><h1>{title}</h1><p>Keep every supplier quote aligned, comparable and ready for a confident decision.</p></div><button className="primary-button" onClick={createEvent}>+ <span>Create sourcing event</span></button></div>
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="summary-grid" aria-label="Sourcing summary"><SummaryCard label="Active RFQs" value={counts.active} tone="blue" icon="clipboard" /><SummaryCard label="Awaiting Quotes" value={counts.awaiting} tone="orange" icon="clock" /><SummaryCard label="Closing Soon" value={counts.closing} tone="red" icon="calendar" /><SummaryCard label="Completed" value={counts.completed} tone="green" icon="check" /></section>
    <section className="events-panel"><div className="panel-header"><h2>Recent sourcing events</h2><button className="filter-button">Filter <Icon name="chevron" size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>RFQ name</th><th>Status</th><th>Deadline</th><th>Supplier responses</th><th aria-label="Actions" /></tr></thead><tbody>{events.map(event => <tr key={event.id}><td className="event-name">{event.title}</td><td><Status status={event.status} /></td><td>{formatDeadline(event.deadline)}</td><td>{event.supplierResponseCount} / {event.supplierCount}</td><td><button className="open-button" onClick={() => setNotice(`Opening ${event.title}`)}>Open</button></td></tr>)}</tbody></table></div><div className="panel-footer"><span>1–{events.length} of {events.length}</span><div className="pagination"><button aria-label="Previous page">‹</button><button className="page-selected">1</button><button aria-label="Next page">›</button></div><button className="per-page">10 per page <Icon name="chevron" size={14} /></button></div></section>
    <p className="responsive-note">This view adapts to your screen. On smaller devices, cards stack and the table becomes horizontally scrollable.</p>
  </div>;
}
function SummaryCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: 'clipboard' | 'clock' | 'calendar' | 'check' }) { return <div className="summary-card"><span>{label}</span><strong className={tone}>{value}</strong><span className={`summary-icon ${tone}`}><Icon name={icon} size={23} /></span></div>; }
function Status({ status }: { status: SourcingEventStatus }) { return <span className={`status ${status}`}><span className="status-dot">{status === 'completed' ? '✓' : '•'}</span>{statusLabel[status]}</span>; }
