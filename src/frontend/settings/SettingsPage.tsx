import type { RuntimeCapabilities } from '../../backend/runtime/runtimeCapabilities';

interface Props {
  capabilities: RuntimeCapabilities;
  serverBaseUrl: string;
  serverAvailable: boolean;
}

export function SettingsPage({ capabilities, serverBaseUrl, serverAvailable }: Props) {
  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-section">
        <h2>Server Connection</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Backend URL</span>
            <span className="settings-value">{serverBaseUrl || '(not configured)'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Status</span>
            <span className={`settings-status ${serverAvailable ? 'available' : 'unavailable'}`}>
              {serverAvailable ? '✓ Connected' : '✗ Not reachable'}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>Your Permissions</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">View suppliers</span>
            <span className="settings-value">{capabilities.canViewSuppliers ? 'Yes' : 'No'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Edit suppliers</span>
            <span className="settings-value">{capabilities.canEditAriavelSuppliers ? 'Yes' : 'No'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Configure supplier source</span>
            <span className="settings-value">{capabilities.canConfigureSupplierSource ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>About</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Application</span>
            <span className="settings-value">Ariavel Sourcing</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Milestone</span>
            <span className="settings-value">M5 — Supplier Invitations &amp; Portal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
