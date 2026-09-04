import { useEffect, useState } from 'react';
import type { RuntimeCapabilities } from '../../backend/runtime/runtimeCapabilities';
import type { BuyerApiClient } from '../api/buyerApiClient';
import type { TenantSettings, TenantSettingsInput, FreightAllocationMethod } from '../../shared/types/tenantSettings';
import { defaultTenantSettings } from '../../shared/types/tenantSettings';

interface Props {
  capabilities: RuntimeCapabilities;
  serverBaseUrl: string;
  serverAvailable: boolean;
  apiClient?: BuyerApiClient | null;
}

type Section = 'organization' | 'sourcing' | 'comparison' | 'security' | 'data' | 'billing';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'organization', label: 'Organization' },
  { id: 'sourcing', label: 'Sourcing' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'security', label: 'Security' },
  { id: 'data', label: 'Data & Privacy' },
  { id: 'billing', label: 'Billing' },
];

export function SettingsPage({ capabilities, serverBaseUrl, serverAvailable, apiClient = null }: Props) {
  const [active, setActive] = useState<Section>('organization');
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!apiClient) { setSettings(defaultTenantSettings('local', new Date().toISOString())); setLoading(false); return; }
    let cancelled = false;
    apiClient.getSettings()
      .then(s => { if (!cancelled) setSettings(s); })
      .catch(() => { if (!cancelled) setNotice({ tone: 'error', text: 'Could not load settings from the server.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiClient]);

  async function save(input: TenantSettingsInput) {
    if (!apiClient || !settings) { setNotice({ tone: 'error', text: 'Not connected to the server.' }); return; }
    setSaving(true);
    setNotice(null);
    try {
      const updated = await apiClient.updateSettings(input, settings.version);
      setSettings(updated);
      setNotice({ tone: 'success', text: 'Saved.' });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        const fresh = await apiClient.getSettings().catch(() => null);
        if (fresh) setSettings(fresh);
        setNotice({ tone: 'error', text: 'Someone else changed these settings — reloaded the latest version. Please re-apply your change.' });
      } else {
        setNotice({ tone: 'error', text: 'Could not save settings.' });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <div className="content-wrap"><div className="page-heading"><div><h1>Settings</h1></div></div><p>Loading settings…</p></div>;
  }

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Configure Ariavel Sourcing for your organization.</p>
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.tone === 'error' ? 'notice-error' : 'notice-success'}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`settings-nav-item ${active === s.id ? 'active' : ''}`}
              onClick={() => setActive(s.id)}
              aria-current={active === s.id ? 'page' : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {active === 'organization' && <OrganizationSection settings={settings} onSave={save} serverBaseUrl={serverBaseUrl} serverAvailable={serverAvailable} capabilities={capabilities} readOnly={!apiClient} saving={saving} />}
          {active === 'sourcing' && <SourcingSection settings={settings} onSave={save} readOnly={!apiClient} saving={saving} />}
          {active === 'comparison' && <ComparisonSection settings={settings} onSave={save} readOnly={!apiClient} saving={saving} />}
          {active === 'security' && <SecuritySection settings={settings} onSave={save} capabilities={capabilities} readOnly={!apiClient} saving={saving} />}
          {active === 'data' && <DataPrivacySection apiClient={apiClient} />}
          {active === 'billing' && <BillingSection />}
        </div>
      </div>
    </div>
  );
}

function SettingsCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="settings-card">
      {title && <h3 className="settings-card-title">{title}</h3>}
      {children}
    </div>
  );
}

function SettingsRow({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {note && <span className="settings-row-note">{note}</span>}
      </div>
      <div className="settings-row-value">{value}</div>
    </div>
  );
}

function StatusBadge({ ok, trueLabel = 'Yes', falseLabel = 'No' }: { ok: boolean; trueLabel?: string; falseLabel?: string }) {
  return <span className={`settings-badge ${ok ? 'badge-success' : 'badge-neutral'}`}>{ok ? trueLabel : falseLabel}</span>;
}

