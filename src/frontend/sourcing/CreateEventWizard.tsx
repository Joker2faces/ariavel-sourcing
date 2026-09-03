import { useEffect, useReducer, useState } from 'react';
import type { SourcingEvent, SourcingEventInput, SourcingLine, SourcingSupplierSelection, Supplier } from '../../shared/types/domain';
import type { SourcingEventService } from '../../backend/services/sourcingEventService';
import { validateSourcingLine, validateReadyForInvitation } from '../../shared/validation/sourcingEventValidation';
import { formatDeadlineDisplay } from '../../shared/utils/deadline';

const UNITS = ['pcs', 'kg', 'g', 't', 'L', 'mL', 'm', 'm²', 'm³', 'box', 'pallet', 'set', 'hour', 'day'];

type Step = 1 | 2 | 3 | 4;

interface WizardState extends SourcingEventInput {
  lines: SourcingLine[];
  supplierSelections: SourcingSupplierSelection[];
}

function initState(editing?: SourcingEvent, ref?: string): WizardState {
  if (editing) {
    return {
      reference: editing.reference,
      title: editing.title,
      description: editing.description ?? '',
      currency: editing.currency,
      deadline: editing.deadline ?? '',
      targetDeliveryDate: editing.targetDeliveryDate ?? '',
      category: editing.category ?? '',
      ownerUserId: editing.ownerUserId,
      ownerName: editing.ownerName ?? '',
      internalNotes: editing.internalNotes ?? '',
      lines: editing.lines.map(l => ({ ...l })),
      supplierSelections: editing.supplierSelections.map(s => ({ ...s })),
    };
  }
  return {
    reference: ref ?? '',
    title: '',
    description: '',
    currency: 'EUR',
    deadline: '',
    targetDeliveryDate: '',
    category: '',
    ownerUserId: '',
    ownerName: '',
    internalNotes: '',
    lines: [],
    supplierSelections: [],
  };
}

type Action =
  | { type: 'SET_FIELD'; field: keyof WizardState; value: string }
  | { type: 'ADD_LINE' }
  | { type: 'UPDATE_LINE'; line: SourcingLine }
  | { type: 'REMOVE_LINE'; id: string }
  | { type: 'DUPLICATE_LINE'; id: string }
  | { type: 'TOGGLE_SUPPLIER'; supplier: Supplier; service: SourcingEventService }
  | { type: 'SET_SELECTIONS'; selections: SourcingSupplierSelection[] };

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'ADD_LINE':
      return { ...state, lines: [...state.lines, { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'pcs' }] };
    case 'UPDATE_LINE':
      return { ...state, lines: state.lines.map(l => l.id === action.line.id ? { ...action.line } : l) };
    case 'REMOVE_LINE':
      return { ...state, lines: state.lines.filter(l => l.id !== action.id) };
    case 'DUPLICATE_LINE': {
      const orig = state.lines.find(l => l.id === action.id);
      if (!orig) return state;
      return { ...state, lines: [...state.lines, { ...orig, id: crypto.randomUUID() }] };
    }
    case 'SET_SELECTIONS':
      return { ...state, supplierSelections: action.selections };
    default:
      return state;
  }
}

