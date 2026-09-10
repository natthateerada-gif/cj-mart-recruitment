const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const BANNER_DIR = path.join(UPLOAD_DIR, 'banner');
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file

// These directories aren't guaranteed to exist on a fresh checkout/deploy
// (only uploads/.gitkeep is tracked in git), so create them at startup.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BANNER_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('unsupported_file_type'));
  },
});

// Separate storage/instance for homepage banner images: these live in their
// own subfolder because they're served publicly (see server.js), unlike
// resumes/photos which stay behind an admin-only download route.
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BANNER_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + ext);
  },
});

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('unsupported_file_type'));
  },
});

module.exports = { upload, UPLOAD_DIR, MAX_FILE_BYTES, bannerUpload, BANNER_DIR };
