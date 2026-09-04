import { describe, expect, it, vi } from 'vitest';
import { createMondayApiBoardProvider } from '../src/backend/providers/mondayApiBoardProvider';
import type { MondayRuntimeAdapter } from '../src/backend/runtime/mondayRuntime';
import { RuntimeMode } from '../src/backend/runtime/mondayRuntime';

function makeRuntime(apiResponses: Record<string, unknown> = {}): MondayRuntimeAdapter {
  return {
    mode: RuntimeMode.MONDAY,
    getContext: vi.fn(),
    getSessionToken: vi.fn(),
    listenContext: vi.fn(() => () => {}),
    api: vi.fn().mockImplementation((query: string) => {
      if (query.includes('ListBoards')) return Promise.resolve(apiResponses['listBoards'] ?? { data: { boards: [] } });
      if (query.includes('BoardColumns')) return Promise.resolve(apiResponses['boardColumns'] ?? { data: { boards: [] } });
      if (query.includes('BoardItemsPage')) return Promise.resolve(apiResponses['itemsPage'] ?? { data: { boards: [] } });
      return Promise.resolve({ data: {} });
    }),
    storage: {
      getItem: vi.fn().mockResolvedValue({ success: true, value: null }),
      setItem: vi.fn().mockResolvedValue({ success: true, version: 'v1' }),
      deleteItem: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const MOCK_LIST_RESPONSE = {
  data: {
    boards: [
      { id: '111', name: 'Global Suppliers', state: 'active', board_kind: 'public' },
      { id: '222', name: 'Partner Vendors', state: 'active', board_kind: 'private' },
    ],
  },
};

const MOCK_COLUMNS_RESPONSE = {
  data: {
    boards: [{
      id: '111',
      name: 'Global Suppliers',
      columns: [
        { id: 'name', title: 'Name', type: 'name' },
        { id: 'email_col', title: 'Email', type: 'email' },
        { id: 'country_col', title: 'Country', type: 'country' },
      ],
    }],
  },
};

const MOCK_ITEMS_PAGE_RESPONSE = {
  data: {
    boards: [{
      items_page: {
        cursor: null,
        items: [
          { id: 'item1', name: 'Acme Corp', column_values: [{ id: 'email_col', text: 'acme@example.com' }] },
          { id: 'item2', name: 'NorthStar', column_values: [{ id: 'email_col', text: null }] },
        ],
      },
    }],
  },
};

describe('MondayApiBoardProvider.listBoards', () => {
  it('normalizes board list from API response', async () => {
    const provider = createMondayApiBoardProvider(makeRuntime({ listBoards: MOCK_LIST_RESPONSE }));
    const boards = await provider.listBoards();
    expect(boards).toHaveLength(2);
    expect(boards[0].id).toBe('111');
    expect(boards[0].name).toBe('Global Suppliers');
    expect(boards[0].columns).toHaveLength(0);
  });

  it('returns empty array when no boards', async () => {
    const provider = createMondayApiBoardProvider(makeRuntime());
    expect(await provider.listBoards()).toHaveLength(0);
  });

  it('handles API error gracefully by propagating', async () => {
    const runtime = makeRuntime();
    (runtime.api as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
    const provider = createMondayApiBoardProvider(runtime);
    await expect(provider.listBoards()).rejects.toThrow('API error');
  });
});

describe('MondayApiBoardProvider.getBoard', () => {
  it('returns normalized board with columns and sample items', async () => {
    const runtime = makeRuntime({
      boardColumns: MOCK_COLUMNS_RESPONSE,
      itemsPage: MOCK_ITEMS_PAGE_RESPONSE,
    });
    const provider = createMondayApiBoardProvider(runtime);
    const board = await provider.getBoard('111');
    expect(board?.id).toBe('111');
    expect(board?.name).toBe('Global Suppliers');
    expect(board?.columns).toHaveLength(3);
    expect(board?.columns[0]).toEqual({ id: 'name', title: 'Name', type: 'name' });
    expect(board?.sampleItems).toHaveLength(2);
    expect(board?.sampleItems[0].name).toBe('Acme Corp');
    expect(board?.sampleItems[0].columnValues['email_col']).toBe('acme@example.com');
  });

  it('returns undefined for unknown board', async () => {
    const provider = createMondayApiBoardProvider(makeRuntime({ boardColumns: { data: { boards: [] } } }));
    expect(await provider.getBoard('nonexistent')).toBeUndefined();
  });
});

describe('MondayApiBoardProvider.listBoardItems', () => {
  it('returns normalized items with column text values', async () => {
    const runtime = makeRuntime({ itemsPage: MOCK_ITEMS_PAGE_RESPONSE });
    const provider = createMondayApiBoardProvider(runtime);
    const { items, nextCursor } = await provider.listBoardItems('111');
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('item1');
    expect(items[0].name).toBe('Acme Corp');
    expect(items[0].columnValues['email_col']).toBe('acme@example.com');
    expect(items[1].columnValues['email_col']).toBeNull();
    expect(nextCursor).toBeNull();
  });

  it('passes cursor for subsequent pages', async () => {
    const page1 = { data: { boards: [{ items_page: { cursor: 'cursor-abc', items: [{ id: 'i1', name: 'A', column_values: [] }] } }] } };
    const runtime = makeRuntime({ itemsPage: page1 });
    const provider = createMondayApiBoardProvider(runtime);
    const { items, nextCursor } = await provider.listBoardItems('111');
    expect(nextCursor).toBe('cursor-abc');
    expect(items).toHaveLength(1);
  });

  it('returns empty when board not found', async () => {
    const provider = createMondayApiBoardProvider(makeRuntime({ itemsPage: { data: { boards: [] } } }));
    const { items, nextCursor } = await provider.listBoardItems('111');
    expect(items).toHaveLength(0);
    expect(nextCursor).toBeNull();
  });
});
