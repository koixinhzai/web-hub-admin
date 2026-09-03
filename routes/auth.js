import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

function mapAdmin(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
    }
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    });
    return res.json({ token, user: mapAdmin(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy quản trị viên.' });
    return res.json(mapAdmin(rows[0]));
  })
);

router.get(
  '/admin-users',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM admin_users ORDER BY username');
    return res.json(rows.map(mapAdmin));
  })
);

router.post(
  '/admin-users',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { username, email, password, displayName } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }
    const [dupe] = await pool.query(
      'SELECT id FROM admin_users WHERE username = ? OR (email IS NOT NULL AND email = ?)',
      [username, email || null]
    );
    if (dupe.length) {
      return res.status(409).json({ error: 'Tên đăng nhập hoặc email đã được sử dụng.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admin_users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
      [username, email || null, hash, displayName || null]
    );
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE id = ?', [result.insertId]);
    return res.status(201).json(mapAdmin(rows[0]));
  })
);

router.put(
  '/admin-users/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email, displayName, password } = req.body || {};
    const fields = [];
    const values = [];
    if (email !== undefined) {
      fields.push('email = ?');
      values.push(email || null);
    }
    if (displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(displayName || null);
    }
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự.' });
      }
      fields.push('password_hash = ?');
      values.push(await bcrypt.hash(password, 10));
    }
    if (!fields.length) return res.status(400).json({ error: 'Không có thông tin nào để cập nhật.' });
    values.push(id);
    await pool.query(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy quản trị viên.' });
    return res.json(mapAdmin(rows[0]));
  })
);

router.delete(
  '/admin-users/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (Number(id) === req.admin.id) {
      return res.status(400).json({ error: 'Bạn không thể xóa tài khoản đang đăng nhập của chính mình.' });
    }
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM admin_users');
    if (total <= 1) {
      return res.status(400).json({ error: 'Không thể xóa tài khoản quản trị cuối cùng.' });
    }
    await pool.query('DELETE FROM admin_users WHERE id = ?', [id]);
    return res.status(204).end();
  })
);

export default router;
