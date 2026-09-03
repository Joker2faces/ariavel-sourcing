import { useState } from 'react';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  detail: string;
  icon: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Welcome to Ariavel Sourcing',
    description: 'Your end-to-end procurement platform',
    detail: 'Ariavel Sourcing gives your team a single workspace to run RFQs, collect quotes, compare bids on a level playing field, and make confident award decisions — all inside monday.com.',
    icon: '🎯',
  },
  {
    id: 2,
    title: 'Build your supplier database',
    description: 'Manage all suppliers in one place',
    detail: 'Add suppliers manually or import from a monday.com board. Categorize, rate, and track preferred vendors. Every supplier gets a secure, shareable portal link for submitting quotes.',
    icon: '🏢',
  },
  {
    id: 3,
    title: 'Create sourcing events (RFQs)',
    description: 'Launch structured requests for quotation',
    detail: 'Define your line items, target prices, and deadlines. Invite selected suppliers with a single click — they receive a unique portal link to submit their quotes securely.',
    icon: '📋',
  },
  {
    id: 4,
    title: 'Compare bids and award',
    description: 'Make data-driven award decisions',
    detail: 'The Bid Matrix normalizes all quotes to a common currency, calculates landed costs, and scores suppliers across your evaluation criteria. Finalize your award and maintain a full audit trail.',
    icon: '🏆',
  },
];

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingFlow({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Ariavel Sourcing">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="onboarding-steps-indicator">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                className={`onboarding-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`Step ${s.id}: ${s.title}`}
                aria-current={i === step ? 'step' : undefined}
              />
            ))}
          </div>
          <button className="onboarding-skip" onClick={onSkip} aria-label="Skip introduction">
            Skip
          </button>
        </div>

        <div className="onboarding-content">
          <div className="onboarding-icon" aria-hidden="true">{current.icon}</div>
          <div className="onboarding-step-label">Step {step + 1} of {STEPS.length}</div>
          <h2 className="onboarding-title">{current.title}</h2>
          <p className="onboarding-description">{current.description}</p>
          <p className="onboarding-detail">{current.detail}</p>
        </div>

        <div className="onboarding-footer">
          {step > 0 && (
            <button className="secondary-button" onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          )}
          <button
            className="primary-button onboarding-next"
            onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
            autoFocus={step === 0}
          >
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
