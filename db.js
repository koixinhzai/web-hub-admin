import mysql from 'mysql2/promise';

// Single shared pool for the one unified database. dateStrings:true keeps
// DATE/DATETIME columns as plain 'YYYY-MM-DD' strings (matches the pattern
// used by the old sites' pools, avoids JS Date timezone surprises).
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'web_hub',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

export default pool;
