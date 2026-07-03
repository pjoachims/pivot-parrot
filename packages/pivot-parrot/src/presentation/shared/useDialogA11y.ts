import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog accessibility behavior: Escape-to-close, Tab focus trap,
 * initial focus on open, and focus restore to the previously-focused
 * element on close. Used by both BaseDialog (modal) and Popover (anchored).
 */
export function useDialogA11y(containerRef: React.RefObject<HTMLElement>, onClose: () => void) {
  // Captured during render (before the dialog is mounted/committed), so this
  // is reliably the element that was focused right before the dialog opened.
  const previouslyFocused = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null
  );

  useEffect(() => {
    const container = containerRef.current;

    // Respect an existing autoFocus inside the dialog (e.g. an input with
    // `autoFocus`) - only steal focus to the first focusable element if
    // nothing inside the dialog is focused yet.
    if (container && !container.contains(document.activeElement)) {
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable[0] || container).focus?.();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && container) {
        const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
          .filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}
