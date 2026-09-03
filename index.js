import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import sitesRoutes from './routes/sites.js';
import categoriesRoutes from './routes/categories.js';
import badgesRoutes from './routes/badges.js';
import businessesRoutes from './routes/businesses.js';
import { UPLOADS_ROOT } from './middleware/upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// CORS: explicit allow-list of the public sites' origins (site1/site2/site3,
// plus any future site), read from env. Falls back to wide-open only when
// CORS_ORIGINS is unset (local dev convenience) — production must set it.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_ROOT));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/businesses', businessesRoutes);

// Optionally also serve the built admin SPA from this same process/origin,
// e.g. at https://admin.yourdomain.com/ (see .env.example ADMIN_DIST_PATH).
// The 3 public sites are NOT served here — they deploy as separate static
// sites on their own domains and call this API cross-origin (see DEPLOY.md).
const adminDist = path.resolve(__dirname, process.env.ADMIN_DIST_PATH || '../admin/dist');
if (fs.existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.sendFile(path.join(adminDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({ error: err.message || 'Internal server error.' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`web_hub API listening on port ${PORT}`);
});
