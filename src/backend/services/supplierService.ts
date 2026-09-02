import { previewMappedSuppliers, validateSupplierBoardMapping } from '../../shared/mapping/supplierMapping';
import type { MondayBoardDescriptor, SupplierFieldMapping, SupplierInput, SupplierSourceConfiguration, SupplierStatus } from '../../shared/types/domain';
import { validateSupplierInput, type SupplierValidationErrors } from '../../shared/validation/supplierValidation';
import type { MondayBoardProvider } from '../providers/mondayBoardProvider';
import type { SupplierRepository } from '../repositories/supplierRepository';
import type { TenantContextProvider } from '../tenancy/tenantContext';

export class SupplierValidationError extends Error {
  constructor(public readonly errors: SupplierValidationErrors) { super(`Supplier validation failed: ${Object.values(errors).join(' ')}`); this.name = 'SupplierValidationError'; }
}
export interface SupplierFilters { search?: string; status?: SupplierStatus | ''; category?: string; country?: string; }

export function createSupplierService(repository: SupplierRepository, tenantProvider: TenantContextProvider, boardProvider: MondayBoardProvider) {
  const tenant = () => tenantProvider.getTenantContext();
  const validated = (input: SupplierInput) => { const result = validateSupplierInput(input); if (!result.valid) throw new SupplierValidationError(result.errors); return result.value; };
  return {
    async list(filters: SupplierFilters = {}) {
      const query = filters.search?.trim().toLowerCase() ?? '';
      return (await repository.listForTenant(tenant())).filter(supplier => {
        const searchable = [supplier.name, supplier.supplierCode, supplier.primaryContactName, supplier.email, supplier.category].filter(Boolean).join(' ').toLowerCase();
        return (!query || searchable.includes(query)) && (!filters.status || supplier.status === filters.status) && (!filters.category || supplier.category === filters.category) && (!filters.country || supplier.country === filters.country);
      });
    },
    get: (id: string) => repository.getForTenant(tenant(), id),
    async create(input: SupplierInput) { return repository.createForTenant(tenant(), validated(input)); },
    async update(id: string, input: SupplierInput) { return repository.updateForTenant(tenant(), id, validated(input)); },
    changeStatus: (id: string, status: SupplierStatus) => repository.changeStatusForTenant(tenant(), id, status),
    async getSummary() {
      const suppliers = await repository.listForTenant(tenant());
      return { total: suppliers.length, active: suppliers.filter(supplier => supplier.status === 'ACTIVE').length, preferred: suppliers.filter(supplier => supplier.preferred).length, incomplete: suppliers.filter(supplier => !supplier.category || !supplier.country || !supplier.email || !supplier.primaryContactName).length };
    },
    listBoards: () => boardProvider.listBoards(),
    getBoard: (id: string) => boardProvider.getBoard(id),
    validateBoardMapping: (board: MondayBoardDescriptor, mappings: SupplierFieldMapping[]) => validateSupplierBoardMapping(board, mappings),
    previewBoardMapping: (board: MondayBoardDescriptor, mappings: SupplierFieldMapping[]) => previewMappedSuppliers(board, mappings),
    getSourceConfiguration: () => repository.getSourceConfiguration(tenant()),
    saveSourceConfiguration(configuration: SupplierSourceConfiguration) {
      if (configuration.mode === 'MONDAY_BOARD') {
        return boardProvider.getBoard(configuration.boardMapping.boardId).then(board => {
          if (!board || !validateSupplierBoardMapping(board, configuration.boardMapping.fieldMappings).valid) throw new Error('Supplier Name must be mapped before saving.');
          return repository.saveSourceConfiguration(tenant(), configuration);
        });
      }
      return repository.saveSourceConfiguration(tenant(), configuration);
    },
  };
}

export type SupplierService = ReturnType<typeof createSupplierService>;
