import type { MondayBoardDescriptor } from '../../shared/types/domain';

export interface MondayBoardProvider {
  listBoards(): Promise<MondayBoardDescriptor[]>;
  getBoard(boardId: string): Promise<MondayBoardDescriptor | undefined>;
}
