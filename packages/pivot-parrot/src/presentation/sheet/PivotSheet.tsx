import React, { Suspense, lazy, useMemo } from 'react';
import PivotDisplayHeader from '../pivot-table/PivotDisplayHeader';
import { usePivotStore } from '../../application/state/store';
import { buildPivotGrid } from '../../application/utils/export';
import { computeLeafColumns } from '../../application/utils/columnHelpers';
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

  const grid = useMemo(() => {
    const rowFields = config.rows.map((f: any) => typeof f === 'string' ? f : f.id);
    const showGrandTotal = config.showGrandTotal !== false;
    return buildPivotGrid(data, computeLeafColumns(data), rowFields, true, showGrandTotal, config, dtypes, dialect);
  }, [data, config, dtypes, dialect]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PivotDisplayHeader
        data={data}
        cubeResults={cubeResults}
        config={config}
        locale={locale}
        dtypes={dtypes}
        dialect={dialect}
        onOpenSQL={onOpenSQL}
      />
      <Suspense fallback={<div className="pp-hint" style={{ padding: 'var(--space-3)' }}>Loading sheet…</div>}>
        <SheetView grid={grid} cells={sheetCells} onCellsChange={setSheetCells} locale={locale} />
      </Suspense>
    </div>
  );
}
