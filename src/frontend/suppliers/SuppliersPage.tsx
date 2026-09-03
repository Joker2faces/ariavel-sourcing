import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupplierService } from '../../backend/services/supplierService';
import type { RuntimeCapabilities } from '../../backend/runtime/runtimeCapabilities';
import { fullCapabilities } from '../../backend/runtime/runtimeCapabilities';
import type { Supplier, SupplierInput, SupplierSourceConfiguration, SupplierStatus } from '../../shared/types/domain';
import { SupplierDetailsDrawer } from './SupplierDetailsDrawer';
import { SupplierFormDrawer } from './SupplierFormDrawer';
import { SupplierSourceDrawer } from './SupplierSourceDrawer';

const statusLabels: Record<SupplierStatus, string> = { ACTIVE: 'Active', PENDING: 'Pending', INACTIVE: 'Inactive', BLOCKED: 'Blocked' };
const sourceLabel = (supplier: Supplier) => supplier.sourceType === 'MONDAY_BOARD' ? 'monday board' : supplier.sourceType === 'IMPORT' ? 'Imported' : 'Ariavel';

export function SuppliersPage({ service, capabilities = fullCapabilities }: { service: SupplierService; capabilities?: RuntimeCapabilities }) {
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sourceConfig, setSourceConfig] = useState<SupplierSourceConfiguration | undefined>();
  const [boardWarningCount, setBoardWarningCount] = useState(0);
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

  const isBoardMode = sourceConfig?.mode === 'MONDAY_BOARD';

  const applyFilters = useCallback((all: Supplier[]) => {
    const query = search.trim().toLowerCase();
    return all.filter(s => {
      const searchable = [s.name, s.supplierCode, s.primaryContactName, s.email, s.category].filter(Boolean).join(' ').toLowerCase();
      return (!query || searchable.includes(query)) && (!status || s.status === status) && (!category || s.category === category) && (!country || s.country === country);
    });
  }, [category, country, search, status]);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const config = await service.getSourceConfiguration();
      setSourceConfig(config);
      let all: Supplier[];
      if (config?.mode === 'MONDAY_BOARD' && service.listBoardSuppliers) {
        const { suppliers: boardSuppliers, warnings } = await service.listBoardSuppliers();
        all = boardSuppliers;
        setBoardWarningCount(warnings.length);
      } else {
        all = await service.list();
        setBoardWarningCount(0);
      }
      setAllSuppliers(all);
      setSuppliers(applyFilters(all));
    } catch { setError('Supplier data could not be loaded. Try again.'); }
    finally { setLoading(false); }
  }, [applyFilters, service]);

  useEffect(() => { void refresh(); }, [refresh]);

  const options = useMemo(() => ({
    categories: [...new Set(allSuppliers.map(item => item.category).filter((v): v is string => Boolean(v)))].sort(),
    countries: [...new Set(allSuppliers.map(item => item.country).filter((v): v is string => Boolean(v)))].sort(),
  }), [allSuppliers]);

  const summary = useMemo(() => ({
    total: allSuppliers.length,
    active: allSuppliers.filter(item => item.status === 'ACTIVE').length,
    preferred: allSuppliers.filter(item => item.preferred).length,
    incomplete: allSuppliers.filter(item => !item.category || !item.country || !item.email || !item.primaryContactName).length,
  }), [allSuppliers]);

  const feedback = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };

  const save = async (input: SupplierInput) => {
    if (editing && editing !== 'new') await service.update(editing.id, input);
    else await service.create(input);
    setEditing(undefined);
    feedback(editing === 'new' ? 'Supplier created.' : 'Supplier updated.');
    await refresh();
  };

  const reset = () => { setSearch(''); setStatus(''); setCategory(''); setCountry(''); };
  const resetAndFilter = () => { reset(); setSuppliers(allSuppliers); };

  const changeStatus = async (supplier: Supplier) => {
    await service.changeStatus(supplier.id, supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    feedback('Supplier status changed.');
    await refresh();
  };

  useEffect(() => { setSuppliers(applyFilters(allSuppliers)); }, [applyFilters, allSuppliers]);

  return <div className="content-wrap suppliers-content">
    <div className="supplier-heading">
      <div><h1>Suppliers</h1><p>Manage approved suppliers and prepare them for sourcing events.</p></div>
      <div className="heading-actions">
        {capabilities.canConfigureSupplierSource && <button className="secondary-button" onClick={() => setSourceOpen(true)}>Configure supplier source</button>}
        {!isBoardMode && capabilities.canEditAriavelSuppliers && <button className="primary-button" aria-label="Add supplier" onClick={() => setEditing('new')}>+ Add supplier</button>}
      </div>
    </div>

    {isBoardMode && <div className="board-mode-banner" role="note">
      <strong>Connected to monday board.</strong> Supplier records are read directly from your monday board. To add or edit records, update them in monday.
      {boardWarningCount > 0 && <span className="board-warning-count"> {boardWarningCount} row{boardWarningCount !== 1 ? 's' : ''} skipped due to missing required fields.</span>}
    </div>}

    {notice ? <div className="notice" role="status">{notice}</div> : null}
    {error ? <div className="error-banner" role="alert">{error}</div> : null}

    <section className="supplier-summary" aria-label="Supplier summary">
      <Metric label="Total suppliers" value={summary.total} />
      <Metric label="Active suppliers" value={summary.active} />
      <Metric label="Preferred suppliers" value={summary.preferred} />
      <Metric label="Incomplete profiles" value={summary.incomplete} />
    </section>

    {allSuppliers.length ? <>
      <section className="supplier-controls" aria-label="Supplier filters">
        <label className="search-field"><span className="sr-only">Search suppliers</span><input type="search" aria-label="Search suppliers" placeholder="Search suppliers" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label><span>Status</span><select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as SupplierStatus | '')}><option value="">All statuses</option>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>Category</span><select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{options.categories.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Country</span><select aria-label="Country" value={country} onChange={e => setCountry(e.target.value)}><option value="">All countries</option>{options.countries.map(v => <option key={v}>{v}</option>)}</select></label>
        <button className="reset-button" onClick={resetAndFilter}>Reset filters</button>
      </section>
      <div className="result-count">{loading ? 'Loading suppliers…' : `${suppliers.length} of ${allSuppliers.length} suppliers`}</div>
      {!loading && suppliers.length === 0
        ? <div className="empty-state compact"><h2>No suppliers match your filters.</h2><p>Adjust the search or clear the current filters.</p><button className="secondary-button" onClick={resetAndFilter}>Reset filters</button></div>
        : <SupplierRecords suppliers={suppliers} onView={setSelected} onEdit={capabilities.canEditAriavelSuppliers && !isBoardMode ? setEditing : undefined} onStatus={capabilities.canEditAriavelSuppliers && !isBoardMode ? s => void changeStatus(s) : undefined} />}
    </> : !loading ? (
      <div className="empty-state">
        <h2>No suppliers yet</h2>
        <p>{isBoardMode ? 'No mapped supplier records found in the connected monday board.' : 'Add suppliers manually or connect an existing monday supplier board.'}</p>
        {!isBoardMode && <div>
          {capabilities.canConfigureSupplierSource && <button className="secondary-button" onClick={() => setSourceOpen(true)}>Connect existing monday board</button>}
          {capabilities.canEditAriavelSuppliers && <button className="primary-button" onClick={() => setEditing('new')}>Add supplier</button>}
        </div>}
      </div>
    ) : <div className="supplier-skeleton" aria-label="Loading suppliers" aria-busy="true"><div /><div /><div /></div>}

    {selected ? <SupplierDetailsDrawer supplier={selected} onClose={() => setSelected(undefined)} onEdit={capabilities.canEditAriavelSuppliers && !isBoardMode ? () => { setEditing(selected); setSelected(undefined); } : undefined} /> : null}
    {editing ? <SupplierFormDrawer supplier={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} onSave={save} /> : null}
    {sourceOpen ? <SupplierSourceDrawer service={service} onClose={() => setSourceOpen(false)} onSaved={() => { setSourceOpen(false); feedback('Supplier source configured.'); void refresh(); }} /> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="supplier-metric"><span>{label}</span><strong>{value}</strong></div>; }

