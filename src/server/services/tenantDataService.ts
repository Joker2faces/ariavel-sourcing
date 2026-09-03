import type { Db } from 'mongodb';
import type { AuditRepository } from '../db/auditRepository.js';

// Every tenant-scoped collection except audit_events, which is deliberately
// preserved through a deletion (see deleteTenantData below).
const TENANT_SCOPED_COLLECTIONS = [
  'supplier_invitations',
  'supplier_quotes',
  'comparison_snapshots',
  'award_scenarios',
  'attachments',
  'tenantSettings',
] as const;

// Fields never safe to export, even to the buyer who owns the data.
const EXCLUDED_FIELDS = { _id: 0, tokenHash: 0 } as const;

export interface TenantDataService {
  /** Buyer-facing self-service export of everything Ariavel stores for this tenant. */
  exportTenantData(tenantId: string, userId: string, now: string): Promise<Record<string, unknown[]>>;
  /**
   * Permanently deletes every Ariavel-owned record for this tenant (invitations,
   * quotes, comparisons, awards, attachment metadata, settings). Audit events are
   * deliberately NOT deleted — they are the compliance record that this deletion
   * happened, and retaining a minimal accountability trail after erasure is
   * standard practice (the audit metadata itself never contains personal data
   * beyond names/emails already visible elsewhere in the export).
   * Never touches monday.com boards/items — those are the customer's own data.
   */
  deleteTenantData(tenantId: string, userId: string, now: string): Promise<Record<string, number>>;
}

export function createTenantDataService(db: Db, auditRepo: AuditRepository): TenantDataService {
  return {
    async exportTenantData(tenantId, userId, now) {
      const result: Record<string, unknown[]> = {};
      for (const name of TENANT_SCOPED_COLLECTIONS) {
        result[name] = await db.collection(name).find({ tenantId }, { projection: EXCLUDED_FIELDS }).toArray();
      }
      result['audit_events'] = await db.collection('audit_events').find({ tenantId }, { projection: { _id: 0 } }).toArray();
      await auditRepo.log(tenantId, 'TENANT_DATA_EXPORTED', tenantId, 'tenant', 'buyer', userId, now);
      return result;
    },

    async deleteTenantData(tenantId, userId, now) {
      const counts: Record<string, number> = {};
      for (const name of TENANT_SCOPED_COLLECTIONS) {
        const res = await db.collection(name).deleteMany({ tenantId });
        counts[name] = res.deletedCount ?? 0;
      }
      await auditRepo.log(tenantId, 'TENANT_DATA_DELETED', tenantId, 'tenant', 'buyer', userId, now, undefined, {
        deletedCollections: Object.keys(counts).length,
      });
      return counts;
    },
  };
}
