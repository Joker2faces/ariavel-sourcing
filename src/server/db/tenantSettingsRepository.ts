import type { Db, ObjectId } from 'mongodb';
import type { TenantSettings } from '../../shared/types/tenantSettings.js';
import { stageLog, safeError } from '../observability/stageLog.js';

const COLLECTION = 'tenantSettings';

type WithMongoId = { _id?: ObjectId };

function strip<T extends WithMongoId>(doc: T): Omit<T, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Omit<T, '_id'>;
}

export interface TenantSettingsRepository {
  get(tenantId: string): Promise<TenantSettings | null>;
  /**
   * Replaces the settings document, but only if the stored version still
   * matches `expectedVersion` (or no document exists yet and expectedVersion
   * is 0) — otherwise returns null so the caller can surface a 409 conflict
   * instead of silently overwriting a concurrent edit.
   */
  setWithVersion(settings: TenantSettings, expectedVersion: number): Promise<TenantSettings | null>;
}

export function createTenantSettingsRepository(db: Db): TenantSettingsRepository {
  const col = db.collection<TenantSettings & WithMongoId>(COLLECTION);

  return {
    async get(tenantId) {
      const startedAt = Date.now();
      stageLog('log', 'SETTINGS_REPO_GET_START', { tenantId });
      try {
        const doc = await col.findOne({ tenantId });
        stageLog('log', 'SETTINGS_REPO_GET_SUCCESS', { tenantId, found: Boolean(doc), durationMs: Date.now() - startedAt });
        return doc ? (strip(doc) as TenantSettings) : null;
      } catch (err) {
        stageLog('error', 'SETTINGS_REPO_GET_ERROR', { tenantId, durationMs: Date.now() - startedAt, ...safeError(err) });
        throw err;
      }
    },

    async setWithVersion(settings, expectedVersion) {
      if (expectedVersion === 0) {
        const result = await col.updateOne(
          { tenantId: settings.tenantId },
          { $setOnInsert: settings },
          { upsert: true },
        );
        if (result.upsertedCount === 0) return null; // document already existed — not a fresh create
        return settings;
      }
      const result = await col.replaceOne(
        { tenantId: settings.tenantId, version: expectedVersion },
        settings,
      );
      return result.matchedCount === 1 ? settings : null;
    },
  };
}
