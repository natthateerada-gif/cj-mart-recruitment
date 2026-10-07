const path = require('path');
const multer = require('multer');

// Legacy only: older deployments stored resumes/photos on local disk in this
// folder. New uploads are kept in memory and written to Postgres (see
// routes/applications.js), because hosts like Render's free tier wipe the local
// disk on every deploy/restart. UPLOAD_DIR is still read to serve old files.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file

const DOC_AND_IMAGE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function unsupported(file) {
  const err = new Error('unsupported_file_type');
  err.field = file.fieldname;
  return err;
}

// Applicant attachments: resume = PDF or image, photo = image only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === 'photoFile' ? IMAGE_MIME : DOC_AND_IMAGE_MIME;
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(unsupported(file));
  },
});

// Homepage banner images (see routes/bannerImages.js).
const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIME.has(file.mimetype)) return cb(null, true);
    cb(unsupported(file));
  },
});

module.exports = { upload, UPLOAD_DIR, MAX_FILE_BYTES, bannerUpload };
