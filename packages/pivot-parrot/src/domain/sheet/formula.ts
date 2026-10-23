/**
 * Excel's point mode on a formula's text: where a reference may be picked
 * with the mouse or the arrow keys, and which cells a formula reads.
 */

import { cellAddress } from './sheet';

export interface Cell { x: number; y: number }

/** A rectangle of cells, corners included, x0 <= x1 and y0 <= y1. */
export interface CellRange { x0: number; y0: number; x1: number; y1: number }

const REF = '\\$?[A-Za-z]{1,3}\\$?[1-9][0-9]*';
const RANGE = `${REF}(?::${REF})?`;
/** What a reference may follow: the "=", an operator, an opening parenthesis, an argument separator, a range colon. */
const REF_MAY_FOLLOW = /[=+\-*/^&<>(,;:]\s*$/;
const REF_AT_END = new RegExp(`(${RANGE})$`);
const PART_OF_A_TOKEN = /[A-Za-z0-9_$.:!"]/;

function cellFrom(column: string, row: string): Cell {
  const x = [...column.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { x, y: Number(row) - 1 };
}

export function spanOf(a: Cell, b: Cell): CellRange {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** "B3" for one cell, "B3:H7" for a range. */
export function rangeAddress(r: CellRange): string {
  const a = cellAddress(r.x0, r.y0);
  return r.x0 === r.x1 && r.y0 === r.y1 ? a : `${a}:${cellAddress(r.x1, r.y1)}`;
}

function insideText(text: string, end: number): boolean {
  return (text.slice(0, end).split('"').length - 1) % 2 === 1;
}

/**
 * The part of a formula a picked reference replaces, as [start, end) ending at
 * the caret: empty where a new reference may go, or the reference right before
 * the caret when that one sits where a reference may go (a click or an arrow key
 * moves it). Null when the text is no formula or the caret is not at such a place.
 */
export function referenceSlot(text: string, caret: number): [number, number] | null {
  if (!text.startsWith('=') || caret < 1 || insideText(text, caret)) return null;
  if (caret < text.length && PART_OF_A_TOKEN.test(text[caret])) return null;
  const before = text.slice(0, caret);
  const ref = REF_AT_END.exec(before);
  if (ref && REF_MAY_FOLLOW.test(before.slice(0, ref.index))) return [ref.index, caret];
  return REF_MAY_FOLLOW.test(before) ? [caret, caret] : null;
}

/** The text with `slot` replaced by `address`, and the caret right after it. */
export function putReference(text: string, slot: [number, number], address: string): { text: string; caret: number } {
  return { text: text.slice(0, slot[0]) + address + text.slice(slot[1]), caret: slot[0] + address.length };
}

/** The cells and ranges a formula reads, in order of appearance; text in quotes and function names are skipped. */
export function formulaReferences(text: string): CellRange[] {
  if (!text.startsWith('=')) return [];
  const found: CellRange[] = [];
  const pattern = new RegExp(`(\\$?([A-Za-z]{1,3})\\$?([0-9]+))(?::\\$?([A-Za-z]{1,3})\\$?([0-9]+))?`, 'g');
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    const end = m.index + m[0].length;
    const prev = text[m.index - 1] ?? '';
    const next = text[end] ?? '';
    if (/[A-Za-z0-9_.!]/.test(prev) || /[A-Za-z0-9_(!]/.test(next) || insideText(text, m.index)) continue;
    if (Number(m[3]) < 1 || (m[5] !== undefined && Number(m[5]) < 1)) continue;
    const a = cellFrom(m[2], m[3]);
    found.push(spanOf(a, m[4] ? cellFrom(m[4], m[5]) : a));
  }
  return found;
}

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** One cell further in the arrow's direction, kept inside the sheet. */
export function step(cell: Cell, key: ArrowKey, cols: number, rows: number): Cell {
  const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  return { x: Math.min(Math.max(cell.x + dx, 0), cols - 1), y: Math.min(Math.max(cell.y + dy, 0), rows - 1) };
}
