// One-off migration: replaces every business's images (hero_image +
// business_images gallery) with local files copied from
// D:\setup\Anh\<1..27> (one folder per business — mapping confirmed with the
// user: folders 1-15 -> site1's 15 businesses in id order, 16-21 -> site2's
// 6, 22-27 -> site3's 6; folders 28-33 are spare/unused). Also deletes the
// leftover no-site draft business "Dịch vụ mới" (id 39), per user's answer.
//
// Usage: node migrate/assign-local-images.js   (from web_hub/server), or
// with an absolute path from anywhere.
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { pool } = await import('../db.js');
const { UPLOADS_ROOT, deleteUploadedFile } = await import('../middleware/upload.js');

const SOURCE_ROOT = 'D:\\setup\\Anh';
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const DRAFT_BUSINESS_ID_TO_DELETE = 39;

// folder number -> business id, in the order confirmed with the user.
const FOLDER_TO_BUSINESS_ID = {
  // site1 (15)
  1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11,
  11: 12, 12: 13, 13: 14, 14: 15, 15: 16,
  // site2 (6)
  16: 17, 17: 18, 18: 19, 19: 20, 20: 21, 21: 22,
  // site3 (6)
  22: 30, 23: 31, 24: 32, 25: 33, 26: 34, 27: 35,
};

function listSourceImages(folderNum) {
  const dir = path.join(SOURCE_ROOT, String(folderNum));
  const names = fs.readdirSync(dir).filter((n) => ALLOWED_EXT.has(path.extname(n).toLowerCase()));
  names.sort(); // deterministic order
  return names.map((n) => path.join(dir, n));
}

function copyIntoUploads(srcPath) {
  const ext = path.extname(srcPath).toLowerCase();
  const destName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.copyFileSync(srcPath, path.join(UPLOADS_ROOT, destName));
  return `/uploads/${destName}`;
}

async function main() {
  // 1) Drop the leftover no-site draft business.
  const [draftRows] = await pool.query('SELECT id, name, hero_image FROM businesses WHERE id = ?', [
    DRAFT_BUSINESS_ID_TO_DELETE,
  ]);
  if (draftRows[0]) {
    const [draftImgs] = await pool.query('SELECT url FROM business_images WHERE business_id = ?', [
      DRAFT_BUSINESS_ID_TO_DELETE,
    ]);
    await pool.query('DELETE FROM businesses WHERE id = ?', [DRAFT_BUSINESS_ID_TO_DELETE]);
    draftImgs.forEach((r) => deleteUploadedFile(r.url));
    if (draftRows[0].hero_image) deleteUploadedFile(draftRows[0].hero_image);
    console.log(`Deleted draft business #${DRAFT_BUSINESS_ID_TO_DELETE} ("${draftRows[0].name}").`);
  } else {
    console.log(`Draft business #${DRAFT_BUSINESS_ID_TO_DELETE} not found (already gone) — skipped.`);
  }

  // 2) For every mapped business: wipe old images (DB rows + any local files
  // they pointed at; external stock URLs are just dropped, not deleted from
  // disk), copy the folder's images into uploads/, insert fresh rows.
  for (const [folderNum, businessId] of Object.entries(FOLDER_TO_BUSINESS_ID)) {
    const [bizRows] = await pool.query('SELECT id, name, hero_image FROM businesses WHERE id = ?', [
      businessId,
    ]);
    if (!bizRows[0]) {
      console.warn(`!! business id ${businessId} (folder ${folderNum}) not found in DB — skipped.`);
      continue;
    }
    const business = bizRows[0];

    const srcFiles = listSourceImages(folderNum);
    if (!srcFiles.length) {
      console.warn(`!! folder ${folderNum} has no image files — skipped "${business.name}".`);
      continue;
    }

    const [oldImages] = await pool.query('SELECT url FROM business_images WHERE business_id = ?', [
      businessId,
    ]);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM business_images WHERE business_id = ?', [businessId]);

      const newUrls = srcFiles.map(copyIntoUploads);
      for (let i = 0; i < newUrls.length; i += 1) {
        await conn.query(
          'INSERT INTO business_images (business_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
          [businessId, newUrls[i], i, i === 0 ? 1 : 0]
        );
      }
      await conn.query('UPDATE businesses SET hero_image = ? WHERE id = ?', [newUrls[0], businessId]);
      await conn.commit();

      // Clean up old local files (best-effort) only after the DB commit
      // succeeded, so a mid-transaction failure never loses a still-referenced file.
      oldImages.forEach((r) => deleteUploadedFile(r.url));
      if (business.hero_image) deleteUploadedFile(business.hero_image);

      console.log(
        `Folder ${folderNum} -> business #${businessId} "${business.name}": ${newUrls.length} images.`
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
