import { useEffect, useMemo, useState } from 'react';
import { createSourcingService } from '../backend/services/sourcingService';
import { mockSourcingRepository } from '../backend/repositories/mockSourcingRepository';
import type { SourcingEvent, SourcingEventStatus } from '../shared/types/domain';
import { Icon } from './components/Icon';
import './styles.css';

const service = createSourcingService(mockSourcingRepository);
const nav = [{ label: 'Sourcing Events', icon: 'clipboard' }, { label: 'Suppliers', icon: 'users' }, { label: 'Awards', icon: 'trophy' }, { label: 'Settings', icon: 'settings' }] as const;
const statusLabel: Record<SourcingEventStatus, string> = { active: 'Active', awaiting_quotes: 'Awaiting Quotes', closing_soon: 'Closing Soon', completed: 'Completed' };

function formatDeadline(value: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }

export default function App() {
  const [events, setEvents] = useState<SourcingEvent[]>([]);
  const [activeNav, setActiveNav] = useState('Sourcing Events');
  const [notice, setNotice] = useState('');
  useEffect(() => { void service.listRecentEvents().then(setEvents); }, []);
  const counts = useMemo(() => ({ active: events.filter(e => e.status === 'active').length, awaiting: events.filter(e => e.status === 'awaiting_quotes').length, closing: events.filter(e => e.status === 'closing_soon').length, completed: events.filter(e => e.status === 'completed').length }), [events]);
  const createEvent = () => { setNotice('Create event flow is ready for the next milestone.'); window.setTimeout(() => setNotice(''), 3500); };
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="grid" size={24} /></span><span>Ariavel Sourcing</span></div>
      <nav aria-label="Primary navigation">{nav.map(item => <button key={item.label} className={`nav-item ${activeNav === item.label ? 'selected' : ''}`} onClick={() => setActiveNav(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-footer"><span className="monday-dots">●●●</span><span>Built on monday.com</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="mobile-brand">Ariavel Sourcing</div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications"><Icon name="bell" /></button><button className="icon-button" aria-label="Help"><Icon name="help" /></button><div className="avatar">AT</div><Icon name="chevron" size={16} /></div></header>
      <div className="content-wrap"><div className="page-heading"><div><h1>{activeNav}</h1><p>Keep every supplier quote aligned, comparable and ready for a confident decision.</p></div><button className="primary-button" onClick={createEvent}>+ <span>Create sourcing event</span></button></div>
        {notice && <div className="notice" role="status">{notice}</div>}
        <section className="summary-grid" aria-label="Sourcing summary"><SummaryCard label="Active RFQs" value={counts.active} tone="blue" icon="clipboard" /><SummaryCard label="Awaiting Quotes" value={counts.awaiting} tone="orange" icon="clock" /><SummaryCard label="Closing Soon" value={counts.closing} tone="red" icon="calendar" /><SummaryCard label="Completed" value={counts.completed} tone="green" icon="check" /></section>
        <section className="events-panel"><div className="panel-header"><h2>Recent sourcing events</h2><button className="filter-button">Filter <Icon name="chevron" size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>RFQ name</th><th>Status</th><th>Deadline</th><th>Supplier responses</th><th aria-label="Actions" /></tr></thead><tbody>{events.map(event => <tr key={event.id}><td className="event-name">{event.title}</td><td><Status status={event.status} /></td><td>{formatDeadline(event.deadline)}</td><td>{event.supplierResponseCount} / {event.supplierCount}</td><td><button className="open-button" onClick={() => setNotice(`Opening ${event.title}`)}>Open</button></td></tr>)}</tbody></table></div><div className="panel-footer"><span>1–{events.length} of {events.length}</span><div className="pagination"><button aria-label="Previous page">‹</button><button className="page-selected">1</button><button aria-label="Next page">›</button></div><button className="per-page">10 per page <Icon name="chevron" size={14} /></button></div></section>
        <p className="responsive-note">This view adapts to your screen. On smaller devices, cards stack and the table becomes horizontally scrollable.</p>
      </div>
    </main>
  </div>;
}
function SummaryCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: 'clipboard' | 'clock' | 'calendar' | 'check' }) { return <div className="summary-card"><span>{label}</span><strong className={tone}>{value}</strong><span className={`summary-icon ${tone}`}><Icon name={icon} size={23} /></span></div>; }
function Status({ status }: { status: SourcingEventStatus }) { return <span className={`status ${status}`}><span className="status-dot">{status === 'completed' ? '✓' : '•'}</span>{statusLabel[status]}</span>; }
