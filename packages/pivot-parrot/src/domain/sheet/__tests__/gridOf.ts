import type { CsvCell } from '../../query/utils/csv';
import type { PivotGrid } from '../../../application/utils/export';

/** A flat pivot grid for tests: a header row, member rows, a last "Grand Total" row; a label column, then values. */
export function gridOf(cells: CsvCell[][]): PivotGrid {
  return {
    cells,
    rows: cells.map((row, y) => y === 0 ? { kind: 'header' } : row[0] === 'Grand Total' ? { kind: 'total' } : { kind: 'item', depth: 0 }),
    columns: (cells[0] ?? []).map((_, x) => x === 0 ? 'label' : 'value'),
    rowGroups: [],
    columnGroups: []
  };
}
