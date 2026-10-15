// Admin tool: import applicants from a CSV file (e.g. the HR Google Sheet exported
// as CSV). Two-step and stateless: the browser sends the file with mode=preview to
// see how the columns were matched and which rows are importable, then sends the
// same file again with mode=commit (plus the chosen column mapping) to save it.
// All rows are saved in ONE transaction: either the whole import lands or none of it.
//
// What is imported: applicant details, status, submitted date, and HR comments
// (kept as screening notes). What is NOT imported: attachments (a resume link, if
// the file has one, is kept inside a note) and PDPA consent (consent was collected
// by the old form, so the imported rows are saved with consent = false).

const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../auth');
const { uid } = require('../utils/id');
const { parseCsvTable } = require('../utils/csv');
const { PROVINCES } = require('../utils/provinces');
const { STATUS_OPTIONS } = require('./applications');

const router = express.Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const NOTE_MAX = 2000;
const IMPORT_AUTHOR = 'นำเข้าจาก CSV';

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

// key, label (Thai, shown in the mapping screen), required
const FIELDS = [
  { key: 'submittedAt', label: 'วันที่/เวลาที่สมัคร', required: false },
  { key: 'titlePrefix', label: 'คำนำหน้า', required: false },
  { key: 'name', label: 'ชื่อ-นามสกุล', required: true },
  { key: 'birthDate', label: 'วัน/เดือน/ปีเกิด', required: false },
  { key: 'phone', label: 'เบอร์โทรศัพท์', required: true },
  { key: 'lineId', label: 'ID Line', required: false },
  { key: 'email', label: 'อีเมล', required: false },
  { key: 'province', label: 'จังหวัด', required: false },
  { key: 'driverLicense', label: 'ใบขับขี่', required: false },
  { key: 'position', label: 'ตำแหน่งที่สมัคร', required: false },
  { key: 'totalExperience', label: 'ประสบการณ์ (ปี)', required: false },
  { key: 'experience', label: 'รายละเอียดประสบการณ์', required: false },
  { key: 'sourceChannel', label: 'ช่องทางที่รับทราบ', required: false },
  { key: 'criminalRecord', label: 'ประวัติคดี', required: false },
  { key: 'resumeUrl', label: 'ลิงก์เรซูเม่เดิม', required: false },
  { key: 'status', label: 'สถานะ', required: false },
  { key: 'comment', label: 'หมายเหตุ/คอมเมนต์ HR', required: false },
];

