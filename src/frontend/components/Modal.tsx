import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}

// Shared overlay/dialog shell — Escape closes it, and focus moves onto the
// dialog itself on open (screen-reader users otherwise land nowhere).
export function Modal({ onClose, ariaLabel, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="portal-modal-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`portal-modal ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
