// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createDocumentService, validateMimeType, sanitizeFilename, AttachmentValidationError } from '../src/server/services/documentService';
import { createInMemoryAttachmentRepository } from '../src/server/db/inMemoryAttachmentRepository';
import { createInMemoryInvitationRepository } from '../src/server/db/inMemoryInvitationRepository';
import { generateQuoteTemplateCsv, parseQuoteImportCsv } from '../src/server/documents/excelUtils';
import type { SourcingLine } from '../src/shared/types/domain';

const TENANT = 'monday-account-9999';
const NOW = '2026-09-03T10:00:00.000Z';
const USER_ID = 'user-1';
const EVENT_ID = 'event-abc';
const INV_ID = 'inv-123';

const EVENT_LINES: SourcingLine[] = [
  { id: 'line-1', description: 'Widget A', sku: 'W-001', quantity: 1000, unit: 'pcs' },
  { id: 'line-2', description: 'Gadget B', sku: 'G-002', quantity: 500, unit: 'kg' },
];

function buildService() {
  const attachmentRepo = createInMemoryAttachmentRepository();
  const invRepo = createInMemoryInvitationRepository([]);
  return createDocumentService(attachmentRepo, invRepo);
}

describe('validateMimeType', () => {
  it('accepts allowed MIME types', () => {
    expect(() => validateMimeType('report.pdf', 'application/pdf')).not.toThrow();
    expect(() => validateMimeType('data.csv', 'text/csv')).not.toThrow();
    expect(() => validateMimeType('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).not.toThrow();
  });

  it('rejects disallowed MIME types', () => {
    expect(() => validateMimeType('script.js', 'text/javascript')).toThrow(AttachmentValidationError);
    expect(() => validateMimeType('app.exe', 'application/octet-stream')).toThrow(AttachmentValidationError);
  });

  it('rejects dangerous extensions regardless of MIME type', () => {
    expect(() => validateMimeType('evil.exe', 'application/pdf')).toThrow(AttachmentValidationError);
    expect(() => validateMimeType('script.sh', 'text/plain')).toThrow(AttachmentValidationError);
    expect(() => validateMimeType('payload.php', 'text/csv')).toThrow(AttachmentValidationError);
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators and leading dots', () => {
    // Slashes removed first, then leading dots stripped → 'etcpasswd'
    expect(sanitizeFilename('../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFilename('C:\\Windows\\evil')).toBe('C:Windowsevil');
  });

  it('strips leading dots', () => {
    expect(sanitizeFilename('....hidden')).toBe('hidden');
  });

  it('preserves normal filenames', () => {
    expect(sanitizeFilename('quote-2026-01.csv')).toBe('quote-2026-01.csv');
  });
});

describe('DocumentService — initiateUpload', () => {
  it('creates attachment and returns presigned upload response', async () => {
    const svc = buildService();
    const result = await svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'spec.pdf', mimeType: 'application/pdf', sizeBytes: 1024,
    }, USER_ID, NOW);

    expect(result.attachmentId).toBeDefined();
    expect(result.objectKey).toContain(TENANT);
    expect(result.objectKey).toContain('event');
    expect(result.uploadUrl).toContain('object-storage.monday.com');
  });

  it('rejects files exceeding 25MB', async () => {
    const svc = buildService();
    await expect(svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: 26 * 1024 * 1024,
    }, USER_ID, NOW)).rejects.toThrow('exceeds maximum');
  });

  it('rejects disallowed MIME type', async () => {
    const svc = buildService();
    await expect(svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'evil.bat', mimeType: 'application/x-bat', sizeBytes: 100,
    }, USER_ID, NOW)).rejects.toThrow(AttachmentValidationError);
  });

  it('generated object key never contains user-controlled filename directly', async () => {
    const svc = buildService();
    const result = await svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: '../../../etc/passwd', mimeType: 'text/plain', sizeBytes: 100,
    }, USER_ID, NOW);
    // Object key should not contain path traversal
    expect(result.objectKey).not.toContain('../');
    expect(result.objectKey).not.toContain('etc/passwd');
  });
});

describe('DocumentService — confirmUpload', () => {
  it('updates status to READY', async () => {
    const svc = buildService();
    const { attachmentId } = await svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 1024,
    }, USER_ID, NOW);

    const confirmed = await svc.confirmUpload(TENANT, attachmentId);
    expect(confirmed.status).toBe('READY');
  });
});

describe('DocumentService — listAttachments', () => {
  it('returns attachments for entity, excludes DELETED', async () => {
    const svc = buildService();
    const { attachmentId: id1 } = await svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 100,
    }, USER_ID, NOW);
    await svc.confirmUpload(TENANT, id1);
    const { attachmentId: id2 } = await svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 100,
    }, USER_ID, NOW);
    await svc.confirmUpload(TENANT, id2);
    await svc.deleteAttachment(TENANT, id2, USER_ID, NOW);

    const list = await svc.listAttachments(TENANT, 'event', EVENT_ID);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id1);
  });
});