export function CreateEventWizard({
  service,
  editingEvent,
  onDone,
  onCancel,
}: {
  service: SourcingEventService;
  editingEvent?: SourcingEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [eligibleSuppliers, setEligibleSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCategory, setSupplierCategory] = useState('');
  const [supplierCountry, setSupplierCountry] = useState('');

  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const ref = service.generateReference();
    return initState(editingEvent, ref);
  });

  useEffect(() => {
    if (step === 3) {
      setSuppliersLoading(true);
      service.listEligibleSuppliers()
        .then(setEligibleSuppliers)
        .catch(() => setEligibleSuppliers([]))
        .finally(() => setSuppliersLoading(false));
    }
  }, [step, service]);

  const set = (field: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    dispatch({ type: 'SET_FIELD', field, value: e.target.value });
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!state.reference.trim()) errs.reference = 'Reference is required.';
    else if (state.reference.trim().length > 50) errs.reference = 'Reference must be 50 characters or fewer.';
    if (!state.title.trim()) errs.title = 'Event title is required.';
    else if (state.title.trim().length > 120) errs.title = 'Title must be 120 characters or fewer.';
    if (!state.currency.trim()) errs.currency = 'Currency is required.';
    else if (!/^[A-Z]{3}$/.test(state.currency.trim().toUpperCase())) errs.currency = 'Enter a three-letter currency code (e.g. EUR).';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = (): boolean => {
    if (state.lines.length === 0) { setFieldErrors({ lines: 'Add at least one line item.' }); return false; }
    const errs: Record<string, string> = {};
    state.lines.forEach((l, i) => {
      const le = validateSourcingLine(l);
      Object.entries(le).forEach(([k, v]) => { errs[`line_${i}_${k}`] = v; });
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setFieldErrors({});
    setStep(s => Math.min(4, s + 1) as Step);
  };

  const prev = () => { setFieldErrors({}); setStep(s => Math.max(1, s - 1) as Step); };

  const selectedIds = new Set(state.supplierSelections.map(s => s.supplierId));

  const toggleSupplier = (supplier: Supplier) => {
    if (selectedIds.has(supplier.id)) {
      dispatch({ type: 'SET_SELECTIONS', selections: state.supplierSelections.filter(s => s.supplierId !== supplier.id) });
    } else {
      const sel = service.buildSupplierSelection(supplier);
      dispatch({ type: 'SET_SELECTIONS', selections: [...state.supplierSelections, sel] });
    }
  };

  const filteredSuppliers = eligibleSuppliers.filter(s => {
    const q = supplierSearch.trim().toLowerCase();
    const match = !q || [s.name, s.supplierCode, s.email, s.category, s.country].filter(Boolean).join(' ').toLowerCase().includes(q);
    return match && (!supplierCategory || s.category === supplierCategory) && (!supplierCountry || s.country === supplierCountry);
  });

  const supplierOptions = {
    categories: [...new Set(eligibleSuppliers.map(s => s.category).filter((c): c is string => Boolean(c)))].sort(),
    countries: [...new Set(eligibleSuppliers.map(s => s.country).filter((c): c is string => Boolean(c)))].sort(),
  };

  const buildInput = (): SourcingEventInput => ({
    reference: state.reference.trim(),
    title: state.title.trim(),
    description: state.description?.trim() || undefined,
    currency: state.currency.trim().toUpperCase(),
    deadline: state.deadline?.trim() || undefined,
    targetDeliveryDate: state.targetDeliveryDate?.trim() || undefined,
    category: state.category?.trim() || undefined,
    ownerUserId: state.ownerUserId.trim(),
    ownerName: state.ownerName?.trim() || undefined,
    internalNotes: state.internalNotes?.trim() || undefined,
    lines: state.lines,
    supplierSelections: state.supplierSelections,
  });

  const saveDraft = async () => {
    setSaving(true); setSaveError('');
    try {
      const input = buildInput();
      if (editingEvent) {
        await service.update(editingEvent.id, input, state.ownerUserId || editingEvent.createdByUserId);
      } else {
        await service.create(input, state.ownerUserId || 'user');
      }
      onDone();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const markReady = async () => {
    setSaving(true); setSaveError('');
    try {
      const input = buildInput();
      let event: SourcingEvent;
      if (editingEvent) {
        event = await service.update(editingEvent.id, input, state.ownerUserId || editingEvent.createdByUserId);
      } else {
        event = await service.create(input, state.ownerUserId || 'user');
      }
      const { valid, errors, warnings } = service.validateReady(event);
      if (!valid) {
        const msgs = Object.entries(errors)
          .filter(([k]) => k !== 'lineErrors' && k !== 'supplierWarnings')
          .map(([, v]) => v as string);
        setSaveError(['Cannot mark ready:', ...msgs].join(' '));
        return;
      }
      if (warnings.length > 0 && !window.confirm(`Warning: ${warnings.join(' ')} Continue anyway?`)) return;
      await service.changeStatus(event.id, 'READY_FOR_INVITATION', state.ownerUserId || 'user');
      onDone();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not update status.');
    } finally {
      setSaving(false);
    }
  };

  const STEPS: { label: string }[] = [
    { label: 'Details' },
    { label: 'Line Items' },
    { label: 'Suppliers' },
    { label: 'Review' },
  ];

  return (
    <div className="content-wrap wizard-wrap">
      <div className="wizard-header">
        <button className="secondary-button" onClick={onCancel}>← Back to events</button>
        <h1>{editingEvent ? `Edit ${editingEvent.reference}` : 'Create Sourcing Event'}</h1>
      </div>

      <nav className="wizard-steps" aria-label="Wizard steps">
        {STEPS.map((s, i) => (
          <div key={s.label} className={`wizard-step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="step-num">{i + 1}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </nav>

      {saveError && <div className="error-banner" role="alert">{saveError}</div>}

      {step === 1 && (
        <div className="wizard-body">
          <h2>Event Details</h2>
          <div className="form-grid">
            <Field label="Reference *" error={fieldErrors.reference}>
              <input value={state.reference} onChange={set('reference')} placeholder="RFQ-2026-A7K3" maxLength={50} aria-describedby="ref-hint" />
              <small id="ref-hint">Auto-generated — you can edit it.</small>
            </Field>
            <Field label="Title *" error={fieldErrors.title}>
              <input value={state.title} onChange={set('title')} placeholder="Industrial Solvents Q4" maxLength={120} />
            </Field>
            <Field label="Currency *" error={fieldErrors.currency}>
              <input value={state.currency} onChange={e => dispatch({ type: 'SET_FIELD', field: 'currency', value: e.target.value.toUpperCase() })} placeholder="EUR" maxLength={3} style={{ textTransform: 'uppercase' }} />
            </Field>
            <Field label="Deadline">
              <input type="date" value={state.deadline ?? ''} onChange={set('deadline')} />
            </Field>
            <Field label="Target Delivery Date">
              <input type="date" value={state.targetDeliveryDate ?? ''} onChange={set('targetDeliveryDate')} />
            </Field>
            <Field label="Category">
              <input value={state.category ?? ''} onChange={set('category')} placeholder="Chemicals, Packaging…" />
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={3} value={state.description ?? ''} onChange={set('description')} placeholder="Optional event description…" />
          </Field>
          <Field label="Internal notes">
            <textarea rows={2} value={state.internalNotes ?? ''} onChange={set('internalNotes')} placeholder="Internal notes (not shared with suppliers)…" />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <div className="wizard-section-head">
            <h2>Line Items</h2>
            <button className="secondary-button" onClick={() => dispatch({ type: 'ADD_LINE' })}>+ Add line</button>
          </div>
          {fieldErrors.lines && <div className="error-banner" role="alert">{fieldErrors.lines}</div>}
          {state.lines.length === 0
            ? <div className="empty-state compact"><h2>No line items yet</h2><p>Add the products or services you want to source.</p><button className="primary-button" onClick={() => dispatch({ type: 'ADD_LINE' })}>+ Add line item</button></div>
            : <div className="line-items">
              {state.lines.map((line, idx) => <LineItemRow key={line.id} line={line} index={idx} errors={Object.fromEntries(Object.entries(fieldErrors).filter(([k]) => k.startsWith(`line_${idx}_`)).map(([k, v]) => [k.replace(`line_${idx}_`, ''), v]))} onChange={updated => dispatch({ type: 'UPDATE_LINE', line: updated })} onRemove={() => dispatch({ type: 'REMOVE_LINE', id: line.id })} onDuplicate={() => dispatch({ type: 'DUPLICATE_LINE', id: line.id })} />)}
            </div>}
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h2>Select Suppliers</h2>
          <p className="wizard-hint">Only Active suppliers are selectable. Preferred suppliers are highlighted.</p>
          <div className="supplier-controls">
            <label className="search-field"><span className="sr-only">Search suppliers</span><input type="search" placeholder="Search suppliers…" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} aria-label="Search suppliers" /></label>
            <label><span>Category</span><select value={supplierCategory} onChange={e => setSupplierCategory(e.target.value)} aria-label="Category"><option value="">All</option>{supplierOptions.categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label><span>Country</span><select value={supplierCountry} onChange={e => setSupplierCountry(e.target.value)} aria-label="Country"><option value="">All</option>{supplierOptions.countries.map(c => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="supplier-sel-count">
            {state.supplierSelections.length} supplier{state.supplierSelections.length !== 1 ? 's' : ''} selected
          </div>
          {suppliersLoading
            ? <div className="supplier-skeleton" aria-busy="true"><div /><div /></div>
            : filteredSuppliers.length === 0
            ? <div className="empty-state compact"><h2>No eligible suppliers</h2><p>Only Active suppliers can be selected. Pending, Inactive, and Blocked suppliers are excluded.</p></div>
            : <div className="sel-supplier-list">
              {filteredSuppliers.map(s => {
                const selected2 = selectedIds.has(s.id);
                return (
                  <label key={s.id} className={`sel-supplier-row ${selected2 ? 'sel-selected' : ''} ${s.preferred ? 'sel-preferred' : ''}`}>
                    <input type="checkbox" checked={selected2} onChange={() => toggleSupplier(s)} aria-label={`Select ${s.name}`} />
                    <div className="sel-supplier-info">
                      <strong>{s.name}{s.preferred && <span className="preferred-badge"> ★</span>}</strong>
                      <small>{[s.supplierCode, s.category, s.country].filter(Boolean).join(' · ')}</small>
                      {s.email ? <small className="sel-email">{s.email}</small> : <small className="no-email-warn">⚠ No email</small>}
                    </div>
                  </label>
                );
              })}
            </div>}
        </div>
      )}

      {step === 4 && (
        <div className="wizard-body">
          <h2>Review</h2>
          <ReviewSection title="Event Identity">
            <dl>
              <ReviewItem label="Reference" value={state.reference} />
              <ReviewItem label="Title" value={state.title} />
              <ReviewItem label="Currency" value={state.currency} />
              {state.deadline && <ReviewItem label="Deadline" value={formatDeadlineDisplay(state.deadline)} />}
              {state.category && <ReviewItem label="Category" value={state.category} />}
              {state.description && <ReviewItem label="Description" value={state.description} />}
            </dl>
          </ReviewSection>
          <ReviewSection title={`Line Items (${state.lines.length})`}>
            {state.lines.length === 0
              ? <p className="review-empty">No line items — go back and add at least one.</p>
              : <ul className="review-lines">
                {state.lines.map(l => <li key={l.id}><strong>{l.description}</strong> — {l.quantity} {l.unit}{l.targetUnitPrice !== undefined ? ` @ ${l.targetUnitPrice}` : ''}</li>)}
              </ul>}
          </ReviewSection>
          <ReviewSection title={`Suppliers (${state.supplierSelections.length})`}>
            {state.supplierSelections.length === 0
              ? <p className="review-empty">No suppliers selected — go back and select at least one.</p>
              : <ul className="review-suppliers">
                {state.supplierSelections.map(s => (
                  <li key={s.supplierId}>
                    <strong>{s.supplierNameSnapshot}</strong>
                    {s.emailSnapshot ? <> · {s.emailSnapshot}</> : <span className="no-email-warn"> · ⚠ No email</span>}
                  </li>
                ))}
              </ul>}
          </ReviewSection>
          {(() => {
            const mockEvent: SourcingEvent = {
              id: 'preview',
              tenantId: 'preview',
              status: 'DRAFT',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdByUserId: state.ownerUserId || 'user',
              updatedByUserId: state.ownerUserId || 'user',
              ...buildInput(),
            };
            const { errors, warnings } = validateReadyForInvitation(mockEvent);
            const errorMsgs = Object.entries(errors).filter(([k]) => k !== 'lineErrors' && k !== 'supplierWarnings').map(([, v]) => v as string);
            return (
              <>
                {errorMsgs.length > 0 && <div className="review-validation-errors"><strong>Not ready for invitation:</strong><ul>{errorMsgs.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
                {warnings.length > 0 && <div className="review-warnings"><strong>Warnings:</strong><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
              </>
            );
          })()}
        </div>
      )}

      <div className="wizard-footer">
        <div>
          {step > 1 && <button className="secondary-button" onClick={prev} disabled={saving}>← Back</button>}
        </div>
        <div className="wizard-footer-right">
          {step < 4 && <button className="primary-button" onClick={next}>Next →</button>}
          {step === 4 && (
            <>
              <button className="secondary-button" onClick={saveDraft} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
              <button className="primary-button" onClick={markReady} disabled={saving}>{saving ? 'Saving…' : 'Mark Ready for Invitation'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}{children}</label>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}

function LineItemRow({ line, index, errors, onChange, onRemove, onDuplicate }: {
  line: SourcingLine; index: number;
  errors: Record<string, string>;
  onChange: (l: SourcingLine) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const set = (field: keyof SourcingLine) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const raw = e.target.value;
    const value = (field === 'quantity' || field === 'targetUnitPrice') ? (raw === '' ? undefined : Number(raw)) : raw;
    onChange({ ...line, [field]: value });
  };

  return (
    <div className="line-item-row">
      <div className="line-item-num">{index + 1}</div>
      <div className="line-item-fields">
        <div className="form-grid line-main-row">
          <Field label="Description *" error={errors.description}>
            <input value={line.description} onChange={set('description')} placeholder="Product or service description" maxLength={200} />
          </Field>
          <Field label="SKU">
            <input value={line.sku ?? ''} onChange={set('sku')} placeholder="Optional SKU" />
          </Field>
        </div>
        <div className="form-grid line-detail-row">
          <Field label="Qty *" error={errors.quantity}>
            <input type="number" min={0.001} step="any" value={line.quantity} onChange={set('quantity')} />
          </Field>
          <Field label="Unit *" error={errors.unit}>
            <select value={line.unit} onChange={set('unit')}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              <option value={line.unit && !UNITS.includes(line.unit) ? line.unit : '__custom'}>{line.unit && !UNITS.includes(line.unit) ? line.unit : 'Custom…'}</option>
            </select>
          </Field>
          <Field label="Category">
            <input value={line.category ?? ''} onChange={set('category')} placeholder="Optional" />
          </Field>
          <Field label="Target Unit Price" error={errors.targetUnitPrice}>
            <input type="number" min={0} step="0.01" value={line.targetUnitPrice ?? ''} onChange={set('targetUnitPrice')} placeholder="Optional" />
          </Field>
        </div>
        {(errors.description || errors.quantity || errors.unit) && null}
      </div>
      <div className="line-item-actions">
        <button type="button" onClick={onDuplicate} aria-label="Duplicate line" title="Duplicate">⊕</button>
        <button type="button" onClick={onRemove} aria-label="Remove line" title="Remove">✕</button>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="review-section"><h3>{title}</h3>{children}</div>;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
