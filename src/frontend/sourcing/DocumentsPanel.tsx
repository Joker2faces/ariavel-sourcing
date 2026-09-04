import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourcingEvent } from '../../shared/types/domain';
import type { SupplierInvitation } from '../../server/types/invitation';
import type { Attachment } from '../../shared/types/document';
import type { BuyerApiClient } from '../api/buyerApiClient';
import { RowActions } from '../components/RowActions';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'image/png', 'image/jpeg', 'image/webp',
]);

interface Props {
  event: SourcingEvent;
  invitations: SupplierInvitation[];
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({ event, invitations, apiClient, serverAvailable }: Props) {
  const [rfqDocs, setRfqDocs] = useState<Attachment[]>([]);
  const [quoteDocsBySupplier, setQuoteDocsBySupplier] = useState<Record<string, Attachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const submittedOrOpened = invitations.filter(i => i.status === 'OPENED' || i.status === 'SUBMITTED');

  const load = useCallback(async () => {
    if (!apiClient) { setLoading(false); return; }
    setLoading(true);
    try {
      const [docs, quoteDocsLists] = await Promise.all([
        apiClient.listEventAttachments(event.id),
        Promise.all(submittedOrOpened.map(inv => apiClient.listQuoteAttachments(inv.id).then(docs => [inv.id, docs] as const))),
      ]);
      setRfqDocs(docs);
      setQuoteDocsBySupplier(Object.fromEntries(quoteDocsLists.filter(([, d]) => d.length > 0)));
    } catch {
      setError('Could not load documents.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, event.id, submittedOrOpened.map(i => i.id).join(',')]);

  useEffect(() => { void load(); }, [load]);

  async function handleUpload(file: File) {
    if (!apiClient) return;
    setError('');
    if (file.size > MAX_FILE_SIZE_BYTES) { setError(`"${file.name}" is larger than the 25 MB limit.`); return; }
    if (!ALLOWED_MIME_TYPES.has(file.type)) { setError(`"${file.name}" is not a supported file type (PDF, Excel/CSV, or image).`); return; }
    setUploading(true);
    try {
      const presigned = await apiClient.initiateEventAttachmentUpload(event.id, file.name, file.type, file.size);
      await apiClient.uploadAttachmentBytes(presigned.uploadUrl, file);
      await apiClient.confirmAttachmentUpload(presigned.attachmentId);
      setNotice('Document uploaded.');
      await load();
    } catch {
      setError('Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleDelete(attachment: Attachment) {
    if (!apiClient) return;
    try {
      await apiClient.deleteAttachment(attachment.id);
      setNotice('Document deleted.');
      await load();
    } catch {
      setError('Could not delete the document.');
    }
  }

  async function handleDownload(attachment: Attachment) {
    if (!apiClient) return;
    try {
      await apiClient.downloadAttachment(attachment.id, attachment.filename);
    } catch {
      setError('Could not download the document.');
    }
  }

  if (!apiClient) {
    return (
      <div className="empty-state compact">
        <h2>Sign in through monday to continue</h2>
        <p>Documents needs your monday session to authenticate as a buyer.</p>
      </div>
    );
  }
  if (!serverAvailable) {
    return (
      <div className="empty-state compact">
        <h2>Backend unavailable</h2>
        <p>The Ariavel server isn't responding right now. Try reloading in a moment.</p>
      </div>
    );
  }

  return (
    <div className="documents-panel">
      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="inv-section">
        <div className="documents-section-head">
          <h4>RFQ Documents ({rfqDocs.length})</h4>
          <button className="secondary-button small" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? 'Uploading…' : '+ Upload document'}
          </button>
          <input ref={fileInput} type="file" hidden aria-label="Upload RFQ document"
            accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }} />
        </div>
        {loading ? (
          <p className="settings-helper">Loading documents…</p>
        ) : rfqDocs.length === 0 ? (
          <div className="empty-state compact">
            <h2>No RFQ documents yet</h2>
            <p>Upload specifications, drawings, or terms suppliers should see alongside this RFQ.</p>
          </div>
        ) : (
          <ul className="documents-list">
            {rfqDocs.map(doc => (
              <li key={doc.id} className="documents-row">
                <div className="documents-row-info">
                  <strong>{doc.filename}</strong>
                  <span className="settings-row-note">{fmtSize(doc.sizeBytes)} · {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
                <RowActions
                  primaryLabel="Download"
                  onPrimary={() => void handleDownload(doc)}
                  ariaLabelSuffix={doc.filename}
                  overflow={[{ label: 'Delete', onClick: () => void handleDelete(doc), danger: true }]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="inv-section">
        <h4>Supplier Quote Documents</h4>
        {loading ? (
          <p className="settings-helper">Loading documents…</p>
        ) : Object.keys(quoteDocsBySupplier).length === 0 ? (
          <div className="empty-state compact">
            <h2>No supplier documents yet</h2>
            <p>Certificates, datasheets, or other files suppliers attach to their quotes will appear here.</p>
          </div>
        ) : (
          <div className="documents-supplier-groups">
            {Object.entries(quoteDocsBySupplier).map(([invitationId, docs]) => {
              const inv = invitations.find(i => i.id === invitationId);
              return (
                <div key={invitationId} className="documents-supplier-group">
                  <h5>{inv?.supplierNameSnapshot ?? invitationId}</h5>
                  <ul className="documents-list">
                    {docs.map(doc => (
                      <li key={doc.id} className="documents-row">
                        <div className="documents-row-info">
                          <strong>{doc.filename}</strong>
                          <span className="settings-row-note">{fmtSize(doc.sizeBytes)} · {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                        </div>
                        <RowActions primaryLabel="Download" onPrimary={() => void handleDownload(doc)} ariaLabelSuffix={doc.filename} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
