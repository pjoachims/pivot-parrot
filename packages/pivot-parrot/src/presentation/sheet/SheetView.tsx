import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jspreadsheet from 'jspreadsheet-ce';
import 'jsuites/dist/jsuites.css';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jspreadsheet-ce/dist/jspreadsheet.themes.css';
import './sheet.css';
import type { PivotGrid } from '../../application/utils/export';
import {
  cellAddress,
  composeSheet,
  editCell,
  inPivot,
  pivotCellStyle,
  pivotRange,
  summarize,
  type SheetCells
} from '../../domain/sheet/sheet';
import {
  formulaReferences,
  putReference,
  rangeAddress,
  referenceSlot,
  spanOf,
  step,
  type ArrowKey,
  type Cell
} from '../../domain/sheet/formula';
import { completionName, functionMatches, functionSlot, toEngineFormula, type SheetFunction } from '../../domain/sheet/functions';

export interface SheetViewProps {
  /** The pivot's visual layout, written read-only from A1. */
  grid: PivotGrid;
  /** The user's cells by A1 address. */
  cells: SheetCells;
  onCellsChange: (cells: SheetCells) => void;
  /** Opens or closes a row group, by its expansion key (the ⊞/⊟ in front of its label). */
  onToggle?: (key: string) => void;
  /** Opens or closes a column group, by its columnPathKey (the ⊞/⊟ in front of its header). */
  onToggleColumn?: (key: string) => void;
  /** Right-click on a ⊞/⊟: the group's axis and key, a row group's level, and where the menu opens. */
  onToggleMenu?: (toggle: { axis: 'row' | 'column'; key: string; depth: number; x: number; y: number }) => void;
  locale?: string;
}

const SPARE_COLS = 8;
const SPARE_ROWS = 30;
const MIN_COLS = 26;
const MIN_ROWS = 60;

type Worksheet = any;

interface Rect { x0: number; y0: number; x1: number; y1: number }

/** The reference last picked into the open formula editor: where it sits in the text and the cells it names. */
interface Pick { slot: [number, number]; anchor: Cell; active: Cell }

/** A formula being typed in the cell editor or the formula bar, with its caret: the function list follows it. */
interface Typing { where: 'cell' | 'bar'; text: string; caret: number }

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
/** One colour per reference of the formula being looked at, as Excel does. */
const REF_COLORS = ['#1f6feb', '#d1242f', '#8250df', '#1a7f37', '#bf3989', '#9a6700', '#0a7ea4'];

/**
 * The pivot result as a read-only range in a spreadsheet, styled by area, with the
 * user's own cells and formulas around it. Loaded on demand, so the table mode
 * never pays for the spreadsheet library.
 */
