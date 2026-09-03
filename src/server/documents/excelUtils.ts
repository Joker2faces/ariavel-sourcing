import type { SourcingLine } from '../../shared/types/domain.js';
import type { ExcelImportResult, ExcelImportRow } from '../../shared/types/document.js';

// ── Template Generation ───────────────────────────────────────────────────────
// Generates a minimal CSV-format "Excel template" as text/csv for download.
// We avoid external xlsx libraries (no paid deps). The template is a plain
// CSV which buyers can open in Excel. The format is self-documenting.

const TEMPLATE_HEADERS = [
  'line_id',
  'sku',
  'description',
  'requested_quantity',
  'unit',
  'unit_price',
  'currency',
  'lead_time_days',
  'moq',
  'notes',
];

function csvEscape(v: string | number | undefined): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateQuoteTemplateCsv(
  rfqReference: string,
  invitationId: string,
  eventLines: SourcingLine[],
): string {
  const metaRow = `# RFQ: ${rfqReference}`;
  const invRow = `# invitation_id: ${invitationId}`;
  const headers = TEMPLATE_HEADERS.map(csvEscape).join(',');
  const dataRows = eventLines.map(l =>
    [l.id, l.sku ?? '', l.description, l.quantity, l.unit, '', '', '', '', '']
      .map(csvEscape).join(',')
  );
  return [metaRow, invRow, headers, ...dataRows].join('\n');
}

// ── Import Parsing ─────────────────────────────────────────────────────────────
// Parses CSV content (uploaded by supplier via portal) into ExcelImportResult.
// Supports the template format above. Never auto-submits; caller must explicitly submit.

interface ParseError { row: number; field: string; message: string; }

export function parseQuoteImportCsv(
  csvContent: string,
  validLineIds: string[],
  rfqReference?: string,
  invitationId?: string,
): ExcelImportResult {
  const lines = csvContent.split(/\r?\n/).map(l => l.trimEnd());
  const errors: ParseError[] = [];
  const warnings: ParseError[] = [];

  let headerRowIdx = -1;
  let foundRfqRef: string | undefined;
  let foundInvId: string | undefined;

  // Parse meta comments and find header row
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      const rfqMatch = line.match(/^#\s*RFQ:\s*(.+)$/);
      if (rfqMatch) foundRfqRef = rfqMatch[1].trim();
      const invMatch = line.match(/^#\s*invitation_id:\s*(.+)$/);
      if (invMatch) foundInvId = invMatch[1].trim();
      continue;
    }
    if (line.toLowerCase().startsWith('line_id')) {
      headerRowIdx = i;
      break;
    }
    if (line.trim() === '') continue;
    headerRowIdx = i;
    break;
  }

  if (rfqReference && foundRfqRef && foundRfqRef !== rfqReference) {
    errors.push({ row: 0, field: 'rfq_reference', message: `Template was for RFQ "${foundRfqRef}" but this invitation is for "${rfqReference}"` });
  }
  if (invitationId && foundInvId && foundInvId !== invitationId) {
    errors.push({ row: 0, field: 'invitation_id', message: `Template invitation_id "${foundInvId}" does not match this invitation "${invitationId}"` });
  }

  if (headerRowIdx < 0) {
    return { status: 'ERROR', rows: [], errors: [{ row: 0, field: 'structure', message: 'Could not find header row' }], warnings };
  }

  const rawHeaders = parseCsvRow(lines[headerRowIdx]).map(h => h.trim().toLowerCase());
  const colIdx = (name: string) => rawHeaders.indexOf(name);

  const idxLineId = colIdx('line_id');
  const idxUnitPrice = colIdx('unit_price');
  const idxCurrency = colIdx('currency');
  const idxLeadTime = colIdx('lead_time_days');
  const idxMoq = colIdx('moq');
  const idxNotes = colIdx('notes');

  if (idxLineId < 0) {
    return { status: 'ERROR', rows: [], errors: [{ row: headerRowIdx + 1, field: 'line_id', message: 'Header "line_id" is required' }], warnings };
  }

  const rows: ExcelImportRow[] = [];
  const seenLineIds = new Set<string>();

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.trim() === '') continue;

    const cells = parseCsvRow(line);
    const rowNum = i + 1;
    const lineId = cells[idxLineId]?.trim() ?? '';

    if (!lineId) continue;

    if (!validLineIds.includes(lineId)) {
      errors.push({ row: rowNum, field: 'line_id', message: `line_id "${lineId}" does not exist in this RFQ` });
      continue;
    }

    if (seenLineIds.has(lineId)) {
      errors.push({ row: rowNum, field: 'line_id', message: `Duplicate line_id "${lineId}"` });
      continue;
    }
    seenLineIds.add(lineId);

    const rawPrice = cells[idxUnitPrice]?.trim() ?? '';
    let unitPrice: number | undefined;
    if (rawPrice !== '') {
      unitPrice = parseFloat(rawPrice.replace(/,/g, ''));
      if (isNaN(unitPrice) || unitPrice < 0) {
        errors.push({ row: rowNum, field: 'unit_price', message: `Invalid unit_price "${rawPrice}"` });
        unitPrice = undefined;
      }
    }

    const rawLeadTime = cells[idxLeadTime]?.trim() ?? '';
    let leadTimeDays: number | undefined;
    if (rawLeadTime !== '') {
      leadTimeDays = parseInt(rawLeadTime, 10);
      if (isNaN(leadTimeDays) || leadTimeDays < 0) {
        warnings.push({ row: rowNum, field: 'lead_time_days', message: `Invalid lead_time_days "${rawLeadTime}" — ignored` });
        leadTimeDays = undefined;
      }
    }

    const rawMoq = cells[idxMoq]?.trim() ?? '';
    let moq: number | undefined;
    if (rawMoq !== '') {
      moq = parseFloat(rawMoq);
      if (isNaN(moq) || moq < 0) {
        warnings.push({ row: rowNum, field: 'moq', message: `Invalid moq "${rawMoq}" — ignored` });
        moq = undefined;
      }
    }

    const currency = cells[idxCurrency]?.trim().toUpperCase() || undefined;
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      warnings.push({ row: rowNum, field: 'currency', message: `Currency "${currency}" is not a 3-letter ISO code — ignored` });
    }

    rows.push({
      lineId,
      unitPrice,
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
      leadTimeDays,
      moq,
      notes: cells[idxNotes]?.trim() || undefined,
    });
  }

  const missingLines = validLineIds.filter(id => !seenLineIds.has(id));
  missingLines.forEach(id => warnings.push({ row: 0, field: 'line_id', message: `RFQ line "${id}" has no row in the import file` }));

  const hasErrors = errors.length > 0;
  return {
    status: hasErrors ? 'ERROR' : 'VALID',
    rows,
    errors,
    warnings,
    rfqReference: foundRfqRef,
    invitationId: foundInvId,
  };
}

// ── CSV parser (RFC 4180 minimal) ─────────────────────────────────────────────

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
