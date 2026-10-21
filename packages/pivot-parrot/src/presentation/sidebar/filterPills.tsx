import React, { createContext, useContext, useLayoutEffect, useState } from 'react';

/** The pills in this pivot's Filters zone by field id, so a filter dialog can sit beside its pill. */
const FilterPills = createContext<Map<string, HTMLElement> | null>(null);

export function FilterPillsProvider({ children }: { children: React.ReactNode }) {
  const [pills] = useState(() => new Map<string, HTMLElement>());
  return <FilterPills.Provider value={pills}>{children}</FilterPills.Provider>;
}

/** Ref callback that registers the pill of `fieldId`. */
export function useRegisterFilterPill() {
  const pills = useContext(FilterPills);
  return (fieldId: string) => (el: HTMLElement | null) => {
    if (!pills) return;
    if (el) pills.set(fieldId, el);
    else pills.delete(fieldId);
  };
}

/**
 * The pill of `fieldId`, or null. Read after commit: a pill added in the same
 * update as the dialog that anchors on it is not mounted while that dialog renders.
 */
export function useFilterPill(fieldId: string | null): HTMLElement | null {
  const pills = useContext(FilterPills);
  const [pill, setPill] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPill(fieldId === null ? null : pills?.get(fieldId) ?? null);
  }, [pills, fieldId]);
  return pill;
}
