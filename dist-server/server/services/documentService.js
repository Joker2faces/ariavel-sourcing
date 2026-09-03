import { generateQuoteTemplateCsv, parseQuoteImportCsv } from '../documents/excelUtils.js';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
export class AttachmentNotFoundError extends Error {
    constructor() { super('Attachment not found'); }
}
export class AttachmentValidationError extends Error {
    constructor(message) { super(message); }
}
export class ExtractionNotEnabledError extends Error {
    constructor() { super('Document AI extraction is not enabled'); }
}
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
]);
// Magic bytes for file type verification (first bytes of file content)
const MAGIC_BYTES = [
    { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] }, // JPEG
    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
];
export function validateMimeType(filename, declaredMime, firstBytes) {
    const lower = declaredMime.toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIME_TYPES.has(lower)) {
        throw new AttachmentValidationError(`File type "${lower}" is not allowed`);
    }
    // Extension cross-check
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    const dangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'js', 'vbs', 'php', 'py', 'rb'];
    if (dangerousExtensions.includes(ext)) {
        throw new AttachmentValidationError(`File extension ".${ext}" is not allowed`);
    }
    // Optional magic bytes check
    if (firstBytes) {
        const pdfMagic = MAGIC_BYTES.find(m => m.mime === lower);
        if (pdfMagic) {
            const match = pdfMagic.bytes.every((b, i) => firstBytes[i] === b);
            if (!match) {
                throw new AttachmentValidationError('File content does not match declared MIME type');
            }
        }
    }
}
export function sanitizeFilename(filename) {
    // Strip path separators, null bytes, dots at start
    const name = filename.replace(/[/\\]/g, '').replace(/\0/g, '').replace(/^\.+/, '');
    // Limit length
    const maxLen = 255;
    if (name.length > maxLen) {
        const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
        return name.slice(0, maxLen - ext.length) + ext;
    }
    return name || 'attachment';
}
export function createDocumentService(attachmentRepo, _invitationRepo) {
    function genId() { return randomBytes(12).toString('hex'); }
    function genObjectKey(tenantId, entityType, entityId, filename) {
        // Never expose user-controlled input in the object key
        const sanitized = sanitizeFilename(filename);
        const hash = createHash('sha256').update(`${tenantId}:${entityId}:${sanitized}:${Date.now()}`).digest('hex').slice(0, 16);
        return `${tenantId}/${entityType}/${entityId}/${hash}`;
    }
    return {
        async initiateUpload(tenantId, input, userId, now) {
            if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
                throw new AttachmentValidationError(`File size ${input.sizeBytes} exceeds maximum of ${MAX_FILE_SIZE_BYTES} bytes`);
            }
            validateMimeType(input.filename, input.mimeType);
            const sanitized = sanitizeFilename(input.filename);
            const objectKey = genObjectKey(tenantId, input.entityType, input.entityId, sanitized);
            const attachment = {
                id: genId(), tenantId,
                entityType: input.entityType, entityId: input.entityId,
                objectKey, filename: sanitized, mimeType: input.mimeType.toLowerCase().split(';')[0].trim(),
                sizeBytes: input.sizeBytes,
                status: 'PENDING_UPLOAD',
                uploadedByUserId: userId, uploadedAt: now,
            };
            await attachmentRepo.create(attachment);
            // In real monday Code deployment, use monday Object Storage SDK for presigned URL.
            // Here we return a placeholder URL indicating where the SDK call would go.
            const expiresAt = new Date(Date.parse(now) + 15 * 60 * 1000).toISOString();
            return {
                attachmentId: attachment.id,
                uploadUrl: `https://object-storage.monday.com/upload/${objectKey}`,
                objectKey,
                expiresAt,
            };
        },
        async confirmUpload(tenantId, attachmentId) {
            const attachment = await attachmentRepo.updateStatus(tenantId, attachmentId, 'READY');
            if (!attachment)
                throw new AttachmentNotFoundError();
            return attachment;
        },
        async getAttachment(tenantId, attachmentId) {
            return attachmentRepo.getById(tenantId, attachmentId);
        },
        async listAttachments(tenantId, entityType, entityId) {
            return attachmentRepo.listForEntity(tenantId, entityType, entityId);
        },
        async deleteAttachment(tenantId, attachmentId, _userId, _now) {
            const attachment = await attachmentRepo.getById(tenantId, attachmentId);
            if (!attachment)
                throw new AttachmentNotFoundError();
            await attachmentRepo.updateStatus(tenantId, attachmentId, 'DELETED');
        },
        generateQuoteTemplate(tenantId, invitationId, eventLines, rfqReference) {
            void tenantId; // used for access control at route level
            const content = generateQuoteTemplateCsv(rfqReference, invitationId, eventLines);
            return {
                content,
                filename: `quote-template-${rfqReference.replace(/[^a-zA-Z0-9-_]/g, '_')}.csv`,
                contentType: 'text/csv',
            };
        },
        parseQuoteImport(csvContent, validLineIds, rfqReference, invitationId) {
            return parseQuoteImportCsv(csvContent, validLineIds, rfqReference, invitationId);
        },
        async extractDocument(tenantId, attachmentId, provider) {
            if (!provider.isEnabled)
                throw new ExtractionNotEnabledError();
            const attachment = await attachmentRepo.getById(tenantId, attachmentId);
            if (!attachment)
                throw new AttachmentNotFoundError();
            if (attachment.status !== 'READY') {
                throw new AttachmentValidationError('Attachment is not ready for extraction');
            }
            const result = await provider.extract(attachment.objectKey, attachment.filename, attachment.mimeType);
            // Convert extraction result to ExcelImportResult shape
            return {
                status: result.confidence >= 0.5 ? 'VALID' : 'ERROR',
                rows: result.extractedLines,
                errors: result.confidence < 0.5
                    ? [{ row: 0, field: 'confidence', message: `Low confidence extraction: ${(result.confidence * 100).toFixed(0)}%` }]
                    : [],
                warnings: [],
            };
        },
    };
}
