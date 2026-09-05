// One-off utility: creates the business_videos table (mirrors business_images,
// minus the is_primary/hero concept — videos don't have a "cover" field on
// `businesses`). Safe to re-run (CREATE TABLE IF NOT EXISTS).
// Usage: npm run db:add-business-videos   (from web_hub/server)
import 'dotenv/config';
import { pool } from '../db.js';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_videos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT NOT NULL,
      url VARCHAR(500) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_business_videos_business
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )
  `);
  console.log('business_videos table ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to create business_videos table:', err.message);
  process.exit(1);
});
