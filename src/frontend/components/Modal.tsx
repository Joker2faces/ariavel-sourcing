import { useRef, type ReactNode } from 'react';
import { useModalA11y } from './useModalA11y';

interface Props {
  onClose: () => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}

// Shared overlay/dialog shell — see useModalA11y for the Escape/Tab-trap/
// focus-return behavior applied to it.
export function Modal({ onClose, ariaLabel, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, onClose);

  return (
    <div className="portal-modal-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`portal-modal ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