function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled?: boolean; saving?: boolean }) {
  return <button className="primary-button settings-save-button" onClick={onClick} disabled={disabled || saving} aria-live="polite">{saving ? 'Saving…' : 'Save changes'}</button>;
}

function OrganizationSection({
  settings, onSave, serverBaseUrl, serverAvailable, capabilities, readOnly, saving,
}: {
  settings: TenantSettings;
  onSave: (input: TenantSettingsInput) => Promise<void>;
  serverBaseUrl: string; serverAvailable: boolean; capabilities: RuntimeCapabilities; readOnly: boolean; saving?: boolean;
}) {
  const [companyDisplayName, setCompanyDisplayName] = useState(settings.organization.companyDisplayName);
  const [supportEmail, setSupportEmail] = useState(settings.organization.supportEmail);
  const [defaultCurrency, setDefaultCurrency] = useState(settings.organization.defaultCurrency);

  return (
    <div className="settings-section">
      <SettingsCard title="Company">
        <SettingsRow label="Company display name" note="Shown to suppliers on the invitation portal" value={
          <input className="settings-input" value={companyDisplayName} disabled={readOnly}
            onChange={e => setCompanyDisplayName(e.target.value)} aria-label="Company display name" />
        } />
        <SettingsRow label="Support email" note="Shown to suppliers who need help with the portal" value={
          <input type="email" className="settings-input" value={supportEmail} disabled={readOnly}
            onChange={e => setSupportEmail(e.target.value)} aria-label="Support email" />
        } />
        <SettingsRow label="Default currency" value={
          <select className="settings-select" value={defaultCurrency} disabled={readOnly}
            onChange={e => setDefaultCurrency(e.target.value)} aria-label="Default currency">
            {['EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CHF'].map(c => <option key={c}>{c}</option>)}
          </select>
        } />
        {!readOnly && <SaveButton onClick={() => onSave({ organization: { companyDisplayName, supportEmail, defaultCurrency } })} saving={saving} />}
      </SettingsCard>

      <SettingsCard title="Backend Connection">
        <SettingsRow label="Server URL" value={<code className="settings-code">{serverBaseUrl || '(same origin as this app)'}</code>} />
        <SettingsRow
          label="Connection status"
          value={
            readOnly
              ? <span className="settings-badge badge-neutral">Sign in through monday to connect</span>
              : <StatusBadge ok={serverAvailable} trueLabel="Connected" falseLabel="Backend unavailable" />
          }
        />
      </SettingsCard>

      <SettingsCard title="Your Permissions">
        <SettingsRow label="View suppliers" value={<StatusBadge ok={capabilities.canViewSuppliers} />} />
        <SettingsRow label="Edit suppliers" value={<StatusBadge ok={capabilities.canEditAriavelSuppliers} />} />
        <SettingsRow label="Configure supplier source" value={<StatusBadge ok={capabilities.canConfigureSupplierSource} />} />
      </SettingsCard>

      <SettingsCard title="About">
        <SettingsRow label="Application" value="Ariavel Sourcing" />
        <SettingsRow label="Version" value="1.0.0-rc" />
        <SettingsRow label="Platform" value="monday.com Custom Object" />
        <SettingsRow
          label="Support"
          value={
            settings.organization.supportEmail
              ? <a href={`mailto:${settings.organization.supportEmail}`} className="settings-link">{settings.organization.supportEmail}</a>
              : <span className="settings-row-note">Not configured — set a support email above</span>
          }
        />
      </SettingsCard>
    </div>
  );
}

