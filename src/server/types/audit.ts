export type AuditAction =
  | 'INVITATION_CREATED'
  | 'INVITATION_OPENED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_REGENERATED'
  | 'INVITATION_EXPIRED'
  | 'QUOTE_DRAFT_SAVED'
  | 'QUOTE_SUBMITTED'
  | 'AWARD_SCENARIO_CREATED'
  | 'AWARD_LINE_SET'
  | 'AWARD_LINE_CLEARED'
  | 'AWARD_SCENARIO_FINALIZED'
  | 'SETTINGS_UPDATED'
  | 'ATTACHMENT_UPLOADED'
  | 'ATTACHMENT_DELETED'
  | 'ONBOARDING_COMPLETED'
  | 'TENANT_DATA_EXPORTED'
  | 'TENANT_DATA_DELETED';

export interface AuditEvent {
  id: string;
  tenantId: string;
  action: AuditAction;
  entityId: string;
  entityType: 'invitation' | 'quote' | 'award_scenario' | 'settings' | 'attachment' | 'tenant';
  actorType: 'buyer' | 'supplier';
  actorId: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}
