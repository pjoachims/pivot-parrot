/**
 * CSV Utilities
 * Handles CSV parsing and conversion for data import/export
 */

/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data - Array of data objects
 * @returns {string} CSV string
 */
export function dataToCSV(data) {
  if (!data?.length) return '';
  const cols = Object.keys(data[0]);
  return cols.join(',') + '\n' + data.map(r => cols.map(c => {
    const v = r[c];
    if (v == null) return '';
    const s = String(v);
    return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
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
