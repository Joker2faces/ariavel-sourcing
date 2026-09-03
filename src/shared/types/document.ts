// M8 Documents & Quote Ingestion domain types

export type AttachmentEntityType = 'event' | 'quote';
export type AttachmentStatus = 'PENDING_UPLOAD' | 'READY' | 'ERROR' | 'DELETED';

export interface Attachment {
  id: string;
  tenantId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  /** monday Object Storage object key (generated, never from user input) */
  objectKey: string;
  /** Original filename (sanitized) */
  filename: string;
  /** MIME type as declared by uploader — verified server-side */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  status: AttachmentStatus;
  uploadedByUserId: string;
  uploadedAt: string;
  deletedAt?: string;
}

export interface AttachmentInput {
  entityType: AttachmentEntityType;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignedUploadResponse {
  attachmentId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

// ── Excel Quote Ingestion ─────────────────────────────────────────────────────

export type ExcelImportStatus = 'PENDING' | 'VALID' | 'ERROR';

export interface ExcelImportRow {
  lineId: string;
  unitPrice?: number;
  currency?: string;
  leadTimeDays?: number;
  moq?: number;
  notes?: string;
}

export interface ExcelImportResult {
  status: ExcelImportStatus;
  rows: ExcelImportRow[];
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; field: string; message: string }>;
  rfqReference?: string;
  invitationId?: string;
}

// ── Document Extraction (AI seam) ─────────────────────────────────────────────

export interface DocumentExtractionResult {
  extractedLines: ExcelImportRow[];
  confidence: number; // 0–1
  rawText?: string;
  provider: string;
}

export interface DocumentExtractionProvider {
  readonly name: string;
  readonly isEnabled: boolean;
  extract(objectKey: string, filename: string, mimeType: string): Promise<DocumentExtractionResult>;
}
