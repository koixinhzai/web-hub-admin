// One-off utility: applies sql/schema.sql to the database in .env.
// Usage: npm run db:apply-schema   (from web_hub/server)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'web_hub',
    multipleStatements: true, // required to run the whole .sql file in one go
  });

  console.log(`Applying ${schemaPath} to database "${process.env.DB_NAME || 'web_hub'}"...`);
  await connection.query(sql);
  console.log('Schema applied successfully (tables created if they did not already exist).');
  await connection.end();
}

main().catch((err) => {
  console.error('Failed to apply schema:', err.message);
  process.exit(1);
});
