import jwt from 'jsonwebtoken';

// Verifies "Authorization: Bearer <token>", attaches the decoded payload to
// req.admin. Flat/no-roles model (matches all 3 legacy sites) — any valid
// admin token can manage data for every site.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Thiếu mã xác thực (token).' });
  }
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' });
  }
}
