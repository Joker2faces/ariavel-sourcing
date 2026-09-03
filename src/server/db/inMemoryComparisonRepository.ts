import type { ComparisonRepository } from './comparisonRepository.js';
import type { ComparisonSnapshot } from '../../shared/types/bid.js';

export function createInMemoryComparisonRepository(): ComparisonRepository {
  const store = new Map<string, ComparisonSnapshot>();

  return {
    async save(snapshot) {
      store.set(snapshot.id, structuredClone(snapshot));
      return structuredClone(snapshot);
    },

    async getById(tenantId, id) {
      const doc = store.get(id);
      return doc?.tenantId === tenantId ? structuredClone(doc) : null;
    },

    async getLatest(tenantId, eventId) {
      const matches = [...store.values()]
        .filter(s => s.tenantId === tenantId && s.eventId === eventId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return matches[0] ? structuredClone(matches[0]) : null;
    },

    async listForEvent(tenantId, eventId) {
      return [...store.values()]
        .filter(s => s.tenantId === tenantId && s.eventId === eventId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(s => structuredClone(s));
    },
  };
}