function SupplierRecords({ suppliers, onView, onEdit, onStatus }: { suppliers: Supplier[]; onView: (s: Supplier) => void; onEdit?: (s: Supplier) => void; onStatus?: (s: Supplier) => void; }) {
  return <section className="supplier-panel">
    <div className="supplier-table-wrap">
      <table className="supplier-table">
        <thead><tr><th>Supplier</th><th>Status</th><th>Category</th><th>Country</th><th>Primary contact</th><th>Currency</th><th>Rating</th><th>Source</th><th>Actions</th></tr></thead>
        <tbody>{suppliers.map(supplier => <tr key={supplier.id}>
          <td><button className="supplier-link" onClick={() => onView(supplier)}>{supplier.name}</button><small>{supplier.supplierCode ?? 'No code'} · {supplier.email ?? 'No email'}</small></td>
          <td><span className={`supplier-status status-${supplier.status.toLowerCase()}`}>{statusLabels[supplier.status]}</span></td>
          <td>{supplier.category ?? '—'}</td>
          <td>{supplier.country ?? '—'}</td>
          <td>{supplier.primaryContactName ?? '—'}</td>
          <td>{supplier.currency ?? '—'}</td>
          <td>{supplier.rating ? `${supplier.rating} / 5` : '—'}</td>
          <td>{sourceLabel(supplier)}</td>
          <td><div className="row-actions">
            <button aria-label={`View ${supplier.name}`} onClick={() => onView(supplier)}>View</button>
            {onEdit && <button aria-label={`Edit ${supplier.name}`} onClick={() => onEdit(supplier)}>Edit</button>}
            {onStatus && <button aria-label={`${supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${supplier.name}`} onClick={() => onStatus(supplier)}>{supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="supplier-cards">{suppliers.map(supplier =>
      <article key={supplier.id} className="supplier-card">
        <div className="supplier-card-head">
          <div><button className="supplier-link" onClick={() => onView(supplier)}>{supplier.name}</button><small>{supplier.supplierCode ?? 'No supplier code'}</small></div>
          <span className={`supplier-status status-${supplier.status.toLowerCase()}`}>{statusLabels[supplier.status]}</span>
        </div>
        <dl>
          <div><dt>Category</dt><dd>{supplier.category ?? '—'}</dd></div>
          <div><dt>Country</dt><dd>{supplier.country ?? '—'}</dd></div>
          <div><dt>Contact</dt><dd>{supplier.primaryContactName ?? supplier.email ?? '—'}</dd></div>
          <div><dt>Source</dt><dd>{sourceLabel(supplier)}</dd></div>
        </dl>
        <div className="row-actions">
          <button aria-label={`View ${supplier.name}`} onClick={() => onView(supplier)}>View</button>
          {onEdit && <button aria-label={`Edit ${supplier.name}`} onClick={() => onEdit(supplier)}>Edit</button>}
          {onStatus && <button aria-label={`${supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${supplier.name}`} onClick={() => onStatus(supplier)}>{supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>}
        </div>
      </article>
    )}</div>
  </section>;
}