describe('Excel template generation', () => {
  it('generates CSV with metadata headers and line rows', () => {
    const csv = generateQuoteTemplateCsv('RFQ-001', INV_ID, EVENT_LINES);
    expect(csv).toContain('# RFQ: RFQ-001');
    expect(csv).toContain(`# invitation_id: ${INV_ID}`);
    expect(csv).toContain('line_id');
    expect(csv).toContain('line-1');
    expect(csv).toContain('line-2');
    expect(csv).toContain('Widget A');
    expect(csv).toContain('1000');
  });

  it('generates valid CSV that can be round-tripped', () => {
    const csv = generateQuoteTemplateCsv('RFQ-001', INV_ID, EVENT_LINES);
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2'], 'RFQ-001', INV_ID);
    // Template rows have no unit_price filled in, so rows come back with undefined prices
    expect(result.status).toBe('VALID');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].lineId).toBe('line-1');
  });
});

describe('Excel import parsing', () => {
  const validCsv = `# RFQ: RFQ-001
# invitation_id: ${INV_ID}
line_id,sku,description,requested_quantity,unit,unit_price,currency,lead_time_days,moq,notes
line-1,W-001,Widget A,1000,pcs,9.50,USD,30,100,Good pricing
line-2,G-002,Gadget B,500,kg,22.00,EUR,45,50,
`;

  it('parses valid CSV successfully', () => {
    const result = parseQuoteImportCsv(validCsv, ['line-1', 'line-2'], 'RFQ-001', INV_ID);
    expect(result.status).toBe('VALID');
    expect(result.rows).toHaveLength(2);
    const row1 = result.rows[0];
    expect(row1.unitPrice).toBe(9.50);
    expect(row1.currency).toBe('USD');
    expect(row1.leadTimeDays).toBe(30);
    expect(row1.moq).toBe(100);
    expect(row1.notes).toBe('Good pricing');
  });

  it('errors on unknown line_id', () => {
    const csv = `line_id,unit_price\nline-99,5.00\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2']);
    expect(result.status).toBe('ERROR');
    expect(result.errors.some(e => e.field === 'line_id')).toBe(true);
  });

  it('errors on duplicate line_id', () => {
    const csv = `line_id,unit_price\nline-1,5.00\nline-1,6.00\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2']);
    expect(result.status).toBe('ERROR');
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('errors on invalid unit price', () => {
    const csv = `line_id,unit_price\nline-1,not-a-number\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2']);
    expect(result.status).toBe('ERROR');
    expect(result.errors.some(e => e.field === 'unit_price')).toBe(true);
  });

  it('warns on missing lines (not all RFQ lines present)', () => {
    const csv = `line_id,unit_price\nline-1,5.00\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2']);
    expect(result.warnings.some(w => w.message.includes('line-2'))).toBe(true);
  });

  it('warns on invalid currency code', () => {
    const csv = `line_id,unit_price,currency\nline-1,5.00,DOLLAR\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2']);
    expect(result.warnings.some(w => w.field === 'currency')).toBe(true);
  });

  it('errors when RFQ reference does not match', () => {
    const csv = `# RFQ: WRONG-RFQ\nline_id,unit_price\nline-1,5.00\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2'], 'RFQ-001');
    expect(result.errors.some(e => e.field === 'rfq_reference')).toBe(true);
  });

  it('accepts CSV with quoted values containing commas', () => {
    const csv = `line_id,unit_price,notes\nline-1,9.50,"High quality, fast delivery"\n`;
    const result = parseQuoteImportCsv(csv, ['line-1', 'line-2']);
    expect(result.rows[0].notes).toBe('High quality, fast delivery');
  });

  it('handles RFQ reference mismatch as error, not warning', () => {
    const csv = `# RFQ: WRONG\nline_id,unit_price\nline-1,5.00\n`;
    const result = parseQuoteImportCsv(csv, ['line-1'], 'CORRECT-RFQ');
    expect(result.errors).toHaveLength(1);
    expect(result.status).toBe('ERROR');
  });
});

describe('DocumentService — extraction provider seam', () => {
  it('throws when disabled provider is used', async () => {
    const svc = buildService();
    const { attachmentId } = await svc.initiateUpload(TENANT, {
      entityType: 'event', entityId: EVENT_ID, filename: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 1024,
    }, USER_ID, NOW);
    await svc.confirmUpload(TENANT, attachmentId);

    const { disabledExtractionProvider } = await import('../src/server/documents/disabledExtractionProvider');
    await expect(svc.extractDocument(TENANT, attachmentId, disabledExtractionProvider))
      .rejects.toThrow('not enabled');
  });
});
