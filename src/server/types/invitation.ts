export type InvitationStatus = 'CREATED' | 'OPENED' | 'SUBMITTED' | 'EXPIRED' | 'REVOKED';

export interface SupplierInvitation {
  id: string;
  tenantId: string;
  eventId: string;
  eventReference: string;
  eventTitleSnapshot: string;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string;
  supplierCodeSnapshot?: string;
  tokenHash: string;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  openedAt?: string;
  submittedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedByUserId?: string;
  regeneratedAt?: string;
  regeneratedByUserId?: string;
}

export interface InvitationInput {
  eventId: string;
  eventReference: string;
  eventTitleSnapshot: string;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string;
  supplierCodeSnapshot?: string;
  expiresAt?: string;
}

export interface InvitationPublicDTO {
  id: string;
  eventReference: string;
  eventTitle: string;
  supplierName: string;
  status: InvitationStatus;
  expiresAt?: string;
  submittedAt?: string;
}
