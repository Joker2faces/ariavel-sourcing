import type { MondayBoardDescriptor } from '../../shared/types/domain';
import type { MondayBoardProvider } from './mondayBoardProvider';

const boards: MondayBoardDescriptor[] = [{
  id: 'mock-board-suppliers', name: 'Global Supplier Directory',
  columns: [
    { id: 'name', title: 'Name', type: 'name' }, { id: 'supplier_code', title: 'Supplier Code', type: 'text' },
    { id: 'supplier_email', title: 'Supplier Email', type: 'email' }, { id: 'contact', title: 'Contact Person', type: 'people' },
    { id: 'category', title: 'Category', type: 'dropdown' }, { id: 'country', title: 'Country', type: 'country' },
    { id: 'currency', title: 'Currency', type: 'dropdown' }, { id: 'payment_terms', title: 'Payment Terms', type: 'text' },
    { id: 'status', title: 'Status', type: 'status' }, { id: 'rating', title: 'Rating', type: 'rating' },
    { id: 'phone', title: 'Phone', type: 'phone' }, { id: 'onboarded', title: 'Onboarded', type: 'date' },
  ],
  sampleItems: [
    { id: 'mock-item-1', name: 'Acme Materials', columnValues: { supplier_code: 'AC-100', supplier_email: 'sales@acme.example', contact: 'Maya Patel', category: 'Raw Materials', country: 'Germany', currency: 'EUR', payment_terms: '30 days', status: 'Active', rating: 4, phone: '+49 30 555 0101' } },
    { id: 'mock-item-2', name: 'NorthStar Packaging', columnValues: { supplier_code: 'NS-220', supplier_email: 'quotes@northstar.example', contact: 'Elena Petrova', category: 'Packaging', country: 'Bulgaria', currency: 'EUR', payment_terms: '60 days', status: 'Pending', rating: 5, phone: '+359 2 555 0102' } },
  ],
}];

const copyBoard = (board: MondayBoardDescriptor): MondayBoardDescriptor => ({ ...board, columns: board.columns.map(column => ({ ...column })), sampleItems: board.sampleItems.map(item => ({ ...item, columnValues: { ...item.columnValues } })) });
export const mockMondayBoardProvider: MondayBoardProvider = {
  async listBoards() { return boards.map(copyBoard); },
  async getBoard(boardId) { const board = boards.find(candidate => candidate.id === boardId); return board ? copyBoard(board) : undefined; },
};
