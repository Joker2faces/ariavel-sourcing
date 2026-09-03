export type InvitationStatus = 'CREATED' | 'OPENED' | 'SUBMITTED' | 'EXPIRED' | 'REVOKED';

// A point-in-time copy of the RFQ line items, taken when the invitation is
// sent. The supplier portal has no access to the buyer's live sourcing
// event (it authenticates by token, not a monday session), so this snapshot
// is the only way it can know what it's being asked to quote against.
export interface RfqLineSnapshot {
  lineId: string;
  description: string;
  quantity: number;
  unit: string;
  specification?: string;
}

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
  linesSnapshot?: RfqLineSnapshot[];
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
  linesSnapshot?: RfqLineSnapshot[];
  expiresAt?: string;
}

export interface InvitationPublicDTO {
  id: string;
  eventReference: string;
  eventTitle: string;
  supplierName: string;
  lines: RfqLineSnapshot[];
  status: InvitationStatus;
  expiresAt?: string;
  submittedAt?: string;
}
