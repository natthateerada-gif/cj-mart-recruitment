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
// commas/quotes/newlines). parseCsvTable returns { header: [...], rows: [[...], ...] }
// (cells kept by position, so duplicate or empty header names are not lost);
// parseCsv returns an array of row objects keyed by header. The delimiter is
// auto-detected from the first line (comma, semicolon or tab) unless given.
function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of first) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && counts[ch] !== undefined) counts[ch] += 1;
  }
  const best = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
  return counts[best] > 0 ? best : ',';
}

function parseCsvTable(text, delimiter) {
  const clean = text.replace(/^\uFEFF/, '');
  const delim = delimiter || detectDelimiter(clean);
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
    if (ch === delim) { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { header: [], rows: [] };
  return {
    header: rows[0].map((h) => h.trim()),
    rows: rows.slice(1).filter((r) => r.some((v) => v.trim() !== '')),
  };
}

function parseCsv(text) {
  const { header, rows } = parseCsvTable(text);
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
}

module.exports = { csvEscape, toCsv, parseCsv, parseCsvTable };
