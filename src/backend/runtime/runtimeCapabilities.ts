import type { AppFeatureObjectContext } from './mondayRuntime';

export interface RuntimeCapabilities {
  canViewSuppliers: boolean;
  canEditAriavelSuppliers: boolean;
  canConfigureSupplierSource: boolean;
}

export function deriveCapabilities(context: AppFeatureObjectContext): RuntimeCapabilities {
  const { user } = context;
  const canView = !user.isGuest;
  const canEdit = !user.isGuest && !user.isViewOnly;
  const canConfigure = user.isAdmin;
  return {
    canViewSuppliers: canView,
    canEditAriavelSuppliers: canEdit,
    canConfigureSupplierSource: canConfigure,
  };
}

export const fullCapabilities: RuntimeCapabilities = {
  canViewSuppliers: true,
  canEditAriavelSuppliers: true,
  canConfigureSupplierSource: true,
};
