import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_ROOT),
  filename: (req, file, cb) => {
    // Random name, not tied to any single site (a business can be shown on
    // more than one site) — matches the collision-safe pattern already used
    // by all 3 legacy sites (random hex/bytes, original filename discarded).
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const err = new Error('Chỉ chấp nhận ảnh định dạng JPEG, PNG, WEBP hoặc GIF.');
    err.status = 400;
    return cb(err);
  }
  return cb(null, true);
}

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, matches all 3 legacy sites
});

// Only unlinks files that live under our own /uploads root — guards against
// trying to delete external/seed URLs (e.g. https://picsum.photos/...).
export function deleteUploadedFile(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOADS_ROOT, url.slice('/uploads/'.length));
  fs.unlink(filePath, () => {}); // best-effort, ignore errors
}