export default function SheetView({ grid, cells, onCellsChange, onToggle, onToggleColumn, onToggleMenu, locale = 'en-US' }: SheetViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<Worksheet>(null);
  const range = useMemo(() => pivotRange(grid), [grid]);
  const { covered } = useMemo(() => composeSheet(range, cells), [range, cells]);

  // jspreadsheet's callbacks outlive renders; they read the current values from refs.
  const rangeRef = useRef(range);
  const cellsRef = useRef(cells);
  const onCellsChangeRef = useRef(onCellsChange);
  onCellsChangeRef.current = onCellsChange;
  const onToggleRef = useRef({ row: onToggle, column: onToggleColumn });
  onToggleRef.current = { row: onToggle, column: onToggleColumn };
  const onToggleMenuRef = useRef(onToggleMenu);
  onToggleMenuRef.current = onToggleMenu;
  // The cells this sheet itself reported: getting them back as props needs no rewrite.
  const emittedRef = useRef<SheetCells | null>(null);
  const writingRef = useRef(false);

  const [selection, setSelection] = useState<Rect | null>(null);
  const [draft, setDraft] = useState('');
  const [revision, setRevision] = useState(0);
  // The text of the open cell editor, while one is open.
  const [editText, setEditText] = useState<string | null>(null);
  const pickRef = useRef<Pick | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [highlight, setHighlight] = useState(0);

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
    const labelColumns = range.colKinds.filter(kind => kind === 'label').length;

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

      const style = pivotCellStyle(rangeRef.current, x, y);
      if (!style) return;
      td.dataset.role = style.role;
      td.classList.toggle('pp-rule-top', style.ruleTop);
      td.classList.toggle('pp-rule-left', style.ruleLeft);
      const withToggle = (axis: 'row' | 'column', group: { key: string; open: boolean }, label: string, depth = 0) => {
        const toggle = document.createElement('span');
        toggle.className = 'pp-sheet-toggle';
        toggle.dataset.toggle = group.key;
        toggle.dataset.axis = axis;
        toggle.dataset.depth = String(depth);
        toggle.textContent = group.open ? '⊟' : '⊞';
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('aria-expanded', String(group.open));
        toggle.setAttribute('aria-label', `${group.open ? 'Collapse' : 'Expand'} ${label}`);
        td.replaceChildren(toggle, label);
      };
      const { columnGroups, rowGroups, rowKinds, colKinds } = rangeRef.current;
      const columnGroup = columnGroups.get(cellAddress(x, y));
      if (columnGroup) return withToggle('column', columnGroup, String(value));
      const row = rowKinds[y];
      if (colKinds[x] !== 'label' || !row || (row.kind !== 'item' && row.kind !== 'subtotal')) return;
      // In the one label column of the compact form, the label's depth as an indent (its leading spaces collapse in HTML).
      const label = String(value).trimStart();
      if (labelColumns === 1) td.style.paddingLeft = `${4 + row.depth * 16}px`;
      const rowGroup = rowGroups.get(cellAddress(x, y));
      // A row group's level: its depth in the compact form, its label column in the others.
      if (rowGroup) withToggle('row', rowGroup, label, labelColumns === 1 ? row.depth : x);
      else td.textContent = label;
    };

    writingRef.current = true;
    // A rebuild (a toggled group, a new result) keeps the scroll position.
    const scroll = wsRef.current?.content ? { left: wsRef.current.content.scrollLeft, top: wsRef.current.content.scrollTop } : null;
    // jspreadsheet.destroy finds nothing to destroy on a v5 root, so a rebuild starts on a fresh element.
    host.replaceChildren();
    const el = host.appendChild(document.createElement('div'));
    const ws = (jspreadsheet as any)(el, {
      worksheets: [{
        data,
        minDimensions: [width, data.length],
        defaultColWidth: 110,
        columns: Array.from({ length: width }, (_, x) => ({ width: range.colKinds[x] !== 'label' ? 96 : labelColumns === 1 ? 180 : 140, render })),
        tableOverflow: true,
        tableHeight: '100%',
        tableWidth: '100%',
        columnSorting: false,
        columnDrag: false,
        rowDrag: false,
        allowInsertColumn: false,
        allowDeleteColumn: false,
        allowInsertRow: false,
        allowDeleteRow: false,
        // Upper-cases a formula outside its double-quoted text on entry, like Excel; its
        // reference pattern is upper case only, so =c25/c21 would not compute. Off unless set.
        secureFormulas: true
      }],
      contextMenu: () => [],
      onbeforeformula: (_ws: Worksheet, expression: string) => toEngineFormula(expression),
      oneditionstart: () => {
        pickRef.current = null;
        // The editor element is created right after this event.
        setTimeout(() => setEditText(editorOf(wsRef.current)?.value ?? null));
      },
      oneditionend: () => {
        pickRef.current = null;
        setEditText(null);
        setTyping(null);
      },
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
    if (scroll && ws.content) {
      ws.content.scrollLeft = scroll.left;
      ws.content.scrollTop = scroll.top;
    }
    wsRef.current = ws;
    writingRef.current = false;
    setRevision(r => r + 1);
  }, [range, cells]);

  useEffect(() => () => {
    hostRef.current?.replaceChildren();
    wsRef.current = null;
  }, []);

  // Point mode: while the cell editor holds a formula and the caret sits where a
  // reference may go, a click or an arrow key puts a cell's address there, shift
  // a range. Jspreadsheet itself would close the editor on a click and ignore arrows.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const put = (input: HTMLInputElement | HTMLTextAreaElement, slot: [number, number], anchor: Cell, active: Cell) => {
      const { text, caret } = putReference(input.value, slot, rangeAddress(spanOf(anchor, active)));
      input.value = text;
      input.setSelectionRange(caret, caret);
      pickRef.current = { slot: [slot[0], caret], anchor, active };
      setEditText(text);
    };
    // The open pick, if the slot is still the one it filled (typing an operator starts a new one).
    const openPick = (slot: [number, number]) => {
      const pick = pickRef.current;
      return pick && pick.slot[0] === slot[0] && pick.slot[1] === slot[1] ? pick : null;
    };
    const slotOf = (input: HTMLInputElement | HTMLTextAreaElement) =>
      referenceSlot(input.value, input.selectionStart ?? input.value.length);

    const onMouseDown = (e: MouseEvent) => {
      const ws = wsRef.current;
      const input = editorOf(ws);
      // A group toggle opens or closes it; while the cell editor is open, a click on it is a click on its cell.
      const toggle = (e.target as Element).closest?.('.pp-sheet-toggle') as HTMLElement | null;
      if (toggle && !input) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onToggleRef.current[toggle.dataset.axis as 'row' | 'column']?.(toggle.dataset.toggle!);
        return;
      }
      const td = (e.target as Element).closest?.('td[data-x][data-y]') as HTMLTableCellElement | null;
      if (!input || !td || td.contains(input)) return;
      const slot = slotOf(input);
      if (!slot) return;
      e.preventDefault();
      e.stopPropagation();
      const cell = { x: Number(td.dataset.x), y: Number(td.dataset.y) };
      const pick = openPick(slot);
      put(input, slot, e.shiftKey && pick ? pick.anchor : cell, cell);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const ws = wsRef.current;
      const input = editorOf(ws);
      if (!input || e.target !== input || listKeyRef.current(e)) return;
      if (!ARROWS.has(e.key)) return;
      const slot = slotOf(input);
      if (!slot) return;
      e.preventDefault();
      e.stopPropagation();
      const pick = openPick(slot);
      const from = pick?.active ?? { x: Number(ws.edition[2]), y: Number(ws.edition[3]) };
      const width = ws.options.data[0]?.length ?? 1;
      const to = step(from, e.key as ArrowKey, width, ws.options.data.length);
      put(input, slot, e.shiftKey ? (pick?.anchor ?? from) : to, to);
    };
    const onInput = (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input !== editorOf(wsRef.current)) return;
      setEditText(input.value);
      follow('cell', input);
    };
    const onContextMenu = (e: MouseEvent) => {
      const toggle = (e.target as Element).closest?.('.pp-sheet-toggle') as HTMLElement | null;
      if (!toggle || !onToggleMenuRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const { axis, toggle: key, depth } = toggle.dataset;
      onToggleMenuRef.current({ axis: axis as 'row' | 'column', key: key!, depth: Number(depth), x: e.clientX, y: e.clientY });
    };
    host.addEventListener('mousedown', onMouseDown, true);
    host.addEventListener('keydown', onKeyDown, true);
    host.addEventListener('input', onInput, true);
    host.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      host.removeEventListener('contextmenu', onContextMenu, true);
      host.removeEventListener('mousedown', onMouseDown, true);
      host.removeEventListener('keydown', onKeyDown, true);
      host.removeEventListener('input', onInput, true);
    };
  }, []);

  // The function list: the functions whose name starts with the partial name before the caret.
  const completion = useMemo(() => {
    const slot = typing && functionSlot(typing.text, typing.caret);
    if (!typing || !slot) return null;
    const prefix = typing.text.slice(slot[0], slot[1]);
    const matches = functionMatches(prefix);
    return matches.length > 0 ? { ...typing, slot, prefix, matches } : null;
  }, [typing]);

  function follow(where: Typing['where'], input: HTMLInputElement | HTMLTextAreaElement) {
    setTyping({ where, text: input.value, caret: input.selectionStart ?? input.value.length });
    setHighlight(0);
  }

  function accept(f: SheetFunction) {
    const input = completion?.where === 'cell' ? editorOf(wsRef.current) : barRef.current;
    if (!completion || !input) return;
    const { text, caret } = putReference(completion.text, completion.slot, `${completionName(f, completion.prefix)}(`);
    input.value = text;
    input.focus();
    input.setSelectionRange(caret, caret);
    if (completion.where === 'cell') setEditText(text);
    else setDraft(text);
    follow(completion.where, input);
  }

  /** Up, Down, Tab, Enter and Escape act on the open list and go no further; true when one did. */
  function listKey(e: KeyboardEvent | React.KeyboardEvent): boolean {
    if (!completion) return false;
    const last = completion.matches.length - 1;
    if (e.key === 'ArrowDown') setHighlight(h => Math.min(h + 1, last));
    else if (e.key === 'ArrowUp') setHighlight(h => Math.max(h - 1, 0));
    else if (e.key === 'Tab' || e.key === 'Enter') accept(completion.matches[highlight]);
    else if (e.key === 'Escape') setTyping(null);
    else {
      // The caret moves away from the name; the list would no longer match it.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setTyping(null);
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  const listKeyRef = useRef(listKey);
  listKeyRef.current = listKey;

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

  // The references of the formula being edited, or else of the selected formula cell, outlined in colour.
  const shownFormula = editText ?? (active && !activeIsPivot && draft.startsWith('=') ? draft : null);
  const references = useMemo(() => formulaReferences(shownFormula ?? ''), [shownFormula]);
  const content: HTMLElement | null = wsRef.current?.content ?? null;
  const outlines = content && references.length > 0 ? references.flatMap((r, i) => {
    const first = wsRef.current.getCellFromCoords(r.x0, r.y0) as HTMLElement | null;
    const last = wsRef.current.getCellFromCoords(r.x1, r.y1) as HTMLElement | null;
    if (!first || !last) return [];
    const base = content.getBoundingClientRect();
    const a = first.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    const colorIndex = references.findIndex(other => rangeAddress(other) === rangeAddress(r));
    return [(
      <div
        key={i}
        className="pp-sheet-ref"
        data-ref={rangeAddress(r)}
        style={{
          left: a.left - base.left + content.scrollLeft,
          top: a.top - base.top + content.scrollTop,
          width: b.right - a.left,
          height: b.bottom - a.top,
          borderColor: REF_COLORS[colorIndex % REF_COLORS.length]
        }}
      />
    )];
  }) : null;

  // Under the edited cell, or under the formula bar.
  const listAnchor = completion && (completion.where === 'cell' ? wsRef.current?.edition?.[0] : barRef.current) as HTMLElement | null;
  const rootBox = rootRef.current?.getBoundingClientRect();
  const anchorBox = listAnchor?.getBoundingClientRect();
  const functionList = completion && rootBox && anchorBox && (
    <div
      className="pp-menu pp-sheet-functions"
      role="listbox"
      aria-label="Functions"
      style={{ left: anchorBox.left - rootBox.left, top: anchorBox.bottom - rootBox.top + 2 }}
      // Keeps the focus in the editor, and keeps jspreadsheet from closing it as a click outside.
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {completion.matches.map((f, i) => {
        const name = completionName(f, completion.prefix);
        const other = name === f.name ? f.de : f.name;
        return (
          <div
            key={f.name}
            role="option"
            aria-selected={i === highlight}
            className="pp-menu-item pp-sheet-function"
            ref={i === highlight ? el => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => accept(f)}
          >
            <span className="pp-sheet-function-name">{name}{other && <span className="pp-hint"> {other}</span>}</span>
            <span className="pp-sheet-function-text">
              <span className="pp-sheet-function-args">{name}({f.args})</span>
              <span className="pp-hint">{f.description}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  const commitDraft = () => {
    const ws = wsRef.current;
    if (!ws || !active || activeIsPivot) return;
    ws.setValueFromCoords(active.x, active.y, draft);
  };

  return (
    <div ref={rootRef} className="pp-sheet">
      <div className="pp-sheet-formula-bar">
        <span className="pp-sheet-name-box" aria-label="Cell">{active ? cellAddress(active.x, active.y) : ''}</span>
        <span className="pp-sheet-fx" aria-hidden="true">fx</span>
        <input
          aria-label="Formula"
          value={draft}
          readOnly={activeIsPivot}
          title={activeIsPivot ? 'Pivot result: read-only' : 'Type a value or a formula, e.g. =B2/B5'}
          ref={barRef}
          onChange={e => {
            setDraft(e.target.value);
            follow('bar', e.target);
          }}
          onBlur={() => setTyping(null)}
          onKeyDown={e => {
            if (listKey(e)) return;
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setRevision(r => r + 1);
          }}
        />
      </div>
      <div ref={hostRef} className="pp-sheet-grid" />
      {content && outlines && createPortal(outlines, content)}
      {functionList}
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

/** The input of the worksheet's open cell editor. */
function editorOf(ws: Worksheet): HTMLInputElement | HTMLTextAreaElement | null {
  const el = ws?.edition?.[0]?.children?.[0];
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
}