function SourcingSection({ settings, onSave, readOnly, saving }: { settings: TenantSettings; onSave: (input: TenantSettingsInput) => Promise<void>; readOnly: boolean; saving?: boolean }) {
  const [defaultRfqDeadlineDays, setDefaultRfqDeadlineDays] = useState(settings.sourcing.defaultRfqDeadlineDays);
  const [invitationExpiryDays, setInvitationExpiryDays] = useState(settings.sourcing.invitationExpiryDays);
  const [defaultIncoterm, setDefaultIncoterm] = useState(settings.sourcing.defaultIncoterm);
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState(settings.sourcing.defaultPaymentTerms);
  const [requireTargetPrice, setRequireTargetPrice] = useState(settings.sourcing.requireTargetPrice);
  const [autoCloseAtDeadline, setAutoCloseAtDeadline] = useState(settings.sourcing.autoCloseAtDeadline);

  return (
    <div className="settings-section">
      <SettingsCard title="RFQ Defaults">
        <SettingsRow label="Default RFQ deadline (days)" note="Pre-filled when creating a new sourcing event" value={
          <input type="number" className="settings-input" value={defaultRfqDeadlineDays} min={1} max={365} disabled={readOnly}
            onChange={e => setDefaultRfqDeadlineDays(Number(e.target.value))} aria-label="Default RFQ deadline in days" />
        } />
        <SettingsRow label="Default invitation expiry (days)" note="How long a supplier invitation link stays valid" value={
          <input type="number" className="settings-input" value={invitationExpiryDays} min={1} max={90} disabled={readOnly}
            onChange={e => setInvitationExpiryDays(Number(e.target.value))} aria-label="Default invitation expiry in days" />
        } />
        <SettingsRow label="Default Incoterm" value={
          <input className="settings-input" value={defaultIncoterm} disabled={readOnly}
            onChange={e => setDefaultIncoterm(e.target.value)} aria-label="Default Incoterm" />
        } />
        <SettingsRow label="Default payment terms" value={
          <input className="settings-input" value={defaultPaymentTerms} disabled={readOnly}
            onChange={e => setDefaultPaymentTerms(e.target.value)} aria-label="Default payment terms" />
        } />
        <SettingsRow label="Require target price" note="Block RFQ creation unless all lines have a target price" value={
          <label className="settings-toggle" aria-label="Require target price">
            <input type="checkbox" checked={requireTargetPrice} disabled={readOnly} onChange={e => setRequireTargetPrice(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        } />
        {!readOnly && <SaveButton onClick={() => onSave({ sourcing: { defaultRfqDeadlineDays, invitationExpiryDays, defaultIncoterm, defaultPaymentTerms, requireTargetPrice, autoCloseAtDeadline } })} saving={saving} />}
      </SettingsCard>

      <SettingsCard title="Event Lifecycle">
        <SettingsRow
          label="Auto-close events at deadline"
          note="Automatically transition OPEN → EVALUATING when deadline passes"
          value={
            <label className="settings-toggle" aria-label="Auto-close events at deadline">
              <input type="checkbox" checked={autoCloseAtDeadline} disabled={readOnly} onChange={e => setAutoCloseAtDeadline(e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          }
        />
        <SettingsRow label="Status progression" value={
          <div className="settings-status-flow">
            {['Draft', 'Ready', 'Open', 'Evaluating', 'Awarded'].map((s, i, arr) => (
              <span key={s} className="settings-status-flow-item">
                <span className="settings-flow-chip">{s}</span>
                {i < arr.length - 1 && <span className="flow-arrow" aria-hidden="true">→</span>}
              </span>
            ))}
          </div>
        } />
      </SettingsCard>
    </div>
  );
}

function ComparisonSection({ settings, onSave, readOnly, saving }: { settings: TenantSettings; onSave: (input: TenantSettingsInput) => Promise<void>; readOnly: boolean; saving?: boolean }) {
  const [baseCurrency, setBaseCurrency] = useState(settings.comparison.baseCurrency);
  const [freightAllocationMethod, setFreightAllocationMethod] = useState<FreightAllocationMethod>(settings.comparison.freightAllocationMethod);
  const [closingSoonDays, setClosingSoonDays] = useState(settings.comparison.closingSoonDays);
  const [landedCostWeight, setLandedCostWeight] = useState(settings.comparison.weights.landedCost);
  const [leadTimeWeight, setLeadTimeWeight] = useState(settings.comparison.weights.leadTime);
  const [completenessWeight, setCompletenessWeight] = useState(settings.comparison.weights.completeness);

  const totalWeight = landedCostWeight + leadTimeWeight + completenessWeight;

  return (
    <div className="settings-section">
      <SettingsCard title="Base Currency & Freight">
        <SettingsRow label="Base currency" note="Used as the comparison currency for bid normalization" value={
          <select className="settings-select" value={baseCurrency} disabled={readOnly}
            onChange={e => setBaseCurrency(e.target.value)} aria-label="Base currency">
            {['EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CHF'].map(c => <option key={c}>{c}</option>)}
          </select>
        } />
        <SettingsRow label="Default freight policy" note="How freight cost is distributed across RFQ lines" value={
          <select className="settings-select" value={freightAllocationMethod} disabled={readOnly}
            onChange={e => setFreightAllocationMethod(e.target.value as FreightAllocationMethod)} aria-label="Default freight policy">
            <option value="PROPORTIONAL_TO_LINE_VALUE">Proportional to line value</option>
            <option value="EQUAL_PER_LINE">Equal per line</option>
            <option value="MANUAL">Manual (set per supplier)</option>
          </select>
        } />
        <SettingsRow label={'"Closing soon" threshold (days)'} value={
          <input type="number" className="settings-input" value={closingSoonDays} min={1} max={30} disabled={readOnly}
            onChange={e => setClosingSoonDays(Number(e.target.value))} aria-label="Closing soon threshold in days" />
        } />
      </SettingsCard>

      <SettingsCard title="Evaluation Weights">
        <p className="settings-helper">Weights must sum to 100. Total: <strong className={totalWeight !== 100 ? 'settings-error-text' : ''}>{totalWeight}</strong></p>
        <SettingsRow label="Landed cost" note="Primary cost metric after FX normalization" value={
          <div className="weight-input-group">
            <input type="number" className="settings-input weight-input" value={landedCostWeight} min={0} max={100} disabled={readOnly}
              onChange={e => setLandedCostWeight(Number(e.target.value))} aria-label="Landed cost weight" />
            <span>%</span>
          </div>
        } />
        <SettingsRow label="Lead time" note="Days from PO to delivery" value={
          <div className="weight-input-group">
            <input type="number" className="settings-input weight-input" value={leadTimeWeight} min={0} max={100} disabled={readOnly}
              onChange={e => setLeadTimeWeight(Number(e.target.value))} aria-label="Lead time weight" />
            <span>%</span>
          </div>
        } />
        <SettingsRow label="Commercial completeness" note="Percentage of RFQ lines with full pricing" value={
          <div className="weight-input-group">
            <input type="number" className="settings-input weight-input" value={completenessWeight} min={0} max={100} disabled={readOnly}
              onChange={e => setCompletenessWeight(Number(e.target.value))} aria-label="Commercial completeness weight" />
            <span>%</span>
          </div>
        } />
        {!readOnly && (
          <SaveButton
            disabled={totalWeight !== 100}
            saving={saving}
            onClick={() => onSave({ comparison: { baseCurrency, freightAllocationMethod, closingSoonDays, weights: { landedCost: landedCostWeight, leadTime: leadTimeWeight, completeness: completenessWeight } } })}
          />
        )}
      </SettingsCard>

      <SettingsCard title="FX Rates">
        <SettingsRow label="Rate source" value="Manual (set per comparison snapshot)" />
        <SettingsRow label="External FX provider" value={<span className="settings-badge badge-neutral">Not configured</span>} note="Automatic rate updates require a paid provider" />
      </SettingsCard>
    </div>
  );
}

function SecuritySection({ settings, onSave, capabilities, readOnly, saving }: { settings: TenantSettings; onSave: (input: TenantSettingsInput) => Promise<void>; capabilities: RuntimeCapabilities; readOnly: boolean; saving?: boolean }) {
  const [allowSupplierDrafts, setAllowSupplierDrafts] = useState(settings.security.allowSupplierDrafts);
  const [submittedQuoteReopenPolicy, setSubmittedQuoteReopenPolicy] = useState(settings.security.submittedQuoteReopenPolicy);

  return (
    <div className="settings-section">
      <SettingsCard title="Supplier Portal Policy">
        <SettingsRow label="Allow suppliers to save drafts" note="If off, suppliers must submit their quote in one sitting" value={
          <label className="settings-toggle" aria-label="Allow suppliers to save drafts">
            <input type="checkbox" checked={allowSupplierDrafts} disabled={readOnly} onChange={e => setAllowSupplierDrafts(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        } />
        <SettingsRow label="Submitted quote reopen policy" value={
          <select className="settings-select" value={submittedQuoteReopenPolicy} disabled={readOnly}
            onChange={e => setSubmittedQuoteReopenPolicy(e.target.value as 'NEVER' | 'BUYER_APPROVAL_REQUIRED')} aria-label="Submitted quote reopen policy">
            <option value="NEVER">Never — submitted quotes are permanently immutable</option>
            <option value="BUYER_APPROVAL_REQUIRED">Allow with buyer approval (not yet enforced server-side)</option>
          </select>
        } />
        {!readOnly && <SaveButton onClick={() => onSave({ security: { allowSupplierDrafts, submittedQuoteReopenPolicy } })} saving={saving} />}
      </SettingsCard>

      <SettingsCard title="Authentication">
        <SettingsRow label="Buyer authentication" value="monday.com session token (JWT)" />
        <SettingsRow label="Supplier portal" value="Random 256-bit token, hashed at rest" />
      </SettingsCard>

      <SettingsCard title="Tenant Isolation">
        <SettingsRow
          label="Tenant identity source"
          note="Derived exclusively from the verified JWT — never from request body"
          value={<StatusBadge ok={true} trueLabel="JWT-enforced" />}
        />
        <SettingsRow
          label="Multi-tenant isolation"
          value={<StatusBadge ok={capabilities.canViewSuppliers} trueLabel="Active" falseLabel="Limited" />}
        />
        <SettingsRow label="Cross-tenant data access" value={<StatusBadge ok={false} trueLabel="Possible" falseLabel="Blocked" />} />
      </SettingsCard>

      <SettingsCard title="API Security">
        <SettingsRow label="Buyer rate limit" value="200 requests / minute" />
        <SettingsRow label="Portal rate limit" value="60 requests / minute" />
        <SettingsRow label="Request body limit" value="256 KB" />
        <SettingsRow label="File upload limit" value="25 MB" />
        <SettingsRow label="Content Security Policy" value={<StatusBadge ok={true} trueLabel="Enabled" />} />
        <SettingsRow label="CORS policy" value="Same-origin only (frontend and API share one origin)" />
      </SettingsCard>
    </div>
  );
}

function DataPrivacySection({ apiClient }: { apiClient: BuyerApiClient | null }) {
  const [exporting, setExporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function handleExport() {
    if (!apiClient) return;
    setExporting(true);
    setNotice(null);
    try {
      const blob = await apiClient.exportTenantData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ariavel-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ tone: 'error', text: 'Could not export your data.' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!apiClient) return;
    setDeleting(true);
    setNotice(null);
    try {
      await apiClient.deleteTenantData(deleteConfirm);
      setNotice({ tone: 'success', text: 'All Ariavel-owned data for this tenant has been deleted.' });
      setDeleteConfirm('');
    } catch {
      setNotice({ tone: 'error', text: 'Deletion failed — check the confirmation phrase and try again.' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="settings-section">
      {notice && <div className={`notice ${notice.tone === 'error' ? 'notice-error' : 'notice-success'}`} role="status">{notice.text}</div>}

      <SettingsCard title="Data Storage">
        <SettingsRow label="Database" value="monday.com managed MongoDB (monday Code)" />
        <SettingsRow label="File storage" value="monday Object Storage" />
        <SettingsRow label="Data residency" value="monday.com platform region" />
        <SettingsRow
          label="Encryption at rest"
          value={<StatusBadge ok={true} trueLabel="AES-256" />}
          note="Per monday.com's published platform security documentation — Ariavel does not independently manage or verify the underlying infrastructure"
        />
        <SettingsRow
          label="Encryption in transit"
          value={<StatusBadge ok={true} trueLabel="TLS 1.2+" />}
          note="Per monday.com's published platform security documentation"
        />
      </SettingsCard>

      <SettingsCard title="Data Retention">
        <SettingsRow label="Sourcing events" value="Until manually deleted, or automatically on app uninstall" />
        <SettingsRow label="Supplier quotes" value="Until manually deleted, or automatically on app uninstall" />
        <SettingsRow label="Award scenarios" value="Until manually deleted, or automatically on app uninstall" />
        <SettingsRow label="File attachments" value="Until manually deleted, or automatically on app uninstall" />
        <SettingsRow label="Audit log" value="Retained indefinitely — including after a tenant data deletion, as the accountability record that the deletion happened" />
      </SettingsCard>

      <SettingsCard title="Supplier Portal Privacy">
        <SettingsRow label="Supplier data isolation" value={<StatusBadge ok={true} trueLabel="Active" />} note="Suppliers see only their own submissions" />
        <SettingsRow label="Target price visibility" value={<StatusBadge ok={false} trueLabel="Visible" falseLabel="Hidden from suppliers" />} />
        <SettingsRow label="Competitor bids" value={<StatusBadge ok={false} trueLabel="Visible" falseLabel="Hidden from suppliers" />} />
        <SettingsRow label="Internal buyer notes" value={<StatusBadge ok={false} trueLabel="Visible" falseLabel="Hidden from suppliers" />} />
      </SettingsCard>

      <SettingsCard title="Your Data">
        <SettingsRow
          label="Export all tenant data"
          note="Downloads a JSON file with every invitation, quote, comparison, award, attachment record, setting, and audit event Ariavel stores for your organization"
          value={<button className="secondary-button" disabled={!apiClient || exporting} onClick={handleExport}>{exporting ? 'Exporting…' : 'Export data'}</button>}
        />
        <SettingsRow
          label="Delete all tenant data"
          note='Permanently deletes everything above. Cannot be undone. Type "DELETE MY TENANT DATA" to confirm.'
          value={
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="settings-input" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE MY TENANT DATA" aria-label="Deletion confirmation phrase" />
              <button className="secondary-button danger" disabled={!apiClient || deleting || deleteConfirm !== 'DELETE MY TENANT DATA'} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          }
        />
      </SettingsCard>

      <SettingsCard title="GDPR / Compliance">
        <SettingsRow label="Personal data processed" value="monday.com user IDs, supplier contact names and emails" />
        <SettingsRow
          label="Data processing relationship"
          value="See your organization's Data Processing Agreement with monday.com"
          note="Specific legal entity, jurisdiction, and DPA terms are a legal/contractual matter, not something this settings page can assert"
        />
        <SettingsRow label="Audit log export" value="CSV export available from the event Activity tab" />
        <SettingsRow label="Uninstall / deauthorization" value="Automated — Ariavel-owned tenant data is deleted when the app is uninstalled" />
      </SettingsCard>
    </div>
  );
}

function BillingSection() {
  return (
    <div className="settings-section">
      <SettingsCard title="Current Plan">
        <SettingsRow label="Plan" value={<span className="settings-badge badge-info">Development Preview</span>} />
        <SettingsRow label="All features" value={<StatusBadge ok={true} trueLabel="Enabled" />} note="All features are enabled during development and marketplace review" />
        <SettingsRow label="Seat count" value="Unlimited (preview)" />
        <SettingsRow label="Events per month" value="Unlimited (preview)" />
      </SettingsCard>

      <SettingsCard title="Included Features">
        {[
          'Supplier Master',
          'Sourcing Events (RFQs)',
          'Supplier Invitations',
          'Supplier Portal',
          'Bid Comparison & FX Normalization',
          'Commercial Evaluation',
          'Award Workspace',
          'Audit Log',
          'Document Attachments',
          'CSV Quote Import',
        ].map(f => (
          <div key={f} className="settings-feature-row">
            <span className="settings-feature-check" aria-hidden="true">✓</span>
            <span>{f}</span>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard title="Monetization">
        <p className="settings-helper">Billing and plan management will be available after Marketplace submission. Enterprise pricing contact details will be published here once finalized — this is a Development Preview.</p>
      </SettingsCard>
    </div>
  );
}
