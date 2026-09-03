import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

function mapBadge(row) {
  return { id: row.id, key: row.key, label: row.label, color: row.color, sortOrder: row.sort_order };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM badges ORDER BY sort_order, label');
    return res.json(rows.map(mapBadge));
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { key, label, color, sortOrder } = req.body || {};
    if (!key || !label || !color) {
      return res.status(400).json({ error: 'key, label và color là bắt buộc.' });
    }
    const [dupe] = await pool.query('SELECT id FROM badges WHERE `key` = ?', [key]);
    if (dupe.length) return res.status(409).json({ error: 'Đã tồn tại huy hiệu với key này.' });
    const [result] = await pool.query(
      'INSERT INTO badges (`key`, label, color, sort_order) VALUES (?, ?, ?, ?)',
      [key, label, color, sortOrder || 0]
    );
    const [rows] = await pool.query('SELECT * FROM badges WHERE id = ?', [result.insertId]);
    return res.status(201).json(mapBadge(rows[0]));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { label, color, sortOrder } = req.body || {};
    await pool.query(
      'UPDATE badges SET label = COALESCE(?, label), color = COALESCE(?, color), sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [label || null, color || null, sortOrder ?? null, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM badges WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy huy hiệu.' });
    return res.json(mapBadge(rows[0]));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM badges WHERE id = ?', [req.params.id]); // cascades business_badges
    return res.status(204).end();
  })
);

export default router;
