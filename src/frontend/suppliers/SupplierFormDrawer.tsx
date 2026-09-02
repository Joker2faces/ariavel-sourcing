import { cloneElement, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import type { Supplier, SupplierInput, SupplierStatus } from '../../shared/types/domain';
import { validateSupplierInput, type SupplierValidationErrors } from '../../shared/validation/supplierValidation';

const emptyInput: SupplierInput = { name: '', status: 'PENDING', preferred: false, sourceType: 'ARIAVEL' };
const statuses: SupplierStatus[] = ['ACTIVE', 'PENDING', 'INACTIVE', 'BLOCKED'];

export function SupplierFormDrawer({ supplier, onClose, onSave }: { supplier?: Supplier; onClose: () => void; onSave: (input: SupplierInput) => Promise<void> }) {
  const [value, setValue] = useState<SupplierInput>(supplier ? { ...supplier } : emptyInput);
  const [errors, setErrors] = useState<SupplierValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const field = (key: keyof SupplierInput, next: string | boolean | number | undefined) => setValue(current => ({ ...current, [key]: next }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateSupplierInput(value);
    setErrors(result.errors);
    if (!result.valid) return;
    setSaving(true);
    try { await onSave(result.value); } finally { setSaving(false); }
  };
  return <Drawer title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
    <form onSubmit={submit} className="supplier-form" noValidate>
      <div className="form-section"><h3>Identity</h3><div className="form-grid">
        <Field label="Supplier name" error={errors.name}><input autoFocus value={value.name} onChange={event => field('name', event.target.value)} /></Field>
        <Field label="Supplier code" error={errors.supplierCode}><input value={value.supplierCode ?? ''} onChange={event => field('supplierCode', event.target.value)} /></Field>
        <Field label="Status" error={errors.status}><select value={value.status} onChange={event => field('status', event.target.value as SupplierStatus)}>{statuses.map(status => <option key={status}>{status}</option>)}</select></Field>
        <Field label="Category"><input value={value.category ?? ''} onChange={event => field('category', event.target.value)} /></Field>
        <Field label="Country"><input value={value.country ?? ''} onChange={event => field('country', event.target.value)} /></Field>
      </div></div>
      <div className="form-section"><h3>Contact</h3><div className="form-grid">
        <Field label="Primary contact"><input value={value.primaryContactName ?? ''} onChange={event => field('primaryContactName', event.target.value)} /></Field>
        <Field label="Email" error={errors.email}><input type="email" value={value.email ?? ''} onChange={event => field('email', event.target.value)} /></Field>
        <Field label="Phone"><input value={value.phone ?? ''} onChange={event => field('phone', event.target.value)} /></Field>
      </div></div>
      <div className="form-section"><h3>Commercial defaults</h3><div className="form-grid">
        <Field label="Currency" error={errors.currency}><input maxLength={3} value={value.currency ?? ''} onChange={event => field('currency', event.target.value)} /></Field>
        <Field label="Payment terms"><input value={value.paymentTerms ?? ''} onChange={event => field('paymentTerms', event.target.value)} /></Field>
        <Field label="Default Incoterm"><input value={value.defaultIncoterm ?? ''} onChange={event => field('defaultIncoterm', event.target.value)} /></Field>
        <Field label="Rating" error={errors.rating}><select value={value.rating ?? ''} onChange={event => field('rating', event.target.value ? Number(event.target.value) : undefined)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating}</option>)}</select></Field>
      </div><label className="check-field"><input type="checkbox" checked={value.preferred} onChange={event => field('preferred', event.target.checked)} /> Preferred supplier</label>
      <Field label="Notes"><textarea rows={4} value={value.notes ?? ''} onChange={event => field('notes', event.target.value)} /></Field></div>
      <div className="drawer-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'}</button></div>
    </form>
  </Drawer>;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="drawer-backdrop" role="presentation"><section className="drawer" role="dialog" aria-modal="true" aria-label={title}><div className="drawer-header"><h2>{title}</h2><button className="close-button" aria-label={`Close ${title}`} onClick={onClose}>×</button></div><div className="drawer-body">{children}</div></section></div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactElement<{ id?: string; 'aria-label'?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }> }) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return <label className="field" htmlFor={id}><span>{label}</span>{cloneElement(children, { id, 'aria-label': label, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined })}{error ? <small id={`${id}-error`} className="field-error">{error}</small> : null}</label>;
}
