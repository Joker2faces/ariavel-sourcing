import { describe, expect, it } from 'vitest';
import { getMappingCompatibility, previewMappedSuppliers, validateSupplierBoardMapping } from '../src/shared/mapping/supplierMapping';
import type { MondayBoardDescriptor, SupplierFieldMapping } from '../src/shared/types/domain';

const board: MondayBoardDescriptor = {
  id: 'board-1',
  name: 'Supplier Directory',
  columns: [
    { id: 'name', title: 'Name', type: 'name' },
    { id: 'email', title: 'Supplier Email', type: 'email' },
    { id: 'rating', title: 'Rating', type: 'numbers' },
    { id: 'date', title: 'Onboarded', type: 'date' },
  ],
  sampleItems: [{ id: 'item-1', name: 'Acme Materials', columnValues: { email: 'sales@acme.example', rating: 4 } }],
};

describe('supplier board mapping', () => {
  it('requires the supplier name mapping', () => {
    const result = validateSupplierBoardMapping(board, [{ supplierField: 'email', mondayColumnId: 'email' }]);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ supplierField: 'name', kind: 'MISSING_REQUIRED' }));
  });

  it('allows optional fields to remain unmapped', () => {
    const result = validateSupplierBoardMapping(board, [{ supplierField: 'name', mondayColumnId: 'name' }]);
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ supplierField: 'email', kind: 'UNMAPPED' }));
  });

  it('warns when a mapped column type is potentially incompatible', () => {
    expect(getMappingCompatibility('rating', 'date')).toBe('WARNING');
    const result = validateSupplierBoardMapping(board, [
      { supplierField: 'name', mondayColumnId: 'name' },
      { supplierField: 'rating', mondayColumnId: 'date' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ supplierField: 'rating', kind: 'WARNING' }));
  });

  it('accepts compatible name, email and rating mappings', () => {
    const mappings: SupplierFieldMapping[] = [
      { supplierField: 'name', mondayColumnId: 'name' },
      { supplierField: 'email', mondayColumnId: 'email' },
      { supplierField: 'rating', mondayColumnId: 'rating' },
    ];
    expect(validateSupplierBoardMapping(board, mappings).valid).toBe(true);
  });

  it('previews normalized supplier values from mapped board rows', () => {
    const preview = previewMappedSuppliers(board, [
      { supplierField: 'name', mondayColumnId: 'name' },
      { supplierField: 'email', mondayColumnId: 'email' },
      { supplierField: 'rating', mondayColumnId: 'rating' },
    ]);
    expect(preview).toEqual([{ mondayItemId: 'item-1', name: 'Acme Materials', email: 'sales@acme.example', rating: 4 }]);
  });
});
