import type { SourcingEvent } from '../../shared/types/domain';

export interface SourcingRepository { listRecentEvents(): Promise<SourcingEvent[]>; }
