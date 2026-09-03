import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

function mapSite(row) {
  return { id: row.id, code: row.code, name: row.name, domain: row.domain };
}

// Public — every public frontend calls this (or hardcodes its own code) to
// know which `?site=` value to pass to /api/businesses.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM sites ORDER BY id');
    return res.json(rows.map(mapSite));
  })
);

// Adding a future site 4/5/... is just one INSERT here (via admin), no schema
// or backend changes needed.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code, name, domain } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'code và name là bắt buộc.' });
    const [dupe] = await pool.query('SELECT id FROM sites WHERE code = ?', [code]);
    if (dupe.length) return res.status(409).json({ error: 'Mã (code) trang web đã tồn tại.' });
    const [result] = await pool.query('INSERT INTO sites (code, name, domain) VALUES (?, ?, ?)', [
      code,
      name,
      domain || null,
    ]);
    const [rows] = await pool.query('SELECT * FROM sites WHERE id = ?', [result.insertId]);
    return res.status(201).json(mapSite(rows[0]));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, domain } = req.body || {};
    await pool.query('UPDATE sites SET name = COALESCE(?, name), domain = ? WHERE id = ?', [
      name || null,
      domain || null,
      req.params.id,
    ]);
    const [rows] = await pool.query('SELECT * FROM sites WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy trang web.' });
    return res.json(mapSite(rows[0]));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    // No ON DELETE for business_sites->sites beyond CASCADE in schema, so
    // deleting a site silently un-links its businesses from it (businesses
    // rows themselves are untouched, they just stop showing on that site).
    await pool.query('DELETE FROM sites WHERE id = ?', [req.params.id]);
    return res.status(204).end();
  })
);

export default router;
