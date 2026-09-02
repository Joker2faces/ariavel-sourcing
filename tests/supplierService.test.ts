import { describe, expect, it } from 'vitest';
import { createInMemorySupplierRepository } from '../src/backend/repositories/inMemorySupplierRepository';
import { createSupplierService } from '../src/backend/services/supplierService';
import type { MondayBoardDescriptor, Supplier, SupplierInput } from '../src/shared/types/domain';

const tenantProvider = { getTenantContext: () => ({ tenantId: 'tenant-a' }) };
const board: MondayBoardDescriptor = { id: 'board-1', name: 'Supplier Directory', columns: [{ id: 'name', title: 'Name', type: 'name' }], sampleItems: [] };
const boardProvider = { listBoards: async () => [board], getBoard: async (id: string) => id === board.id ? board : undefined };
const base: SupplierInput = { name: 'Acme Materials', status: 'ACTIVE', category: 'Raw Materials', country: 'Germany', email: 'sales@acme.example', preferred: true, sourceType: 'ARIAVEL' };
const suppliers: Supplier[] = [
  { ...base, id: 's1', tenantId: 'tenant-a', createdAt: '2026-09-01', updatedAt: '2026-09-01' },
  { ...base, id: 's2', name: 'NorthStar Packaging', supplierCode: 'NS-20', status: 'PENDING', category: 'Packaging', country: 'Bulgaria', email: 'quotes@northstar.example', preferred: false, tenantId: 'tenant-a', createdAt: '2026-09-01', updatedAt: '2026-09-01' },
];

function service() {
  return createSupplierService(createInMemorySupplierRepository(suppliers), tenantProvider, boardProvider);
}

describe('supplier service', () => {
  it('searches normalized supplier name, code, contact, email and category fields', async () => {
    expect((await service().list({ search: '  ns-20 ' })).map(record => record.id)).toEqual(['s2']);
    expect((await service().list({ search: 'RAW materials' })).map(record => record.id)).toEqual(['s1']);
  });

  it('combines status, category and country filters', async () => {
    expect((await service().list({ status: 'PENDING', category: 'Packaging', country: 'Bulgaria' })).map(record => record.id)).toEqual(['s2']);
    expect(await service().list({ status: 'ACTIVE', country: 'Bulgaria' })).toEqual([]);
  });

  it('computes meaningful supplier summary metrics', async () => {
    expect(await service().getSummary()).toEqual({ total: 2, active: 1, preferred: 1, incomplete: 2 });
  });

  it('normalizes and validates supplier creation', async () => {
    const created = await service().create({ ...base, name: '  Alloy Works  ', currency: ' usd ' });
    expect(created).toEqual(expect.objectContaining({ name: 'Alloy Works', currency: 'USD', tenantId: 'tenant-a' }));
    await expect(service().create({ ...base, name: ' ' })).rejects.toMatchObject({ name: 'SupplierValidationError' });
  });

  it('updates supplier data and status through tenant-scoped operations', async () => {
    expect((await service().update('s1', { ...base, name: 'Acme Updated' })).name).toBe('Acme Updated');
    expect((await service().changeStatus('s1', 'INACTIVE')).status).toBe('INACTIVE');
  });

  it('exposes normalized board providers and validates source mapping', async () => {
    expect(await service().listBoards()).toEqual([board]);
    expect(service().validateBoardMapping(board, [{ supplierField: 'email', mondayColumnId: 'name' }]).valid).toBe(false);
    expect(service().validateBoardMapping(board, [{ supplierField: 'name', mondayColumnId: 'name' }]).valid).toBe(true);
  });
});
