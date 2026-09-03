// EntitlementService — feature gate abstraction for Ariavel Sourcing
// In development and during marketplace review: ALL features are enabled.
// Future: derive from monday billing plan or seat count via monday SDK.

export type FeatureKey =
  | 'supplier_master'
  | 'sourcing_events'
  | 'supplier_invitations'
  | 'supplier_portal'
  | 'bid_comparison'
  | 'fx_normalization'
  | 'award_workspace'
  | 'document_attachments'
  | 'excel_import'
  | 'ai_extraction'
  | 'advanced_analytics'
  | 'multi_tenant_isolation'
  | 'audit_log';

export interface EntitlementService {
  isEnabled(feature: FeatureKey): boolean;
  getEnabledFeatures(): FeatureKey[];
}

const ALL_FEATURES: FeatureKey[] = [
  'supplier_master',
  'sourcing_events',
  'supplier_invitations',
  'supplier_portal',
  'bid_comparison',
  'fx_normalization',
  'award_workspace',
  'document_attachments',
  'excel_import',
  'ai_extraction',
  'advanced_analytics',
  'multi_tenant_isolation',
  'audit_log',
];

export const developmentEntitlementService: EntitlementService = {
  isEnabled(_feature: FeatureKey): boolean {
    return true; // All features enabled in development
  },
  getEnabledFeatures(): FeatureKey[] {
    return [...ALL_FEATURES];
  },
};

export function createPlanBasedEntitlementService(enabledFeatures: FeatureKey[]): EntitlementService {
  const featureSet = new Set(enabledFeatures);
  return {
    isEnabled(feature: FeatureKey): boolean {
      return featureSet.has(feature);
    },
    getEnabledFeatures(): FeatureKey[] {
      return enabledFeatures.filter(f => featureSet.has(f));
    },
  };
}
