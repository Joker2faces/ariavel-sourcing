import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared keyboard/focus behavior for any modal dialog (the shared Modal
// component, plus the bespoke drawers that can't use it directly because
// they own their own header/close-button markup): Escape closes, Tab/
// Shift+Tab cycle only within the dialog, and focus returns to whatever
// had it before the dialog opened.
export function useModalA11y(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Don't steal focus if something inside already claimed it (e.g. a
    // field with autoFocus) — only ensure focus lands somewhere inside.
    if (ref.current && !ref.current.contains(document.activeElement)) {
      ref.current.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;

      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !ref.current.contains(active)) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last || !ref.current.contains(active)) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}
