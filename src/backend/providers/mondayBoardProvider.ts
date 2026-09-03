import type { MondayBoardDescriptor, MondayItemDescriptor } from '../../shared/types/domain';

export interface MondayBoardProvider {
  listBoards(): Promise<MondayBoardDescriptor[]>;
  getBoard(boardId: string): Promise<MondayBoardDescriptor | undefined>;
  listBoardItems?(boardId: string, cursor?: string): Promise<{ items: MondayItemDescriptor[]; nextCursor: string | null }>;
}
