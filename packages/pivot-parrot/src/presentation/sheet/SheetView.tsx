import React, { useEffect, useMemo, useRef, useState } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import 'jsuites/dist/jsuites.css';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import './sheet.css';
import type { CsvCell } from '../../domain/query/utils/csv';
import {
  cellAddress,
  composeSheet,
  editCell,
  inPivot,
  pivotRange,
  summarize,
  type SheetCells
} from '../../domain/sheet/sheet';

export interface SheetViewProps {
  /** The pivot's visual layout, written read-only from A1. */
  grid: CsvCell[][];
  /** The user's cells by A1 address. */
  cells: SheetCells;
  onCellsChange: (cells: SheetCells) => void;
  locale?: string;
}

const SPARE_COLS = 8;
const SPARE_ROWS = 30;
const MIN_COLS = 26;
const MIN_ROWS = 60;

type Worksheet = any;

interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * The pivot result as a greyed, read-only range in a spreadsheet, with the
 * user's own cells and formulas around it. Loaded on demand, so the table mode
 * never pays for the spreadsheet library.
 */
export default function SheetView({ grid, cells, onCellsChange, locale = 'en-US' }: SheetViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Worksheet>(null);
  const range = useMemo(() => pivotRange(grid), [grid]);
  const { covered } = useMemo(() => composeSheet(range, cells), [range, cells]);

  // jspreadsheet's callbacks outlive renders; they read the current values from refs.
  const rangeRef = useRef(range);
  const cellsRef = useRef(cells);
  const onCellsChangeRef = useRef(onCellsChange);
  onCellsChangeRef.current = onCellsChange;
  // The cells this sheet itself reported: getting them back as props needs no rewrite.
  const emittedRef = useRef<SheetCells | null>(null);
  const writingRef = useRef(false);

  const [selection, setSelection] = useState<Rect | null>(null);
  const [draft, setDraft] = useState('');
  const [revision, setRevision] = useState(0);

  const format = useMemo(() => {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
    const formula = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
    return { number, percent, formula };
  }, [locale]);
  const formatRef = useRef(format);
  formatRef.current = format;

  // (Re)build the worksheet when the pivot result changes or cells arrive from outside (a loaded view).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (wsRef.current && range === rangeRef.current && cells === emittedRef.current) return;
    rangeRef.current = range;
    cellsRef.current = cells;
    emittedRef.current = cells;

    const { data } = composeSheet(range, cells, Math.max(MIN_COLS, range.cols + SPARE_COLS), Math.max(MIN_ROWS, range.rows + SPARE_ROWS));
    const width = data[0]?.length ?? MIN_COLS;

    // Numbers stay raw in the data (formulas read them); only their display is formatted.
    // A formula's result is already in the cell when this runs, so it is formatted too and kept in data-raw.
    // Like a spreadsheet, numbers align right and text left.
    const render = (td: HTMLTableCellElement, value: unknown, x: number, y: number) => {
      const f = formatRef.current;
      let numeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
      if (typeof value === 'number' && inPivot(rangeRef.current, x, y)) {
        td.textContent = rangeRef.current.percent.has(cellAddress(x, y)) ? f.percent.format(value) : f.number.format(value);
      } else if (typeof value === 'string' && value.startsWith('=')) {
        const result = td.textContent === '' ? NaN : Number(td.textContent);
        numeric = Number.isFinite(result);
        if (numeric) {
          td.dataset.raw = String(result);
          td.textContent = f.formula.format(result);
        } else {
          delete td.dataset.raw;
        }
      }
      td.style.textAlign = numeric ? 'right' : 'left';
    };

    writingRef.current = true;
    // jspreadsheet.destroy finds nothing to destroy on a v5 root, so a rebuild starts on a fresh element.
    host.replaceChildren();
    const el = host.appendChild(document.createElement('div'));
    const ws = (jspreadsheet as any)(el, {
      worksheets: [{
        data,
        minDimensions: [width, data.length],
        defaultColWidth: 110,
        columns: Array.from({ length: width }, (_, x) => ({ width: x === 0 ? 180 : 96, render })),
        tableOverflow: true,
        tableHeight: '100%',
        tableWidth: '100%',
        columnSorting: false,
        columnDrag: false,
        rowDrag: false,
        allowInsertColumn: false,
        allowDeleteColumn: false,
        allowInsertRow: false,
        allowDeleteRow: false
      }],
      contextMenu: () => [],
      onchange: (_ws: Worksheet, _td: HTMLTableCellElement, x: string | number, y: string | number, value: unknown) => {
        if (writingRef.current) return;
        const next = editCell(rangeRef.current, cellsRef.current, cellAddress(Number(x), Number(y)), value == null ? '' : String(value));
        if (next === cellsRef.current) return;
        cellsRef.current = next;
        emittedRef.current = next;
        onCellsChangeRef.current(next);
        setRevision(r => r + 1);
      },
      onselection: (_ws: Worksheet, x0: number, y0: number, x1: number, y1: number) => {
        setSelection({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
      }
    })[0];
    for (let y = 0; y < range.rows; y++) {
      for (let x = 0; x < range.cols; x++) ws.setReadOnly(cellAddress(x, y), true);
    }
    wsRef.current = ws;
    writingRef.current = false;
    setRevision(r => r + 1);
  }, [range, cells]);

  useEffect(() => () => {
    hostRef.current?.replaceChildren();
    wsRef.current = null;
  }, []);

  const active = selection ? { x: selection.x0, y: selection.y0 } : null;
  const activeIsPivot = !!active && inPivot(range, active.x, active.y);

  useEffect(() => {
    const ws = wsRef.current;
    if (!active || !ws) return setDraft('');
    const raw = activeIsPivot ? range.values[active.y]?.[active.x] : ws.getValueFromCoords(active.x, active.y, false);
    setDraft(raw == null ? '' : String(raw));
  }, [active?.x, active?.y, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const ws = wsRef.current;
    if (!selection || !ws) return null;
    const values: unknown[] = [];
    for (let y = selection.y0; y <= selection.y1; y++) {
      for (let x = selection.x0; x <= selection.x1; x++) {
        values.push(inPivot(range, x, y) ? range.values[y]?.[x] : ws.getCellFromCoords(x, y)?.dataset.raw ?? ws.getValueFromCoords(x, y, true));
      }
    }
    return summarize(values);
  }, [selection, range, revision]); // eslint-disable-line react-hooks/exhaustive-deps -- revision: a typed cell changed in the worksheet

  const commitDraft = () => {
    const ws = wsRef.current;
    if (!ws || !active || activeIsPivot) return;
    ws.setValueFromCoords(active.x, active.y, draft);
  };

  return (
    <div className="pp-sheet">
      <div className="pp-sheet-formula-bar">
        <span className="pp-sheet-name-box" aria-label="Cell">{active ? cellAddress(active.x, active.y) : ''}</span>
        <span className="pp-sheet-fx" aria-hidden="true">fx</span>
        <input
          aria-label="Formula"
          value={draft}
          readOnly={activeIsPivot}
          title={activeIsPivot ? 'Pivot result: read-only' : 'Type a value or a formula, e.g. =B2/B5'}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setRevision(r => r + 1);
          }}
        />
      </div>
      <div ref={hostRef} className="pp-sheet-grid" />
      <div className="pp-sheet-status" role="status">
        <span className="pp-sheet-status-note">
          {covered.length > 0
            ? `${covered.length} of your cells are under the pivot range (${covered.join(', ')}) and hidden until it shrinks`
            : `Pivot range A1:${cellAddress(Math.max(range.cols - 1, 0), Math.max(range.rows - 1, 0))} (read-only)`}
        </span>
        {summary && summary.count > 1 && (
          <span className="pp-sheet-status-stats">
            {summary.numbers > 0 && <span>Average: {format.number.format(summary.average!)}</span>}
            <span>Count: {summary.count}</span>
            {summary.numbers > 0 && <span>Sum: {format.number.format(summary.sum)}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
