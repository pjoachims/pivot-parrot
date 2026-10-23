import React, { Suspense, lazy, useCallback, useMemo } from 'react';
import PivotDisplayHeader from '../pivot-table/PivotDisplayHeader';
import { ColumnFitNotice } from '../pivot-table/PivotDisplay';
import { formatHeaderValue } from '../pivot-table/ColumnHeaders';
import { usePivotStore } from '../../application/state/store';
import { buildPivotGrid } from '../../application/utils/export';
import { computeLeafColumns } from '../../application/utils/columnHelpers';
import { displayTotals } from '../../application/utils/displayTotals';
import { columnPathKey } from '../../application/utils/cubeIndex';
import { useColumnCollapse } from '../../application/hooks/useColumnCollapse';
import type { SQLDialect } from '../../domain/query/dialects/SQLDialect';

const SheetView = lazy(() => import('./SheetView'));

interface PivotSheetProps {
  data: any;
  cubeResults: any;
  dtypes: Record<string, string>;
  dialect: SQLDialect | null;
  config: any;
  locale?: string;
  onOpenSQL: (() => void) | null;
}

/** Sheet mode: the pivot's toolbar over the spreadsheet, which is loaded on first use. */
export default function PivotSheet({ data, cubeResults, dtypes, dialect, config, locale, onOpenSQL }: PivotSheetProps) {
  const sheetCells = usePivotStore((s) => s.sheetCells);
  const setSheetCells = usePivotStore((s) => s.setSheetCells);
  // The table's open rows: a toggle in either mode changes both.
  const expanded = usePivotStore((s) => s.expanded);
  const toggleExpanded = usePivotStore((s) => s.toggleExpanded);

  // The table's column groups: a toggle here folds the same groups, under the same column limit.
  const groups: unknown[][] | undefined = data?.columnConfig?.groups;
  const columnCollapse = useColumnCollapse(groups, data?.columnFit);
  const { toggle } = columnCollapse;
  const toggleColumn = useCallback((key: string) => {
    const group = groups?.find(g => columnPathKey(g) === key);
    if (group) toggle(group);
  }, [groups, toggle]);

  // The table's totals and open groups, so both views show the same layout.
  const grid = useMemo(() => {
    const rowFields = config.rows.map((f: any) => typeof f === 'string' ? f : f.id);
    const totals = displayTotals(config);
    const leaves = computeLeafColumns(data, totals.grandTotalCol, totals.colSubtotals);
    return buildPivotGrid(data, leaves, rowFields, totals.rowSubtotals, totals.grandTotalRow, config, dtypes, dialect, expanded);
  }, [data, config, dtypes, dialect, expanded]);
  const groupName = (group: unknown[]) => group.map((m, d) => formatHeaderValue(m, data.columnConfig.colFields[d], dialect, dtypes)).join(' / ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: 'var(--text-sm)' }}>
      <PivotDisplayHeader
        data={data}
        cubeResults={cubeResults}
        config={config}
        locale={locale}
        dtypes={dtypes}
        dialect={dialect}
        onOpenSQL={onOpenSQL}
      />
      <ColumnFitNotice collapse={columnCollapse} groupName={groupName} />
      <Suspense fallback={<div className="pp-hint" style={{ padding: 'var(--space-3)' }}>Loading sheet…</div>}>
        <SheetView grid={grid} cells={sheetCells} onCellsChange={setSheetCells} onToggle={toggleExpanded} onToggleColumn={toggleColumn} locale={locale} />
      </Suspense>
    </div>
  );
}