// ---------------------------------------------------------------------------
// Column auto-detection
// ---------------------------------------------------------------------------
const normHeader = (h) => String(h || '').toLowerCase().replace(/[\s_\-./\\'’"“”()[\]:|]+/g, '');

const EXACT = {
  submittedAt: ['timestamp', 'submittedat', 'submitted', 'datesubmitted', 'วันที่สมัคร', 'วันที่ส่ง'],
  titlePrefix: ['title', 'prefix', 'คำนำหน้า', 'คำนำหน้าชื่อ'],
  name: ['name', 'fullname', 'ชื่อ', 'ชื่อนามสกุล', 'ชื่อสกุล'],
  birthDate: ['birthdate', 'birthday', 'dob', 'dateofbirth', 'วันเกิด', 'วดปเกิด', 'วันเดือนปีเกิด'],
  phone: ['phone', 'tel', 'mobile', 'phonenumber', 'เบอร์โทร', 'เบอร์โทรศัพท์', 'โทรศัพท์', 'เบอร์'],
  lineId: ['line', 'lineid', 'idline', 'ไลน์', 'ไอดีไลน์'],
  email: ['email', 'อีเมล', 'อีเมลล์'],
  province: ['province', 'area', 'จังหวัด', 'จังหวัดที่สมัคร', 'จังหวัดที่สนใจสมัครงาน'],
  driverLicense: ['drivers', 'driverslicense', 'driverlicense', 'license', 'ใบขับขี่'],
  position: ['position', 'job', 'jobtitle', 'ตำแหน่ง', 'ตำแหน่งที่สมัคร', 'ตำแหน่งที่สนใจสมัคร'],
  totalExperience: ['year', 'years', 'yearsofexperience', 'ประสบการณ์ปี'],
  experience: ['shortexp', 'experience', 'ประสบการณ์'],
  sourceChannel: ['channel', 'source', 'ช่องทาง'],
  criminalRecord: ['criminalrecord', 'criminal', 'ประวัติคดี'],
  resumeUrl: ['resume', 'cv', 'uploadresume', 'เรซูเม่', 'ไฟล์ประวัติ'],
  status: ['status', 'สถานะ'],
  comment: ['comment', 'comments', 'note', 'notes', 'remark', 'remarks', 'หมายเหตุ'],
};

// Looser patterns, tried only for headers that matched nothing exactly.
const LOOSE = [
  ['totalExperience', /จำนวนประสบการณ์/],
  ['experience', /ประสบการณ์.*(สั้น|อธิบาย)|อธิบายประสบการณ์/],
  ['criminalRecord', /คดี/],
  ['driverLicense', /ใบขับขี่/],
  ['sourceChannel', /ช่องทาง/],
  ['province', /จังหวัด/],
  ['position', /ตำแหน่ง/],
  ['phone', /เบอร์โทร|โทรศัพท์/],
  ['birthDate', /เกิด/],
];

const DATE_SNIFF = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}-[A-Za-z]{3}[a-z]*-\d{2,4}/;
const isUnnamed = (h) => h === '' || /^column\s*\d*$/i.test(h.trim());

function sniffColumns(header, rows, mapping) {
  const used = new Set(Object.values(mapping).filter((v) => v !== null));
  const sample = (idx) => rows.slice(0, 60).map((r) => String(r[idx] || '').trim()).filter(Boolean);
  header.forEach((h, idx) => {
    if (used.has(idx) || !isUnnamed(h)) return;
    const vals = sample(idx);
    if (vals.length < 3) return;
    const ratio = (fn) => vals.filter(fn).length / vals.length;
    if (mapping.province === null && ratio((v) => PROVINCES.includes(v)) >= 0.6) {
      mapping.province = idx; used.add(idx); return;
    }
    if (ratio((v) => DATE_SNIFF.test(v)) >= 0.7) {
      const years = vals.map((v) => { const d = parseDateLoose(v, 'mdy'); return d ? d.y : null; }).filter((y) => y !== null);
      if (!years.length) return;
      const recent = years.filter((y) => y >= 2015).length / years.length;
      if (recent >= 0.7 && mapping.submittedAt === null) { mapping.submittedAt = idx; used.add(idx); }
      else if (recent < 0.3 && mapping.birthDate === null) { mapping.birthDate = idx; used.add(idx); }
    }
  });
}

function autoMapping(header, rows) {
  const mapping = {};
  FIELDS.forEach((f) => { mapping[f.key] = null; });
  const norm = header.map(normHeader);
  const taken = new Set();
  for (const f of FIELDS) {
    const idx = norm.findIndex((n, i) => !taken.has(i) && n && EXACT[f.key].includes(n));
    if (idx >= 0) { mapping[f.key] = idx; taken.add(idx); }
  }
  for (const [key, re] of LOOSE) {
    if (mapping[key] !== null) continue;
    const idx = header.findIndex((h, i) => !taken.has(i) && re.test(h));
    if (idx >= 0) { mapping[key] = idx; taken.add(idx); }
  }
  sniffColumns(header, rows, mapping);
  return mapping;
}

function cleanMapping(input, headerLength) {
  const out = {};
  FIELDS.forEach((f) => {
    const v = input ? input[f.key] : null;
    const n = v === null || v === undefined || v === '' ? null : Number(v);
    out[f.key] = Number.isInteger(n) && n >= 0 && n < headerLength ? n : null;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function fixYear(y) {
  if (y < 100) return y <= 69 ? 2000 + y : 1900 + y;
  if (y > 2400) return y - 543; // พ.ศ.
  return y;
}

// order: 'mdy' (Google Sheets, English locale) or 'dmy'. A value like 31/3/2026 is
// unambiguous and is read as day-first whatever the order says. Returns
// { y, m, d, hh, mi, ss } or null.
function parseDateLoose(raw, order) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let y; let m; let d; let rest = '';
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(s);
  if (mt) { y = fixYear(Number(mt[1])); m = Number(mt[2]); d = Number(mt[3]); rest = mt[4]; }
  else if ((mt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/.exec(s))) {
    const a = Number(mt[1]); const b = Number(mt[2]);
    y = fixYear(Number(mt[3])); rest = mt[4];
    if (order === 'dmy') { d = a; m = b; if (m > 12 && d <= 12) { d = b; m = a; } }
    else { m = a; d = b; if (m > 12 && d <= 12) { m = b; d = a; } }
  } else if ((mt = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{2,4})(.*)$/.exec(s))) {
    d = Number(mt[1]); m = MONTHS[mt[2].toLowerCase()]; y = fixYear(Number(mt[3])); rest = mt[4];
    if (!m) return null;
  } else return null;
  if (!validYmd(y, m, d)) return null;
  let hh = 0; let mi = 0; let ss = 0;
  const tm = /^[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(rest);
  if (tm) { hh = Number(tm[1]); mi = Number(tm[2]); ss = Number(tm[3] || 0); if (hh > 23 || mi > 59 || ss > 59) { hh = 0; mi = 0; ss = 0; } }
  return { y, m, d, hh, mi, ss, hasTime: !!tm };
}

const pad = (n) => String(n).padStart(2, '0');
const toIsoDate = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
// Times in the sheet are Thailand local time.
const toTimestamp = (p) => `${toIsoDate(p)}T${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}+07:00`;

function todayBangkok() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// -> { phone, fixed } | { error }
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  let fixed = false;
  if (/^66\d{9}$/.test(digits)) { digits = '0' + digits.slice(2); fixed = true; }
  if (/^[6-9]\d{8}$/.test(digits)) { digits = '0' + digits; fixed = true; } // spreadsheets drop the leading 0
  if (!/^\d{10}$/.test(digits)) return { error: `เบอร์โทรไม่ถูกต้อง (“${String(raw || '').trim().slice(0, 30)}”)` };
  return { phone: digits, fixed };
}

function yesNo(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (/^(ไม่|no\b|false|n$|0$)/.test(t)) return false;
  if (/^(มี|ใช่|yes|true|y$|1$)/.test(t)) return true;
  return null;
}

function parseCriminal(raw) {
  const t = String(raw || '').trim();
  const flag = yesNo(t);
  if (flag === null) return { flag: null, detail: '' };
  if (flag === false) return { flag: false, detail: '' };
  const detail = t.replace(/^มี\s*[-–:]?\s*/, '').trim();
  return { flag: true, detail: detail || 'ไม่ระบุรายละเอียด' };
}

const EXPERIENCE_OPTIONS = ['ไม่มีประสบการณ์', 'น้อยกว่า 1 ปี', '1-2 ปี', '3-5 ปี', '6-10 ปี', 'มากกว่า 10 ปี'];
function mapExperience(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (EXPERIENCE_OPTIONS.includes(t)) return t;
  const n = parseFloat(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'ไม่มีประสบการณ์';
  if (n < 1) return 'น้อยกว่า 1 ปี';
  if (n <= 2) return '1-2 ปี';
  if (n <= 5) return '3-5 ปี';
  if (n <= 10) return '6-10 ปี';
  return 'มากกว่า 10 ปี';
}

const STATUS_ALIAS = {
  'ไม่ผ่านสกรีนเบื้องต้น': 'ไม่ผ่านการพิจารณา',
  'ไม่ผ่านสกรีน': 'ไม่ผ่านการพิจารณา',
  'ได้งานแล้ว': 'รับเข้าทำงาน',
  'ผู้สมัครไม่สนใจ': 'ไม่สนใจงาน',
  'ผู้สมัครไม่สนใจงาน': 'ไม่สนใจงาน',
  blacklist: 'Blacklist',
};
function mapStatus(raw) {
  const t = String(raw || '').trim();
  if (!t) return { status: 'ใหม่', unknown: '' };
  const exact = STATUS_OPTIONS.find((s) => s.toLowerCase() === t.toLowerCase());
  if (exact) return { status: exact, unknown: '' };
  const alias = STATUS_ALIAS[t] || STATUS_ALIAS[t.toLowerCase()];
  if (alias) return { status: alias, unknown: '' };
  return { status: 'ใหม่', unknown: t };
}

const normTitle = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function matchJob(position, jobs) {
  const p = normTitle(position);
  if (!p) return null;
  const exact = jobs.find((j) => normTitle(j.title) === p);
  if (exact) return exact;
  const cands = jobs.filter((j) => {
    const t = normTitle(j.title);
    return t.length >= 4 && (p.includes(t) || (p.length >= 4 && t.includes(p)));
  });
  cands.sort((a, b) => b.title.length - a.title.length);
  return cands[0] || null;
}

// ---------------------------------------------------------------------------
// Turn the parsed table into importable records
// ---------------------------------------------------------------------------
function buildRecords(table, mapping, { dateOrder, jobs }) {
  const cell = (row, key) => (mapping[key] === null ? '' : String(row[mapping[key]] === undefined ? '' : row[mapping[key]]).trim());
  const records = [];
  const errorRows = [];
  const unmatched = new Map();
  const unknownStatuses = new Map();
  let phoneFixed = 0;
  let badBirth = 0;
  let badDate = 0;

  table.rows.forEach((row, i) => {
    const line = i + 2; // spreadsheet line number (header is line 1)
    const errors = [];
    const name = cell(row, 'name');
    if (!name) errors.push('ไม่มีชื่อ-นามสกุล');
    const ph = normalizePhone(cell(row, 'phone'));
    if (ph.error) errors.push(ph.error);
    if (errors.length > 0) {
      errorRows.push({ line, reason: errors.join(' / '), cells: row });
      return;
    }
    if (ph.fixed) phoneFixed += 1;

    let submittedAt = null;
    let submittedDate = null;
    const rawTs = cell(row, 'submittedAt');
    if (rawTs) {
      const p = parseDateLoose(rawTs, dateOrder);
      if (p) { submittedAt = toTimestamp(p); submittedDate = toIsoDate(p); } else badDate += 1;
    }
    let birthDate = null;
    const rawBirth = cell(row, 'birthDate');
    if (rawBirth) {
      const p = parseDateLoose(rawBirth, dateOrder);
      if (p && p.y >= 1900 && toIsoDate(p) <= todayBangkok()) birthDate = toIsoDate(p); else badBirth += 1;
    }

    const position = cell(row, 'position');
    const job = matchJob(position, jobs);
    const jobTitle = job ? job.title : (position || '(ไม่ระบุตำแหน่ง)');
    if (!job && position) unmatched.set(position, (unmatched.get(position) || 0) + 1);

    const crim = parseCriminal(cell(row, 'criminalRecord'));
    const st = mapStatus(cell(row, 'status'));
    if (st.unknown) unknownStatuses.set(st.unknown, (unknownStatuses.get(st.unknown) || 0) + 1);

    // Notes kept from the file: HR comment (date read from its start when possible),
    // the original resume link, and a status the importer could not map.
    const notes = [];
    const comment = cell(row, 'comment');
    if (comment) {
      const lead = /^\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/.exec(comment);
      const lp = lead ? parseDateLoose(lead[1], dateOrder) : null;
      let callDate = lp ? toIsoDate(lp) : (submittedDate || todayBangkok());
      if (callDate > todayBangkok()) callDate = todayBangkok();
      notes.push({ callDate, note: comment.slice(0, NOTE_MAX) });
    }
    const resumeUrl = cell(row, 'resumeUrl');
    if (/^https?:\/\//i.test(resumeUrl)) {
      notes.push({ callDate: submittedDate || todayBangkok(), note: `ลิงก์เรซูเม่เดิม (ฟอร์มเก่า): ${resumeUrl}`.slice(0, NOTE_MAX) });
    }
    if (st.unknown) {
      notes.push({ callDate: todayBangkok(), note: `สถานะเดิมในไฟล์นำเข้า: ${st.unknown}` });
    }

    const licenseFlag = yesNo(cell(row, 'driverLicense'));
    records.push({
      line,
      jobId: job ? job.id : null,
      jobTitle,
      matchedJob: !!job,
      name: name.slice(0, 200),
      phone: ph.phone,
      email: cell(row, 'email').slice(0, 200),
      titlePrefix: cell(row, 'titlePrefix').slice(0, 30),
      birthDate,
      lineId: cell(row, 'lineId').slice(0, 100),
      province: cell(row, 'province').slice(0, 100),
      hasDriverLicense: licenseFlag,
      hasCriminalRecord: crim.flag,
      criminalRecordDetail: crim.detail,
      totalExperience: mapExperience(cell(row, 'totalExperience')),
      experience: cell(row, 'experience').slice(0, 2000),
      sourceChannel: cell(row, 'sourceChannel').slice(0, 100),
      status: st.status,
      submittedAt,
      submittedDate,
      notes,
    });
  });

  return {
    records, errorRows, unmatched, unknownStatuses, phoneFixed, badBirth, badDate,
  };
}

// Mark records that already exist in the database (or earlier in the same file).
// Same person = same phone + same position (+ same submit date when the file has one).
async function markDuplicates(records) {
  const phones = [...new Set(records.map((r) => r.phone))];
  const withDate = new Set();
  const noDate = new Set();
  if (phones.length > 0) {
    const { rows } = await pool.query(
      `SELECT phone, job_title, (submitted_at AT TIME ZONE 'Asia/Bangkok')::date::text AS d
         FROM applications WHERE phone = ANY($1)`,
      [phones]
    );
    for (const r of rows) {
      withDate.add(`${r.phone}|${normTitle(r.job_title)}|${r.d}`);
      noDate.add(`${r.phone}|${normTitle(r.job_title)}`);
    }
  }
  let duplicates = 0;
  for (const rec of records) {
    const base = `${rec.phone}|${normTitle(rec.jobTitle)}`;
    const key = rec.submittedDate ? `${base}|${rec.submittedDate}` : base;
    const dup = rec.submittedDate ? withDate.has(key) : noDate.has(base);
    rec.duplicate = dup;
    if (dup) duplicates += 1;
    else { withDate.add(`${base}|${rec.submittedDate || ''}`); noDate.add(base); }
  }
  return duplicates;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
function receiveCsv(req, res, next) {
  csvUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'validation', message: `ไฟล์ใหญ่เกินไป (ไม่เกิน ${Math.round(MAX_FILE_BYTES / 1048576)} MB)` });
    }
    return next(err);
  });
}

