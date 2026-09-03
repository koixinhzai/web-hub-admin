// One-off utility: creates (or resets the password of) the first admin
// account, from ADMIN_SEED_USERNAME/EMAIL/PASSWORD in .env.
// Usage: npm run db:create-admin   (from web_hub/server)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

async function main() {
  const username = process.env.ADMIN_SEED_USERNAME || 'admin';
  const email = process.env.ADMIN_SEED_EMAIL || null;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!password) {
    throw new Error('Set ADMIN_SEED_PASSWORD in .env before running this script.');
  }

  const hash = await bcrypt.hash(password, 10);
  const [existing] = await pool.query('SELECT id FROM admin_users WHERE username = ?', [username]);

  if (existing.length) {
    await pool.query('UPDATE admin_users SET password_hash = ?, email = ? WHERE username = ?', [
      hash,
      email,
      username,
    ]);
    console.log(`Updated password for existing admin "${username}".`);
  } else {
    await pool.query('INSERT INTO admin_users (username, email, password_hash) VALUES (?, ?, ?)', [
      username,
      email,
      hash,
    ]);
    console.log(`Created admin "${username}".`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
