import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortalApiClient, PortalApiError, type PortalApiClient } from './portalApiClient';
import type { InvitationPublicDTO } from '../../server/types/invitation';
import type { QuoteInput, QuoteLine, QuotePublicDTO } from '../../server/types/quote';
import type { ExcelImportResult } from '../../shared/types/document';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';

type Phase = 'LOADING' | 'NOT_FOUND' | 'CLOSED' | 'READY' | 'SUBMITTED' | 'ERROR';

interface Props {
  token: string;
  client?: PortalApiClient;
}

function seedLines(invitation: InvitationPublicDTO, quote: QuotePublicDTO | null): QuoteLine[] {
  if (quote && quote.lines.length > 0) return quote.lines;
  return invitation.lines.map(l => ({ lineId: l.lineId, lineDescription: l.description }));
}

// The public supplier portal. It runs entirely outside monday.com — no
// monday SDK, no iframe, no sessionToken — a supplier who has never heard
// of monday.com opens this link from an email and it must stand on its
// own. Authentication is the opaque token in the URL, checked by the
// backend on every request; there is nothing here for the page itself to
// verify beyond "did the server accept it".
export function PortalApp({ token, client }: Props) {
  const api = useMemo(() => client ?? createPortalApiClient(), [client]);
  const [phase, setPhase] = useState<Phase>('LOADING');
  const [errorMessage, setErrorMessage] = useState('');
  const [invitation, setInvitation] = useState<InvitationPublicDTO | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [commercialTerms, setCommercialTerms] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [validityDays, setValidityDays] = useState<number | ''>('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inv = await api.getInvitation(token);
        if (inv.status === 'SUBMITTED') {
          if (!cancelled) { setInvitation(inv); setSubmittedAt(inv.submittedAt); setPhase('SUBMITTED'); }
          return;
        }
        const quote = await api.getQuote(token);
        if (cancelled) return;
        setInvitation(inv);
        setLines(seedLines(inv, quote));
        setCommercialTerms(quote?.commercialTerms ?? '');
        setPaymentTerms(quote?.paymentTerms ?? '');
        setValidityDays(quote?.validityDays ?? '');
        setSupplierNotes(quote?.supplierNotes ?? '');
        setPhase('READY');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PortalApiError && err.status === 404) { setPhase('NOT_FOUND'); return; }
        if (err instanceof PortalApiError && err.status === 410) { setErrorMessage(err.message); setPhase('CLOSED'); return; }
        setErrorMessage('Something went wrong loading this invitation.');
        setPhase('ERROR');
      }
    })();
    return () => { cancelled = true; };
  }, [api, token]);

  function updateLine(lineId: string, patch: Partial<QuoteLine>) {
    setLines(prev => prev.map(l => (l.lineId === lineId ? { ...l, ...patch } : l)));
  }

  function buildInput(): QuoteInput {
    return {
      lines,
      commercialTerms: commercialTerms || undefined,
      paymentTerms: paymentTerms || undefined,
      validityDays: validityDays === '' ? undefined : validityDays,
      supplierNotes: supplierNotes || undefined,
    };
  }

  async function saveDraft() {
    setSaving(true);
    setSaveError('');
    try {
      await api.saveDraft(token, buildInput());
      setLastSavedAt(new Date().toISOString());
    } catch {
      setSaveError('Could not save your draft. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
      reader.readAsText(file);
    });
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file after a fix
    if (!file || !invitation) return;
    setImporting(true);
    setImportResult(null);
    try {
      const csvContent = await readFileAsText(file);
      const validLineIds = invitation.lines.map(l => l.lineId);
      const result = await api.importQuote(token, csvContent, validLineIds, invitation.eventReference);
      setImportResult(result);
      if (result.status === 'VALID') {
        setLines(prev => {
          const next = [...prev];
          for (const row of result.rows) {
            const idx = next.findIndex(l => l.lineId === row.lineId);
            const patch = { unitPrice: row.unitPrice, currency: row.currency, leadTimeDays: row.leadTimeDays, moq: row.moq, notes: row.notes };
            if (idx >= 0) next[idx] = { ...next[idx], ...patch };
            else next.push({ lineId: row.lineId, lineDescription: invitation.lines.find(l => l.lineId === row.lineId)?.description ?? '', ...patch });
          }
          return next;
        });
      }
    } catch {
      setImportResult({ status: 'ERROR', rows: [], errors: [{ row: 0, field: 'file', message: 'Could not read this file. Make sure it is the CSV template downloaded from this page.' }], warnings: [] });
    } finally {
      setImporting(false);
    }
  }

  async function confirmSubmit() {
    setSaving(true);
    setSaveError('');
    try {
      await api.saveDraft(token, buildInput());
      const result = await api.submit(token);
      setSubmittedAt(result.submittedAt);
      setPhase('SUBMITTED');
    } catch {
      setSaveError('Could not submit your quote. Check your connection and try again.');
      setConfirmingSubmit(false);
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'LOADING') {
    return (
      <div className="portal-shell">
        <div className="portal-loading" role="status" aria-live="polite">
          <div className="loading-spinner" aria-hidden="true" />
          <span>Loading your invitation…</span>
        </div>
      </div>
    );
  }

  if (phase === 'NOT_FOUND') {
    return (
      <PortalMessageState
        title="We couldn't find this invitation"
        body="This link may be incomplete or incorrect. Please check the link your buyer sent you, or contact them for a new one."
      />
    );
  }

  if (phase === 'CLOSED') {
    return (
      <PortalMessageState
        title="This invitation is no longer open"
        body={errorMessage || 'This invitation has expired or is no longer valid. Contact your buyer if you believe this is a mistake.'}
      />
    );
  }

  if (phase === 'ERROR') {
    return (
      <PortalMessageState
        title="Something went wrong"
        body={errorMessage}
        action={<button className="primary-button" onClick={() => window.location.reload()}>Try again</button>}
      />
    );
  }

  if (phase === 'SUBMITTED') {
    return (
      <div className="portal-shell">
        <PortalHeader invitation={invitation} />
        <div className="portal-card portal-submitted">
          <span className="portal-submitted-mark" aria-hidden="true"><Icon name="check" size={28} /></span>
          <h2>Quote submitted</h2>
          <p>
            Your quote for <strong>{invitation?.eventTitle}</strong> ({invitation?.eventReference}) has been submitted
            {submittedAt ? ` on ${new Date(submittedAt).toLocaleString()}` : ''}.
          </p>
          <p className="portal-hint">This submission is final and can no longer be edited. Contact your buyer directly if anything needs to change.</p>
        </div>
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="portal-shell">
      <PortalHeader invitation={invitation} />

      <div className="portal-card">
        <div className="portal-import-row">
          <h2>Request for quote — {lines.length} line{lines.length === 1 ? '' : 's'}</h2>
          <div className="portal-import-actions">
            <a
              className="secondary-button"
              href={api.quoteTemplateUrl(token, invitation.eventReference, invitation.lines)}
              download={`${invitation.eventReference}-quote-template.csv`}
            >
              <Icon name="download" size={16} /> Download template
            </a>
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <Icon name="upload" size={16} /> {importing ? 'Importing…' : 'Import from file'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="visually-hidden"
              aria-label="Import quote from CSV file"
              onChange={event => void handleImportFile(event)}
            />
          </div>
        </div>
        <p className="portal-hint">
          Fill in every line below, or download the CSV template, complete it in Excel, and import it here. Importing never
          submits your quote automatically — review every line before saving your draft.
        </p>
        {importResult && (
          <div className={`portal-import-result ${importResult.status === 'ERROR' ? 'portal-import-error' : 'portal-import-success'}`} role="alert">
            {importResult.status === 'VALID' ? (
              <p>Imported {importResult.rows.length} line{importResult.rows.length === 1 ? '' : 's'} from your file. Review the values below, then save your draft.</p>
            ) : (
              <p>Your file could not be imported. Fix the issues below and try again — nothing was changed.</p>
            )}
            {importResult.errors.length > 0 && (
              <ul>{importResult.errors.map((e, i) => <li key={`err-${i}`}>{e.field !== 'file' ? `Row ${e.row}: ` : ''}{e.message}</li>)}</ul>
            )}
            {importResult.warnings.length > 0 && (
              <ul className="portal-import-warnings">{importResult.warnings.map((w, i) => <li key={`warn-${i}`}>{w.row ? `Row ${w.row}: ` : ''}{w.message}</li>)}</ul>
            )}
          </div>
        )}
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Currency</th>
                <th>Lead time (days)</th>
                <th>MOQ</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {invitation.lines.map(rfqLine => {
                const line = lines.find(l => l.lineId === rfqLine.lineId) ?? { lineId: rfqLine.lineId, lineDescription: rfqLine.description };
                return (
                  <tr key={rfqLine.lineId}>
                    <td>
                      <div className="portal-line-desc">{rfqLine.description}</div>
                      <div className="portal-line-meta">{rfqLine.quantity} {rfqLine.unit}{rfqLine.specification ? ` · ${rfqLine.specification}` : ''}</div>
                    </td>
                    <td>{rfqLine.quantity} {rfqLine.unit}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`price-${rfqLine.lineId}`}>Unit price for {rfqLine.description}</label>
                      <input id={`price-${rfqLine.lineId}`} type="number" min={0} step="0.01" value={line.unitPrice ?? ''}
                        onChange={e => updateLine(rfqLine.lineId, { unitPrice: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`currency-${rfqLine.lineId}`}>Currency for {rfqLine.description}</label>
                      <input id={`currency-${rfqLine.lineId}`} type="text" maxLength={3} placeholder="USD" value={line.currency ?? ''}
                        onChange={e => updateLine(rfqLine.lineId, { currency: e.target.value.toUpperCase() || undefined })} />
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`lead-${rfqLine.lineId}`}>Lead time in days for {rfqLine.description}</label>
                      <input id={`lead-${rfqLine.lineId}`} type="number" min={0} value={line.leadTimeDays ?? ''}
                        onChange={e => updateLine(rfqLine.lineId, { leadTimeDays: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`moq-${rfqLine.lineId}`}>Minimum order quantity for {rfqLine.description}</label>
                      <input id={`moq-${rfqLine.lineId}`} type="number" min={0} value={line.moq ?? ''}
                        onChange={e => updateLine(rfqLine.lineId, { moq: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`notes-${rfqLine.lineId}`}>Notes for {rfqLine.description}</label>
                      <input id={`notes-${rfqLine.lineId}`} type="text" value={line.notes ?? ''}
                        onChange={e => updateLine(rfqLine.lineId, { notes: e.target.value || undefined })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="portal-card">
        <h2>Commercial terms</h2>
        <div className="portal-field-grid">
          <label>
            <span>Payment terms</span>
            <input type="text" placeholder="e.g. 30% deposit, 70% on shipment" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
          </label>
          <label>
            <span>Quote validity (days)</span>
            <input type="number" min={0} value={validityDays} onChange={e => setValidityDays(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
        </div>
        <label className="portal-field-block">
          <span>Commercial terms</span>
          <textarea rows={3} value={commercialTerms} onChange={e => setCommercialTerms(e.target.value)} placeholder="Incoterms, freight, packaging, etc." />
        </label>
        <label className="portal-field-block">
          <span>Notes to buyer</span>
          <textarea rows={3} value={supplierNotes} onChange={e => setSupplierNotes(e.target.value)} placeholder="Anything else the buyer should know" />
        </label>
      </div>

      {saveError && <p className="portal-error" role="alert">{saveError}</p>}

      <div className="portal-actions">
        <div className="portal-save-status" aria-live="polite">
          {lastSavedAt ? `Draft saved at ${new Date(lastSavedAt).toLocaleTimeString()}` : ''}
        </div>
        <button className="secondary-button" onClick={saveDraft} disabled={saving}>Save draft</button>
        <button className="primary-button" onClick={() => setConfirmingSubmit(true)} disabled={saving}>Review & submit</button>
      </div>

      {confirmingSubmit && (
        <Modal onClose={() => setConfirmingSubmit(false)} ariaLabel="Confirm quote submission">
          <h2>Submit this quote?</h2>
          <p>Once submitted, this quote is final and cannot be edited. Make sure every line and term is correct.</p>
          <div className="portal-modal-actions">
            <button className="secondary-button" onClick={() => setConfirmingSubmit(false)} disabled={saving}>Go back</button>
            <button className="primary-button" onClick={confirmSubmit} disabled={saving}>{saving ? 'Submitting…' : 'Submit quote'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PortalHeader({ invitation }: { invitation: InvitationPublicDTO | null }) {
  return (
    <header className="portal-header">
      <div className="portal-brand"><span className="portal-brand-mark" aria-hidden="true"><Icon name="grid" size={22} /></span>Ariavel Sourcing</div>
      {invitation && (
        <div className="portal-event-info">
          <h1>{invitation.eventTitle}</h1>
          <p>{invitation.eventReference} · Supplier: {invitation.supplierName}{invitation.expiresAt ? ` · Closes ${new Date(invitation.expiresAt).toLocaleDateString()}` : ''}</p>
        </div>
      )}
    </header>
  );
}

function PortalMessageState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="portal-shell">
      <div className="portal-card portal-message">
        <span className="portal-brand-mark" aria-hidden="true"><Icon name="grid" size={28} /></span>
        <h1>{title}</h1>
        <p>{body}</p>
        {action}
      </div>
    </div>
  );
}
