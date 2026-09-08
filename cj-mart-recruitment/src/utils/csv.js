// Minimal, dependency-free CSV writer. Handles embedded commas/quotes/newlines
// and prefixes a UTF-8 BOM so Thai text opens correctly in Excel.

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.value])).join(',')
  );
  return '﻿' + [header].concat(lines).join('\r\n') + '\r\n';
}

// Minimal, dependency-free CSV parser (handles quoted fields with embedded
// commas/quotes/newlines). Returns an array of row objects keyed by header.
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h.trim()] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
}

module.exports = { csvEscape, toCsv, parseCsv };
