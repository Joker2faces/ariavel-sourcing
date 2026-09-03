// M9+ Tenant Settings — the first durable, tenant-scoped configuration store.
// Previously the Settings UI held everything in local React state and reset on
// every page reload; this is the real persisted shape.

export type FreightAllocationMethod = 'PROPORTIONAL_TO_LINE_VALUE' | 'EQUAL_PER_LINE' | 'MANUAL';

export interface EvaluationWeights {
  landedCost: number;
  leadTime: number;
  completeness: number;
}

export interface TenantSettings {
  tenantId: string;

  organization: {
    companyDisplayName: string;
    supportEmail: string;
    defaultCurrency: string;
  };

  sourcing: {
    defaultRfqDeadlineDays: number;
    invitationExpiryDays: number;
    defaultIncoterm: string;
    defaultPaymentTerms: string;
    requireTargetPrice: boolean;
    autoCloseAtDeadline: boolean;
  };

  comparison: {
    baseCurrency: string;
    freightAllocationMethod: FreightAllocationMethod;
    closingSoonDays: number;
    weights: EvaluationWeights;
  };

  security: {
    allowSupplierDrafts: boolean;
    submittedQuoteReopenPolicy: 'NEVER' | 'BUYER_APPROVAL_REQUIRED';
  };

  /** Set once the buyer completes the first-run onboarding wizard for this tenant. */
  onboardingCompletedAt?: string;

  /** Incremented on every write; used for optimistic-concurrency conflict detection. */
  version: number;
  updatedAt: string;
  updatedByUserId?: string;
}

export type TenantSettingsInput = Partial<{
  organization: Partial<TenantSettings['organization']>;
  sourcing: Partial<TenantSettings['sourcing']>;
  comparison: Partial<Omit<TenantSettings['comparison'], 'weights'>> & { weights?: Partial<EvaluationWeights> };
  security: Partial<TenantSettings['security']>;
  onboardingCompletedAt: string;
}>;

export function defaultTenantSettings(tenantId: string, now: string): TenantSettings {
  return {
    tenantId,
    organization: {
      companyDisplayName: '',
      supportEmail: '',
      defaultCurrency: 'EUR',
    },
    sourcing: {
      defaultRfqDeadlineDays: 30,
      invitationExpiryDays: 14,
      defaultIncoterm: 'DAP',
      defaultPaymentTerms: 'Net 30',
      requireTargetPrice: false,
      autoCloseAtDeadline: false,
    },
    comparison: {
      baseCurrency: 'EUR',
      freightAllocationMethod: 'PROPORTIONAL_TO_LINE_VALUE',
      closingSoonDays: 3,
      weights: { landedCost: 60, leadTime: 20, completeness: 20 },
    },
    security: {
      allowSupplierDrafts: true,
      submittedQuoteReopenPolicy: 'NEVER',
    },
    version: 0,
    updatedAt: now,
  };
}
