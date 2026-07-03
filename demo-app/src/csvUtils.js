/**
 * CSV parsing utilities
 * Handles BOM, CRLF, quoted fields with escaped quotes, empty lines
 */

/**
 * Parse CSV text into array of objects
 * @param {string} text - Raw CSV text
 * @returns {Array<Object>} Array of data objects
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
      // numeric inference
      const v = raw !== '' && !isNaN(raw) ? Number(raw) : raw;
      rec[key] = v;
    }
    out.push(rec);
  }

  return out;
}
