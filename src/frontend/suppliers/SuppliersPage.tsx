import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupplierService } from '../../backend/services/supplierService';
import type { Supplier, SupplierInput, SupplierStatus } from '../../shared/types/domain';
import { SupplierDetailsDrawer } from './SupplierDetailsDrawer';
import { SupplierFormDrawer } from './SupplierFormDrawer';
import { SupplierSourceDrawer } from './SupplierSourceDrawer';

const statusLabels: Record<SupplierStatus, string> = { ACTIVE: 'Active', PENDING: 'Pending', INACTIVE: 'Inactive', BLOCKED: 'Blocked' };
const sourceLabel = (supplier: Supplier) => supplier.sourceType === 'MONDAY_BOARD' ? 'monday board' : supplier.sourceType === 'IMPORT' ? 'Imported' : 'Ariavel';

export function SuppliersPage({ service }: { service: SupplierService }) {
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupplierStatus | ''>('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [selected, setSelected] = useState<Supplier>();
  const [editing, setEditing] = useState<Supplier | 'new'>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { const [all, filtered] = await Promise.all([service.list(), service.list({ search, status, category, country })]); setAllSuppliers(all); setSuppliers(filtered); }
    catch { setError('Supplier data could not be loaded. Try again.'); }
    finally { setLoading(false); }
  }, [category, country, search, service, status]);
  useEffect(() => { void refresh(); }, [refresh]);
  const options = useMemo(() => ({ categories: [...new Set(allSuppliers.map(item => item.category).filter((value): value is string => Boolean(value)))].sort(), countries: [...new Set(allSuppliers.map(item => item.country).filter((value): value is string => Boolean(value)))].sort() }), [allSuppliers]);
  const summary = useMemo(() => ({ total: allSuppliers.length, active: allSuppliers.filter(item => item.status === 'ACTIVE').length, preferred: allSuppliers.filter(item => item.preferred).length, incomplete: allSuppliers.filter(item => !item.category || !item.country || !item.email || !item.primaryContactName).length }), [allSuppliers]);
  const feedback = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };
  const save = async (input: SupplierInput) => { if (editing && editing !== 'new') await service.update(editing.id, input); else await service.create(input); setEditing(undefined); feedback(editing === 'new' ? 'Supplier created.' : 'Supplier updated.'); await refresh(); };
  const reset = () => { setSearch(''); setStatus(''); setCategory(''); setCountry(''); };
  const changeStatus = async (supplier: Supplier) => { await service.changeStatus(supplier.id, supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'); feedback('Supplier status changed.'); await refresh(); };
  return <div className="content-wrap suppliers-content"><div className="supplier-heading"><div><h1>Suppliers</h1><p>Manage approved suppliers and prepare them for sourcing events.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setSourceOpen(true)}>Configure supplier source</button><button className="primary-button" aria-label="Add supplier" onClick={() => setEditing('new')}>+ Add supplier</button></div></div>
    {notice ? <div className="notice" role="status">{notice}</div> : null}{error ? <div className="error-banner" role="alert">{error}</div> : null}
    <section className="supplier-summary" aria-label="Supplier summary"><Metric label="Total suppliers" value={summary.total} /><Metric label="Active suppliers" value={summary.active} /><Metric label="Preferred suppliers" value={summary.preferred} /><Metric label="Incomplete profiles" value={summary.incomplete} /></section>
    {allSuppliers.length ? <><section className="supplier-controls" aria-label="Supplier filters"><label className="search-field"><span className="sr-only">Search suppliers</span><input type="search" aria-label="Search suppliers" placeholder="Search suppliers" value={search} onChange={event => setSearch(event.target.value)} /></label><label><span>Status</span><select aria-label="Status" value={status} onChange={event => setStatus(event.target.value as SupplierStatus | '')}><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Category</span><select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{options.categories.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Country</span><select aria-label="Country" value={country} onChange={event => setCountry(event.target.value)}><option value="">All countries</option>{options.countries.map(value => <option key={value}>{value}</option>)}</select></label><button className="reset-button" onClick={reset}>Reset filters</button></section>
      <div className="result-count">{loading ? 'Loading suppliers…' : `${suppliers.length} of ${allSuppliers.length} suppliers`}</div>
      {!loading && suppliers.length === 0 ? <div className="empty-state compact"><h2>No suppliers match your filters.</h2><p>Adjust the search or clear the current filters.</p><button className="secondary-button" onClick={reset}>Reset filters</button></div> : <SupplierRecords suppliers={suppliers} onView={setSelected} onEdit={setEditing} onStatus={supplier => void changeStatus(supplier)} />}</> : !loading ? <div className="empty-state"><h2>No suppliers yet</h2><p>Add suppliers manually or connect an existing monday supplier board.</p><div><button className="secondary-button" onClick={() => setSourceOpen(true)}>Connect existing monday board</button><button className="primary-button" onClick={() => setEditing('new')}>Add supplier</button></div></div> : <p>Loading suppliers…</p>}
    {selected ? <SupplierDetailsDrawer supplier={selected} onClose={() => setSelected(undefined)} onEdit={() => { setEditing(selected); setSelected(undefined); }} /> : null}
    {editing ? <SupplierFormDrawer supplier={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} onSave={save} /> : null}
    {sourceOpen ? <SupplierSourceDrawer service={service} onClose={() => setSourceOpen(false)} onSaved={() => { setSourceOpen(false); feedback('Supplier source configured.'); }} /> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="supplier-metric"><span>{label}</span><strong>{value}</strong></div>; }
function SupplierRecords({ suppliers, onView, onEdit, onStatus }: { suppliers: Supplier[]; onView: (supplier: Supplier) => void; onEdit: (supplier: Supplier) => void; onStatus: (supplier: Supplier) => void }) {
  return <section className="supplier-panel"><div className="supplier-table-wrap"><table className="supplier-table"><thead><tr><th>Supplier</th><th>Status</th><th>Category</th><th>Country</th><th>Primary contact</th><th>Currency</th><th>Rating</th><th>Source</th><th>Actions</th></tr></thead><tbody>{suppliers.map(supplier => <tr key={supplier.id}><td><button className="supplier-link" onClick={() => onView(supplier)}>{supplier.name}</button><small>{supplier.supplierCode ?? 'No code'} · {supplier.email ?? 'No email'}</small></td><td><span className={`supplier-status status-${supplier.status.toLowerCase()}`}>{statusLabels[supplier.status]}</span></td><td>{supplier.category ?? '—'}</td><td>{supplier.country ?? '—'}</td><td>{supplier.primaryContactName ?? '—'}</td><td>{supplier.currency ?? '—'}</td><td>{supplier.rating ? `${supplier.rating} / 5` : '—'}</td><td>{sourceLabel(supplier)}</td><td><div className="row-actions"><button aria-label={`View ${supplier.name}`} onClick={() => onView(supplier)}>View</button><button aria-label={`Edit ${supplier.name}`} onClick={() => onEdit(supplier)}>Edit</button><button aria-label={`${supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${supplier.name}`} onClick={() => onStatus(supplier)}>{supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></table></div><div className="supplier-cards">{suppliers.map(supplier => <article key={supplier.id} className="supplier-card"><div className="supplier-card-head"><div><button className="supplier-link" onClick={() => onView(supplier)}>{supplier.name}</button><small>{supplier.supplierCode ?? 'No supplier code'}</small></div><span className={`supplier-status status-${supplier.status.toLowerCase()}`}>{statusLabels[supplier.status]}</span></div><dl><div><dt>Category</dt><dd>{supplier.category ?? '—'}</dd></div><div><dt>Country</dt><dd>{supplier.country ?? '—'}</dd></div><div><dt>Contact</dt><dd>{supplier.primaryContactName ?? supplier.email ?? '—'}</dd></div><div><dt>Source</dt><dd>{sourceLabel(supplier)}</dd></div></dl><div className="row-actions"><button aria-label={`View ${supplier.name}`} onClick={() => onView(supplier)}>View</button><button aria-label={`Edit ${supplier.name}`} onClick={() => onEdit(supplier)}>Edit</button><button aria-label={`${supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${supplier.name}`} onClick={() => onStatus(supplier)}>{supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></div></article>)}</div></section>;
}
