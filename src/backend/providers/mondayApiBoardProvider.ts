import type { MondayBoardDescriptor, MondayColumnDescriptor, MondayItemDescriptor } from '../../shared/types/domain';
import type { MondayRuntimeAdapter } from '../runtime/mondayRuntime';
import type { MondayBoardProvider } from './mondayBoardProvider';

const BOARD_LIST_QUERY = `
  query ListBoards {
    boards(state: active, limit: 100, order_by: created_at) {
      id
      name
      state
      board_kind
    }
  }
`;

const BOARD_COLUMNS_QUERY = `
  query BoardColumns($boardId: ID!) {
    boards(ids: [$boardId]) {
      id
      name
      columns {
        id
        title
        type
      }
    }
  }
`;

const BOARD_ITEMS_PAGE_QUERY = `
  query BoardItemsPage($boardId: ID!, $limit: Int!, $cursor: String) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
          }
        }
      }
    }
  }
`;

interface RawBoard { id: string; name: string; }
interface RawColumn { id: string; title: string; type: string; }
interface RawColumnValue { id: string; text: string | null; }
interface RawItem { id: string; name: string; column_values: RawColumnValue[]; }
interface ItemsPageResult { cursor: string | null; items: RawItem[]; }

const ITEMS_PAGE_SIZE = 500;
const SAMPLE_ITEM_COUNT = 5;

function normalizeItem(raw: RawItem): MondayItemDescriptor {
  const columnValues: Record<string, string | null> = {};
  for (const cv of raw.column_values) {
    columnValues[cv.id] = cv.text ?? null;
  }
  return { id: String(raw.id), name: raw.name, columnValues };
}

function normalizeColumn(raw: RawColumn): MondayColumnDescriptor {
  return { id: raw.id, title: raw.title, type: raw.type };
}

export interface MondayApiBoardProvider extends MondayBoardProvider {
  listBoardItems(boardId: string, cursor?: string): Promise<{ items: MondayItemDescriptor[]; nextCursor: string | null }>;
}

export function createMondayApiBoardProvider(runtime: MondayRuntimeAdapter): MondayApiBoardProvider {
  return {
    async listBoards(): Promise<MondayBoardDescriptor[]> {
      const result = await runtime.api(BOARD_LIST_QUERY) as { data: { boards: RawBoard[] } };
      const boards = result?.data?.boards ?? [];
      return boards.map(b => ({
        id: String(b.id),
        name: b.name,
        columns: [],
        sampleItems: [],
      }));
    },

    async getBoard(boardId: string): Promise<MondayBoardDescriptor | undefined> {
      const colResult = await runtime.api(BOARD_COLUMNS_QUERY, { boardId: String(boardId) }) as { data: { boards: Array<{ id: string; name: string; columns: RawColumn[] }> } };
      const rawBoard = colResult?.data?.boards?.[0];
      if (!rawBoard) return undefined;

      const columns = (rawBoard.columns ?? []).map(normalizeColumn);

      const itemResult = await runtime.api(BOARD_ITEMS_PAGE_QUERY, { boardId: String(boardId), limit: SAMPLE_ITEM_COUNT }) as {
        data: { boards: Array<{ items_page: ItemsPageResult }> }
      };
      const rawItems = itemResult?.data?.boards?.[0]?.items_page?.items ?? [];
      const sampleItems = rawItems.map(item => ({
        id: String(item.id),
        name: item.name,
        columnValues: Object.fromEntries(item.column_values.map(cv => [cv.id, cv.text ?? null])) as Record<string, string | number | boolean | null>,
      }));

      return {
        id: String(rawBoard.id),
        name: rawBoard.name,
        columns,
        sampleItems,
      };
    },

    async listBoardItems(boardId: string, cursor?: string): Promise<{ items: MondayItemDescriptor[]; nextCursor: string | null }> {
      const variables: Record<string, unknown> = { boardId: String(boardId), limit: ITEMS_PAGE_SIZE };
      if (cursor) variables.cursor = cursor;
      const query = cursor ? BOARD_ITEMS_PAGE_QUERY.replace('query BoardItemsPage', 'query BoardItemsPageCursor') : BOARD_ITEMS_PAGE_QUERY;
      const result = await runtime.api(query, variables) as {
        data: { boards: Array<{ items_page: ItemsPageResult }> }
      };
      const page = result?.data?.boards?.[0]?.items_page;
      if (!page) return { items: [], nextCursor: null };
      return {
        items: page.items.map(normalizeItem),
        nextCursor: page.cursor ?? null,
      };
    },
  };
}
