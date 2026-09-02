import type { MappingIssue, MappingIssueKind, MondayBoardDescriptor, SupplierFieldKey, SupplierFieldMapping } from '../types/domain';

export const supplierFieldDefinitions: Array<{ key: SupplierFieldKey; label: string; required: boolean }> = [
  { key: 'name', label: 'Supplier Name', required: true },
  { key: 'supplierCode', label: 'Supplier Code', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'primaryContactName', label: 'Primary Contact', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'country', label: 'Country', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'paymentTerms', label: 'Payment Terms', required: false },
  { key: 'preferred', label: 'Preferred', required: false },
  { key: 'rating', label: 'Rating', required: false },
  { key: 'phone', label: 'Phone', required: false },
];

const compatibleTypes: Record<SupplierFieldKey, string[]> = {
  name: ['name', 'text'], supplierCode: ['text', 'name'], email: ['email', 'text'],
  primaryContactName: ['people', 'text', 'name'], status: ['status', 'dropdown', 'text'],
  category: ['dropdown', 'status', 'text'], country: ['country', 'dropdown', 'text'],
  currency: ['dropdown', 'status', 'text'], paymentTerms: ['text', 'dropdown', 'status'],
  preferred: ['checkbox', 'status', 'dropdown'], rating: ['numbers', 'rating'], phone: ['phone', 'text'],
};

export function getMappingCompatibility(field: SupplierFieldKey, columnType: string): MappingIssueKind {
  return compatibleTypes[field].includes(columnType) ? 'VALID' : 'WARNING';
}

export function validateSupplierBoardMapping(board: MondayBoardDescriptor, mappings: SupplierFieldMapping[]): { valid: boolean; issues: MappingIssue[] } {
  const mappingByField = new Map(mappings.map(mapping => [mapping.supplierField, mapping]));
  const columns = new Map(board.columns.map(column => [column.id, column]));
  const issues = supplierFieldDefinitions.map<MappingIssue>(definition => {
    const mapping = mappingByField.get(definition.key);
    if (!mapping) return { supplierField: definition.key, kind: definition.required ? 'MISSING_REQUIRED' : 'UNMAPPED', message: definition.required ? `${definition.label} must be mapped.` : `${definition.label} is optional.` };
    const column = columns.get(mapping.mondayColumnId);
    if (!column) return { supplierField: definition.key, kind: definition.required ? 'MISSING_REQUIRED' : 'WARNING', message: 'The selected column is unavailable.' };
    const kind = getMappingCompatibility(definition.key, column.type);
    return { supplierField: definition.key, kind, message: kind === 'VALID' ? `Compatible ${column.type} column.` : `${column.type} may need normalization.` };
  });
  return { valid: !issues.some(issue => issue.kind === 'MISSING_REQUIRED'), issues };
}

export function previewMappedSuppliers(board: MondayBoardDescriptor, mappings: SupplierFieldMapping[]): Array<Record<string, unknown>> {
  return board.sampleItems.slice(0, 3).map(item => {
    const result: Record<string, unknown> = { mondayItemId: item.id };
    for (const mapping of mappings) {
      result[mapping.supplierField] = mapping.mondayColumnId === 'name' ? item.name : item.columnValues[mapping.mondayColumnId];
    }
    return result;
  });
}