router.post('/api/admin/import/applicants', requireAdmin, receiveCsv, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'validation', message: 'กรุณาเลือกไฟล์ CSV' });
    const b = req.body || {};
    const mode = b.mode === 'commit' ? 'commit' : 'preview';
    const dateOrder = b.dateOrder === 'dmy' ? 'dmy' : 'mdy';
    const skipDuplicates = b.skipDuplicates !== 'false';

    let text = req.file.buffer.toString('utf8');
    if (text.includes('�')) {
      return res.status(400).json({ error: 'validation', message: 'อ่านไฟล์ไม่ได้ กรุณาบันทึกเป็น CSV UTF-8 (ใน Google Sheets: ไฟล์ > ดาวน์โหลด > ค่าที่คั่นด้วยจุลภาค .csv)' });
    }
    const table = parseCsvTable(text);
    text = null;
    if (table.header.length === 0 || table.rows.length === 0) {
      return res.status(400).json({ error: 'validation', message: 'ไม่พบข้อมูลในไฟล์ (ต้องมีแถวหัวคอลัมน์ และอย่างน้อย 1 แถวข้อมูล)' });
    }
    if (table.rows.length > MAX_ROWS) {
      return res.status(400).json({ error: 'validation', message: `ไฟล์มี ${table.rows.length} แถว เกินที่นำเข้าได้ครั้งละ ${MAX_ROWS} แถว กรุณาแบ่งไฟล์` });
    }

    let mapping;
    if (b.mapping) {
      let parsed = null;
      try { parsed = JSON.parse(b.mapping); } catch (e) { parsed = null; }
      mapping = cleanMapping(parsed, table.header.length);
    } else {
      mapping = autoMapping(table.header, table.rows);
    }
    const missing = FIELDS.filter((f) => f.required && mapping[f.key] === null).map((f) => f.label);

    const { rows: jobs } = await pool.query('SELECT id, title FROM jobs');
    const base = {
      headers: table.header,
      mapping,
      fields: FIELDS,
      totalRows: table.rows.length,
    };
    if (missing.length > 0) {
      return res.json(Object.assign(base, {
        ready: false, missing, importable: 0, duplicates: 0, errorCount: 0,
        sample: [], errorRows: [], unmatchedPositions: [], unknownStatuses: [], warnings: {},
      }));
    }

    const built = buildRecords(table, mapping, { dateOrder, jobs });
    const duplicates = await markDuplicates(built.records);
    const toInsert = built.records.filter((r) => !(skipDuplicates && r.duplicate));

    const summary = Object.assign(base, {
      ready: true,
      missing: [],
      importable: toInsert.length,
      duplicates,
      skipDuplicates,
      errorCount: built.errorRows.length,
      errorRows: built.errorRows.slice(0, 200),
      sample: toInsert.slice(0, 8).map((r) => ({
        line: r.line, name: r.name, phone: r.phone, jobTitle: r.jobTitle, matchedJob: r.matchedJob,
        province: r.province, status: r.status, submittedDate: r.submittedDate,
        noteCount: r.notes.length,
      })),
      unmatchedPositions: [...built.unmatched.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15).map(([title, count]) => ({ title, count })),
      unknownStatuses: [...built.unknownStatuses.entries()].map(([status, count]) => ({ status, count })),
      warnings: { phoneFixed: built.phoneFixed, badBirth: built.badBirth, badDate: built.badDate },
    });
    if (mode === 'preview') return res.json(summary);

    // ---- commit
    if (toInsert.length === 0) {
      return res.status(400).json({ error: 'validation', message: 'ไม่มีใบสมัครที่นำเข้าได้ (ซ้ำหมดหรือข้อมูลไม่ครบ)' });
    }
    const client = await pool.connect();
    let notesCreated = 0;
    try {
      await client.query('BEGIN');
      for (const r of toInsert) {
        const id = uid();
        await client.query(
          `INSERT INTO applications
             (id, job_id, job_title, name, phone, email, area, experience, status, pdpa_consent,
              title_prefix, birth_date, line_id, has_driver_license, has_criminal_record,
              criminal_record_detail, source_channel, total_experience, submitted_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18::timestamptz, now()), now())`,
          [
            id, r.jobId, r.jobTitle, r.name, r.phone, r.email, r.province, r.experience, r.status,
            r.titlePrefix, r.birthDate, r.lineId, r.hasDriverLicense, r.hasCriminalRecord,
            r.criminalRecordDetail, r.sourceChannel, r.totalExperience, r.submittedAt,
          ]
        );
        for (const n of r.notes) {
          await client.query(
            `INSERT INTO application_notes (id, application_id, call_date, note, author_id, author_name)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [uid(), id, n.callDate, n.note, String(req.admin.id), IMPORT_AUTHOR]
          );
          notesCreated += 1;
        }
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    return res.json({
      ok: true,
      inserted: toInsert.length,
      skippedDuplicates: skipDuplicates ? duplicates : 0,
      skippedErrors: built.errorRows.length,
      notesCreated,
      importedBy: req.admin.name,
    });
  } catch (err) { next(err); }
});

module.exports = router;
