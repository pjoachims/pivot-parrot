import { useEffect } from 'react';

type ClickOutsideTarget = React.RefObject<HTMLElement> | string | string[];

/**
 * Fires `onOutside` on a mousedown outside of `target`.
 * `target` is either a ref (contains-based check, e.g. Popover) or one/more
 * CSS selectors (closest-based check, e.g. menu-button + menu-panel pairs).
 */
export function useClickOutside(target: ClickOutsideTarget, onOutside: () => void) {
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const el = e.target as HTMLElement;

      if (typeof target === 'string' || Array.isArray(target)) {
        const selectors = Array.isArray(target) ? target : [target];
        if (selectors.some((selector) => el.closest(selector))) return;
      } else if (target.current && target.current.contains(el)) {
        return;
      }

      onOutside();
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOutside, JSON.stringify(typeof target === 'string' || Array.isArray(target) ? target : null)]);
}
