import { useLayoutEffect, RefObject } from 'react';

/**
 * Pins a position:fixed element to viewport coordinates (e.g. a context
 * menu at clientX/clientY) even when an ancestor re-roots fixed
 * positioning. Hosts like JupyterLab use CSS containment/transforms on
 * their containers, which makes fixed left/top resolve against that
 * ancestor instead of the viewport — the element lands far from the
 * cursor. Render at the intended coordinates, measure where the element
 * actually ended up, and shift by the difference.
 */
export function useFixedPosition(ref: RefObject<HTMLElement>, x: number, y: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(x) || !Number.isFinite(y)) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const rect = el.getBoundingClientRect();
    const dx = x - rect.left;
    const dy = y - rect.top;
    if (dx || dy) {
      el.style.left = `${x + dx}px`;
      el.style.top = `${y + dy}px`;
    }
  }, [ref, x, y]);
}
