import { useEffect, useRef, useState } from 'react';

export interface RowAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  primaryLabel: string;
  onPrimary: () => void;
  overflow?: RowAction[];
  ariaLabelSuffix: string;
}

// Replaces the "Open  Edit  Cancel" row of equally-weighted text links
// with one clear primary action plus a labeled overflow menu — the
// pattern used consistently across Sourcing Events, Suppliers and Awards.
export function RowActions({ primaryLabel, onPrimary, overflow = [], ariaLabelSuffix }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="row-actions" ref={ref}>
      <button className="row-action-primary" aria-label={`${primaryLabel} ${ariaLabelSuffix}`} onClick={onPrimary}>{primaryLabel}</button>
      {overflow.length > 0 && (
        <div className="row-action-overflow-wrap">
          <button
            className="row-action-kebab"
            aria-label={`More actions for ${ariaLabelSuffix}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="3" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="13" r="1.4" fill="currentColor" /></svg>
          </button>
          {open && (
            <div className="row-action-menu" role="menu">
              {overflow.map(action => (
                <button
                  key={action.label}
                  role="menuitem"
                  className={`row-action-menu-item ${action.danger ? 'danger' : ''}`}
                  onClick={() => { setOpen(false); action.onClick(); }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
