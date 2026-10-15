/**
 * CSV Utilities
 * Handles CSV parsing and conversion for data import/export
 */

/** A percentage held as a fraction (0.1234), written as "12.34%" so Excel parses it as a percent. */
export interface CsvPercent {
  percent: number;
}

export type CsvCell = string | number | bigint | boolean | Date | CsvPercent | null | undefined;

/**
 * Excel reads a CSV with the separators of the user's locale: where the decimal
 * mark is a comma, the field delimiter is a semicolon.
 */
function csvSeparators(locale = 'en-US') {
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal')?.value ?? '.';
  return { decimal, delimiter: decimal === ',' ? ';' : ',' };
}

/**
 * Serialize rows to CSV (RFC 4180 quoting, LF between records, no BOM).
 * Numbers keep their full precision and no grouping; only the decimal mark
 * follows the locale.
 */
export function toCSV(rows: CsvCell[][], locale?: string): string {
  const { decimal, delimiter } = csvSeparators(locale);
  const number = (n: number | bigint) => String(n).replace('.', decimal);
  const cell = (v: CsvCell): string => {
    if (v == null) return '';
    if (typeof v === 'number' || typeof v === 'bigint') return number(v);
    if (typeof v === 'object' && 'percent' in v) return `${number(Number((v.percent * 100).toPrecision(15)))}%`;
    const s = String(v);
    return s.includes('"') || s.includes(delimiter) || /[\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(row => row.map(cell).join(delimiter)).join('\n');
}

/**
 * Convert array of objects to machine CSV (comma, dot decimals), e.g. for DuckDB ingestion
 * @param {Array<Object>} data - Array of data objects
 * @returns {string} CSV string
 */
export function dataToCSV(data) {
  if (!data?.length) return '';
  const cols = Object.keys(data[0]);
  return toCSV([cols, ...data.map(r => cols.map(c => r[c]))]);
}

/**
 * Robust CSV parser: handles BOM, CRLF, quoted fields with escaped quotes, empty lines
 * @param {string} text - CSV text to parse
 * @returns {Array<Object>} Array of parsed objects
 */
export function parseCSV(text) {
  if (typeof text !== 'string') return [];

  // Strip BOM and normalize newlines to \n
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let field = '';
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = src[i + 1];
        if (next === '"') {
          field += '"';
          i++; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // flush last field/row if not ended with \n
  if (inQuotes) {
    row.push(field);
  } else if (field !== '' || row.length) {
    row.push(field);
  }
  if (row.length && row.some(c => c !== '')) rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => String(h || ''));
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const rec = {};
    const vals = rows[r];
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] ?? `col_${c + 1}`;
      const raw = vals[c] ?? '';
      // numeric inference only to avoid behavior change
      const v = raw !== '' && !isNaN(raw) ? Number(raw) : raw;
      rec[key] = v;
    }
    out.push(rec);
  }

  return out;
}
