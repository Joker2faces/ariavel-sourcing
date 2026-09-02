import type { Supplier } from '../../shared/types/domain';
import { Drawer } from './SupplierFormDrawer';

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));
const display = (value: string | number | undefined) => value ?? 'Not provided';

export function SupplierDetailsDrawer({ supplier, onClose, onEdit }: { supplier: Supplier; onClose: () => void; onEdit: () => void }) {
  return <Drawer title="Supplier details" onClose={onClose}><div className="detail-hero"><div><h3>{supplier.name}</h3><p>{supplier.supplierCode ?? 'No supplier code'}</p></div><span className={`supplier-status status-${supplier.status.toLowerCase()}`}>{supplier.status}</span></div>
    <DetailSection title="Identity" values={[['Category', display(supplier.category)], ['Country', display(supplier.country)]]} />
    <DetailSection title="Contact" values={[['Primary contact', display(supplier.primaryContactName)], ['Email', display(supplier.email)], ['Phone', display(supplier.phone)]]} />
    <DetailSection title="Commercial defaults" values={[['Currency', display(supplier.currency)], ['Payment terms', display(supplier.paymentTerms)], ['Default Incoterm', display(supplier.defaultIncoterm)]]} />
    <DetailSection title="Procurement" values={[['Preferred supplier', supplier.preferred ? 'Yes' : 'No'], ['Manual rating', supplier.rating ? `${supplier.rating} / 5` : 'Not rated'], ['Notes', display(supplier.notes)]]} />
    <DetailSection title="Source" values={[['Source type', supplier.sourceType === 'MONDAY_BOARD' ? 'monday board' : supplier.sourceType === 'ARIAVEL' ? 'Ariavel' : 'Imported'], ['Board reference', display(supplier.mondayBoardId)]]} />
    <DetailSection title="System" values={[['Created', formatDate(supplier.createdAt)], ['Updated', formatDate(supplier.updatedAt)]]} />
    <div className="drawer-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onEdit}>Edit supplier</button></div>
  </Drawer>;
}

function DetailSection({ title, values }: { title: string; values: Array<[string, string | number]> }) {
  return <section className="detail-section"><h4>{title}</h4><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
