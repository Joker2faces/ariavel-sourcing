import type { SourcingRepository } from '../repositories/sourcingRepository';

export function createSourcingService(repository: SourcingRepository) {
  return { listRecentEvents: () => repository.listRecentEvents() };
}
