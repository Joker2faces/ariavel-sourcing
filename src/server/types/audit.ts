export type AuditAction =
  | 'INVITATION_CREATED'
  | 'INVITATION_OPENED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_REGENERATED'
  | 'INVITATION_EXPIRED'
  | 'QUOTE_DRAFT_SAVED'
  | 'QUOTE_SUBMITTED';

export interface AuditEvent {
  id: string;
  tenantId: string;
  action: AuditAction;
  entityId: string;
  entityType: 'invitation' | 'quote';
  actorType: 'buyer' | 'supplier';
  actorId: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}
