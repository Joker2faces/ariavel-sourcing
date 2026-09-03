import { useState } from 'react';
import type { RuntimeCapabilities } from '../../backend/runtime/runtimeCapabilities';

interface Props {
  capabilities: RuntimeCapabilities;
  serverBaseUrl: string;
  serverAvailable: boolean;
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

export function SettingsPage({ capabilities, serverBaseUrl, serverAvailable }: Props) {
  const [active, setActive] = useState<Section>('organization');

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Configure Ariavel Sourcing for your organization.</p>
        </div>
      </div>

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
          {active === 'organization' && <OrganizationSection serverBaseUrl={serverBaseUrl} serverAvailable={serverAvailable} capabilities={capabilities} />}
          {active === 'sourcing' && <SourcingSection />}
          {active === 'comparison' && <ComparisonSection />}
          {active === 'security' && <SecuritySection capabilities={capabilities} />}
          {active === 'data' && <DataPrivacySection />}
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

function OrganizationSection({ serverBaseUrl, serverAvailable, capabilities }: { serverBaseUrl: string; serverAvailable: boolean; capabilities: RuntimeCapabilities }) {
  return (
    <div className="settings-section">
      <SettingsCard title="Backend Connection">
        <SettingsRow label="Server URL" value={<code className="settings-code">{serverBaseUrl || '(auto-provisioned by monday Code)'}</code>} />
        <SettingsRow label="Connection status" value={<StatusBadge ok={serverAvailable} trueLabel="Connected" falseLabel="Offline" />} />
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
        <SettingsRow label="Support" value={<a href="mailto:support@ariavel.com" className="settings-link">support@ariavel.com</a>} />
      </SettingsCard>
    </div>
  );
}

function SourcingSection() {
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [defaultLeadTime, setDefaultLeadTime] = useState('30');
  const [requireTargetPrice, setRequireTargetPrice] = useState(false);
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);

  return (
    <div className="settings-section">
      <SettingsCard title="RFQ Defaults">
        <SettingsRow
          label="Default base currency"
          note="Used as the comparison currency for bid normalization"
          value={
            <select
              className="settings-select"
              value={defaultCurrency}
              onChange={e => setDefaultCurrency(e.target.value)}
              aria-label="Default base currency"
            >
              {['EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CHF'].map(c => <option key={c}>{c}</option>)}
            </select>
          }
        />
        <SettingsRow
          label="Default lead time (days)"
          note="Pre-filled when creating new RFQ lines"
          value={
            <input
              type="number"
              className="settings-input"
              value={defaultLeadTime}
              min={1}
              max={365}
              onChange={e => setDefaultLeadTime(e.target.value)}
              aria-label="Default lead time in days"
            />
          }
        />
        <SettingsRow
          label="Require target price"
          note="Block RFQ creation unless all lines have a target price"
          value={
            <label className="settings-toggle" aria-label="Require target price">
              <input type="checkbox" checked={requireTargetPrice} onChange={e => setRequireTargetPrice(e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          }
        />
      </SettingsCard>

      <SettingsCard title="Event Lifecycle">
        <SettingsRow
          label="Auto-close events at deadline"
          note="Automatically transition OPEN → EVALUATING when deadline passes"
          value={
            <label className="settings-toggle" aria-label="Auto-close events at deadline">
              <input type="checkbox" checked={autoCloseEnabled} onChange={e => setAutoCloseEnabled(e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          }
        />
        <SettingsRow label="Status progression" value={
          <div className="settings-status-flow">
            {['Draft', 'Ready', 'Open', 'Evaluating', 'Awarded'].map((s, i, arr) => (
              <span key={s} className="settings-status-flow-item">
                <span className="status-chip">{s}</span>
                {i < arr.length - 1 && <span className="flow-arrow" aria-hidden="true">→</span>}
              </span>
            ))}
          </div>
        } />
      </SettingsCard>
    </div>
  );
}

function ComparisonSection() {
  const [freightPolicy, setFreightPolicy] = useState<string>('PROPORTIONAL_TO_LINE_VALUE');
  const [landedCostWeight, setLandedCostWeight] = useState(60);
  const [leadTimeWeight, setLeadTimeWeight] = useState(20);
  const [completenessWeight, setCompletenessWeight] = useState(20);

  const totalWeight = landedCostWeight + leadTimeWeight + completenessWeight;

  return (
    <div className="settings-section">
      <SettingsCard title="Freight Allocation">
        <SettingsRow
          label="Default freight policy"
          note="How freight cost is distributed across RFQ lines"
          value={
            <select
              className="settings-select"
              value={freightPolicy}
              onChange={e => setFreightPolicy(e.target.value)}
              aria-label="Default freight policy"
            >
              <option value="PROPORTIONAL_TO_LINE_VALUE">Proportional to line value</option>
              <option value="EQUAL_PER_LINE">Equal per line</option>
              <option value="MANUAL">Manual (set per supplier)</option>
            </select>
          }
        />
      </SettingsCard>

      <SettingsCard title="Evaluation Weights">
        <p className="settings-helper">Weights must sum to 100. Total: <strong className={totalWeight !== 100 ? 'settings-error-text' : ''}>{totalWeight}</strong></p>
        <SettingsRow label="Landed cost" note="Primary cost metric after FX normalization" value={
          <div className="weight-input-group">
            <input type="number" className="settings-input weight-input" value={landedCostWeight} min={0} max={100}
              onChange={e => setLandedCostWeight(Number(e.target.value))} aria-label="Landed cost weight" />
            <span>%</span>
          </div>
        } />
        <SettingsRow label="Lead time" note="Days from PO to delivery" value={
          <div className="weight-input-group">
            <input type="number" className="settings-input weight-input" value={leadTimeWeight} min={0} max={100}
              onChange={e => setLeadTimeWeight(Number(e.target.value))} aria-label="Lead time weight" />
            <span>%</span>
          </div>
        } />
        <SettingsRow label="Commercial completeness" note="Percentage of RFQ lines with full pricing" value={
          <div className="weight-input-group">
            <input type="number" className="settings-input weight-input" value={completenessWeight} min={0} max={100}
              onChange={e => setCompletenessWeight(Number(e.target.value))} aria-label="Commercial completeness weight" />
            <span>%</span>
          </div>
        } />
      </SettingsCard>

      <SettingsCard title="FX Rates">
        <SettingsRow label="Rate source" value="Manual (set per comparison snapshot)" />
        <SettingsRow label="External FX provider" value={<span className="settings-badge badge-neutral">Not configured</span>} note="Automatic rate updates require a paid provider" />
      </SettingsCard>
    </div>
  );
}

function SecuritySection({ capabilities }: { capabilities: RuntimeCapabilities }) {
  return (
    <div className="settings-section">
      <SettingsCard title="Authentication">
        <SettingsRow label="Buyer authentication" value="monday.com session token (JWT)" />
        <SettingsRow label="Supplier portal" value="HMAC-signed invitation token" />
        <SettingsRow label="Token expiry" value="48 hours (supplier portal links)" />
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
        <SettingsRow label="CORS policy" value="Origin locked to monday.com" />
      </SettingsCard>
    </div>
  );
}

function DataPrivacySection() {
  return (
    <div className="settings-section">
      <SettingsCard title="Data Storage">
        <SettingsRow label="Database" value="monday.com managed MongoDB (monday Code)" />
        <SettingsRow label="File storage" value="monday Object Storage" />
        <SettingsRow label="Data residency" value="monday.com platform region" />
        <SettingsRow label="Encryption at rest" value={<StatusBadge ok={true} trueLabel="AES-256 (platform)" />} />
        <SettingsRow label="Encryption in transit" value={<StatusBadge ok={true} trueLabel="TLS 1.2+" />} />
      </SettingsCard>

      <SettingsCard title="Data Retention">
        <SettingsRow label="Sourcing events" value="Retained indefinitely (manual delete)" />
        <SettingsRow label="Supplier quotes" value="Retained indefinitely (audit trail)" />
        <SettingsRow label="Award scenarios" value="Retained indefinitely (finalized records)" />
        <SettingsRow label="File attachments" value="Retained until manually deleted" />
        <SettingsRow label="Audit log" value="Retained indefinitely" />
      </SettingsCard>

      <SettingsCard title="Supplier Portal Privacy">
        <SettingsRow label="Supplier data isolation" value={<StatusBadge ok={true} trueLabel="Active" />} note="Suppliers see only their own submissions" />
        <SettingsRow label="Target price visibility" value={<StatusBadge ok={false} trueLabel="Visible" falseLabel="Hidden from suppliers" />} />
        <SettingsRow label="Competitor bids" value={<StatusBadge ok={false} trueLabel="Visible" falseLabel="Hidden from suppliers" />} />
        <SettingsRow label="Internal buyer notes" value={<StatusBadge ok={false} trueLabel="Visible" falseLabel="Hidden from suppliers" />} />
      </SettingsCard>

      <SettingsCard title="GDPR / Compliance">
        <SettingsRow label="Personal data processed" value="monday.com user IDs, supplier contact names" />
        <SettingsRow label="Data processor" value="monday.com Ltd. (platform DPA applies)" />
        <SettingsRow label="Data export" value="CSV export available on all entity lists" />
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
          'Award Workspace',
          'Document Attachments',
          'Excel Quote Import',
          'Audit Log',
        ].map(f => (
          <div key={f} className="settings-feature-row">
            <span className="settings-feature-check" aria-hidden="true">✓</span>
            <span>{f}</span>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard title="Monetization">
        <p className="settings-helper">Billing and plan management will be available after marketplace submission. Contact <a href="mailto:sales@ariavel.com" className="settings-link">sales@ariavel.com</a> for enterprise pricing.</p>
      </SettingsCard>
    </div>
  );
}
