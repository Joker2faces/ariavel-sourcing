import { useEffect, useState } from 'react';
import type { BuyerApiClient } from '../api/buyerApiClient';
import type { TenantSettingsInput } from '../../shared/types/tenantSettings';
import { defaultTenantSettings } from '../../shared/types/tenantSettings';
import ariavelLogo from '../../assets/ariavel-logo-optimized.png';

type Step = 0 | 1 | 2 | 3 | 4;

interface Props {
  apiClient?: BuyerApiClient | null;
  /**
   * Receives everything the buyer configured, to be persisted alongside
   * onboardingCompletedAt. `goToSupplierSource` is set when the buyer chose
   * "Set up supplier source" on the Review step — the caller is expected to
   * navigate to the Suppliers page afterward, where the existing "Configure
   * supplier source" flow (SupplierSourceDrawer, Ariavel-managed vs. an
   * existing monday board) lives. That mapping UI is deliberately NOT
   * duplicated here — see the Review step for why.
   */
  onComplete: (config: TenantSettingsInput, goToSupplierSource?: boolean) => void;
  onSkip: () => void;
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CHF'];

// A real first-run configuration wizard — it collects and persists the
// settings a buyer actually needs before running their first RFQ (company
// identity, sourcing defaults, evaluation weights), backed by the same
// TenantSettingsService the Settings page uses. Previously this was a
// read-only 4-slide marketing tour that wrote nothing but a completion
// timestamp — see docs/PROJECT_STATE.md's Final Gap Closure notes.
export function OnboardingFlow({ apiClient, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [loadingDefaults, setLoadingDefaults] = useState(true);

  const [companyDisplayName, setCompanyDisplayName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [defaultRfqDeadlineDays, setDefaultRfqDeadlineDays] = useState(30);
  const [defaultIncoterm, setDefaultIncoterm] = useState('');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('');
  const [landedCostWeight, setLandedCostWeight] = useState(60);
  const [leadTimeWeight, setLeadTimeWeight] = useState(20);
  const [completenessWeight, setCompletenessWeight] = useState(20);

  const [companyError, setCompanyError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const seed = (s: ReturnType<typeof defaultTenantSettings>) => {
      if (cancelled) return;
      setCompanyDisplayName(s.organization.companyDisplayName);
      setSupportEmail(s.organization.supportEmail);
      setDefaultCurrency(s.organization.defaultCurrency);
      setDefaultRfqDeadlineDays(s.sourcing.defaultRfqDeadlineDays);
      setDefaultIncoterm(s.sourcing.defaultIncoterm);
      setDefaultPaymentTerms(s.sourcing.defaultPaymentTerms);
      setLandedCostWeight(s.comparison.weights.landedCost);
      setLeadTimeWeight(s.comparison.weights.leadTime);
      setCompletenessWeight(s.comparison.weights.completeness);
    };
    if (!apiClient) {
      seed(defaultTenantSettings('local', new Date().toISOString()));
      setLoadingDefaults(false);
      return;
    }
    apiClient.getSettings()
      .then(seed)
      .catch(() => seed(defaultTenantSettings('local', new Date().toISOString())))
      .finally(() => { if (!cancelled) setLoadingDefaults(false); });
    return () => { cancelled = true; };
  }, [apiClient]);

  const weightTotal = landedCostWeight + leadTimeWeight + completenessWeight;
  const isLast = step === 4;

  function buildConfig(): TenantSettingsInput {
    return {
      organization: { companyDisplayName, supportEmail, defaultCurrency },
      sourcing: { defaultRfqDeadlineDays, defaultIncoterm, defaultPaymentTerms },
      comparison: { weights: { landedCost: landedCostWeight, leadTime: leadTimeWeight, completeness: completenessWeight } },
    };
  }

  function next() {
    if (step === 1 && !companyDisplayName.trim()) { setCompanyError('Enter your company name to continue.'); return; }
    setCompanyError('');
    if (isLast) { onComplete(buildConfig()); return; }
    setStep(s => (Math.min(s + 1, 4) as Step));
  }

  function finishAndConfigureSupplierSource() {
    setCompanyError('');
    onComplete(buildConfig(), true);
  }

  function back() {
    setStep(s => (Math.max(s - 1, 0) as Step));
  }

  const STEP_LABELS = ['Welcome', 'Organization', 'Sourcing defaults', 'Evaluation weights', 'Review'];

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Set up Ariavel Sourcing">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="onboarding-steps-indicator">
            {STEP_LABELS.map((label, i) => (
              <button
                key={label}
                className={`onboarding-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
                onClick={() => setStep(i as Step)}
                aria-label={`Step ${i + 1}: ${label}`}
                aria-current={i === step ? 'step' : undefined}
              />
            ))}
          </div>
          <button className="onboarding-skip" onClick={onSkip} aria-label="Skip setup">
            Skip
          </button>
        </div>

        <div className="onboarding-content">
          <div className="onboarding-step-label">Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}</div>

          {step === 0 && (
            <>
              <img src={ariavelLogo} alt="Ariavel Sourcing — Smarter Sourcing. Better Decisions." className="onboarding-brand-logo" />
              <h2 className="onboarding-title visually-hidden">Welcome to Ariavel Sourcing</h2>
              <p className="onboarding-description">Your end-to-end procurement platform</p>
              <p className="onboarding-detail">
                In the next few steps we&apos;ll set your organization details, sourcing defaults, and how bids get
                scored — so your first RFQ is ready to go the moment you finish. Everything here can be changed
                later in Settings.
              </p>
            </>
          )}

          {step === 1 && (
            <div className="onboarding-form" aria-busy={loadingDefaults}>
              <h2 className="onboarding-title">Your organization</h2>
              <p className="onboarding-description">Shown to suppliers on their invitation and portal.</p>
              <label className="onboarding-field">
                <span>Company name*</span>
                <input
                  value={companyDisplayName}
                  onChange={e => { setCompanyDisplayName(e.target.value); if (e.target.value.trim()) setCompanyError(''); }}
                  aria-invalid={companyError ? true : undefined}
                  aria-describedby={companyError ? 'onboarding-company-error' : undefined}
                  autoFocus
                />
                {companyError && <small id="onboarding-company-error" className="field-error">{companyError}</small>}
              </label>
              <label className="onboarding-field">
                <span>Support email</span>
                <input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="procurement@yourcompany.com" />
              </label>
              <label className="onboarding-field">
                <span>Default currency</span>
                <select value={defaultCurrency} onChange={e => setDefaultCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-form">
              <h2 className="onboarding-title">Sourcing defaults</h2>
              <p className="onboarding-description">Pre-filled every time you create a new sourcing event — adjust per event any time.</p>
              <label className="onboarding-field">
                <span>Default RFQ deadline (days)</span>
                <input type="number" min={1} max={365} value={defaultRfqDeadlineDays} onChange={e => setDefaultRfqDeadlineDays(Number(e.target.value))} />
              </label>
              <label className="onboarding-field">
                <span>Default Incoterm</span>
                <input value={defaultIncoterm} onChange={e => setDefaultIncoterm(e.target.value)} placeholder="e.g. FOB, DAP" />
              </label>
              <label className="onboarding-field">
                <span>Default payment terms</span>
                <input value={defaultPaymentTerms} onChange={e => setDefaultPaymentTerms(e.target.value)} placeholder="e.g. Net 30" />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-form">
              <h2 className="onboarding-title">How should bids be scored?</h2>
              <p className="onboarding-description">
                These weights drive the Bid Matrix comparison score. Must sum to 100 — total: {' '}
                <strong className={weightTotal !== 100 ? 'field-error' : ''}>{weightTotal}</strong>
              </p>
              <label className="onboarding-field onboarding-field-inline">
                <span>Landed cost</span>
                <input type="number" min={0} max={100} value={landedCostWeight} onChange={e => setLandedCostWeight(Number(e.target.value))} /> %
              </label>
              <label className="onboarding-field onboarding-field-inline">
                <span>Lead time</span>
                <input type="number" min={0} max={100} value={leadTimeWeight} onChange={e => setLeadTimeWeight(Number(e.target.value))} /> %
              </label>
              <label className="onboarding-field onboarding-field-inline">
                <span>Commercial completeness</span>
                <input type="number" min={0} max={100} value={completenessWeight} onChange={e => setCompletenessWeight(Number(e.target.value))} /> %
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="onboarding-form">
              <div className="onboarding-icon" aria-hidden="true">🏆</div>
              <h2 className="onboarding-title">You&apos;re all set</h2>
              <p className="onboarding-description">Here&apos;s what we&apos;ll save for {companyDisplayName || 'your organization'}:</p>
              <ul className="onboarding-review-list">
                <li>Currency: <strong>{defaultCurrency}</strong>{supportEmail ? `, support: ${supportEmail}` : ''}</li>
                <li>RFQ deadline default: <strong>{defaultRfqDeadlineDays} days</strong>{defaultIncoterm ? `, Incoterm: ${defaultIncoterm}` : ''}</li>
                <li>Evaluation weights: <strong>{landedCostWeight}/{leadTimeWeight}/{completenessWeight}</strong> (cost/lead time/completeness)</li>
              </ul>
              <p className="onboarding-detail">You can change any of this later from Settings.</p>
              <div className="onboarding-supplier-source-note">
                <p className="onboarding-detail">
                  One thing this wizard deliberately doesn&apos;t set up: where your suppliers come from (a new
                  Ariavel-managed list, or an existing monday board with column mapping). That has its own guided
                  flow with live board/column validation — reusing it here would mean two places to keep in sync.
                </p>
                <button type="button" className="secondary-button" onClick={finishAndConfigureSupplierSource}>
                  Finish and set up supplier source
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="onboarding-footer">
          {step > 0 && (
            <button className="secondary-button" onClick={back}>
              Back
            </button>
          )}
          <button
            className="primary-button onboarding-next"
            onClick={next}
            disabled={step === 3 && weightTotal !== 100}
          >
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
