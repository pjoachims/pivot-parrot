/** Which totals the pivot shows. Every view of it (table, sheet, "Visual Layout" CSV) reads them here. */
export interface DisplayTotals {
  /** A row group's own row carries its subtotal. */
  rowSubtotals: boolean;
  /** A column group gets its subtotal column. */
  colSubtotals: boolean;
  /** The grand-total row(s) at the bottom. */
  grandTotalRow: boolean;
  /** The grand-total column(s) at the right. */
  grandTotalCol: boolean;
}

type Setting = 'both' | 'row' | 'col' | 'none';

const has = (setting: Setting, axis: 'row' | 'col') => setting === 'both' || setting === axis;

/** The settings dialog's "Subtotals" and "Grand Totals" (`config.subtotals`, `config.grandTotals`, default both). */
export function displayTotals(config): DisplayTotals {
  const subtotals: Setting = config?.subtotals || 'both';
  const grandTotals: Setting = config?.grandTotals || 'both';
  return {
    rowSubtotals: has(subtotals, 'row'),
    colSubtotals: has(subtotals, 'col'),
    grandTotalRow: has(grandTotals, 'row'),
    grandTotalCol: has(grandTotals, 'col')
  };
}
