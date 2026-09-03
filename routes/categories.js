import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { slugify } from '../utils/slugify.js';

const router = Router();

function mapCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    title: row.title,
    icon: row.icon,
    sortOrder: row.sort_order,
    businessCount: row.business_count !== undefined ? Number(row.business_count) : undefined,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      // business_categories is now scoped per site_id (a business can be
      // tagged with the same category on more than one site) — count
      // DISTINCT businesses, not tag rows, so this stays "how many services
      // use this category" rather than "how many site listings".
      `SELECT c.*, COUNT(DISTINCT bc.business_id) AS business_count
       FROM categories c
       LEFT JOIN business_categories bc ON bc.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order, c.label`
    );
    return res.json(rows.map(mapCategory));
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug, label, title, icon, sortOrder } = req.body || {};
    if (!label) return res.status(400).json({ error: 'Nhãn (label) là bắt buộc.' });
    const finalSlug = slug || slugify(label);
    const [dupe] = await pool.query('SELECT id FROM categories WHERE slug = ?', [finalSlug]);
    if (dupe.length) return res.status(409).json({ error: 'Đã tồn tại danh mục với slug này.' });
    const [result] = await pool.query(
      'INSERT INTO categories (slug, label, title, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
      [finalSlug, label, title || label, icon || null, sortOrder || 0]
    );
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [result.insertId]);
    return res.status(201).json(mapCategory(rows[0]));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug, label, title, icon, sortOrder } = req.body || {};
    await pool.query(
      `UPDATE categories SET
         slug = COALESCE(?, slug), label = COALESCE(?, label), title = COALESCE(?, title),
         icon = ?, sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [slug || null, label || null, title || null, icon || null, sortOrder ?? null, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy danh mục.' });
    return res.json(mapCategory(rows[0]));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]); // cascades business_categories
    return res.status(204).end();
  })
);

export default router;
