import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { slugify, uniqueSlug } from '../utils/slugify.js';
import { uploadImage, deleteUploadedFile } from '../middleware/upload.js';

const router = Router();

// ---------------------------------------------------------------------------
// Mapping helpers (DB snake_case -> API camelCase)
// ---------------------------------------------------------------------------
function mapBusinessRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    city: row.city,
    neighborhood: row.neighborhood,
    country: row.country,
    address: row.address,
    phone: row.phone,
    priceFrom: row.price_from === null ? null : Number(row.price_from),
    priceUnit: row.price_unit,
    priceRange: row.price_range,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    savedCount: row.saved_count,
    questionCount: row.question_count,
    verified: !!row.verified,
    homeVisit: !!row.home_visit,
    heroImage: row.hero_image,
    shortDescription: row.short_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Batch-loads every child collection for a set of business ids in a handful
// of `WHERE business_id IN (...)` queries (avoids N+1, avoids relying on
// JSON_ARRAYAGG for portability across MySQL versions).
// `siteId`, if given, restricts categories/badges to that one site's rows
// (used by the public list when `?site=` is present); omitted, every site's
// categories/badges for the business are returned together.
async function loadChildrenForIds(ids, siteId) {
  const empty = {
    sites: new Map(),
    categories: new Map(),
    badges: new Map(),
    images: new Map(),
  };
  if (!ids.length) return empty;
  const placeholders = ids.map(() => '?').join(',');

  const [siteRows] = await pool.query(
    `SELECT bs.business_id, s.id, s.code, s.name
     FROM business_sites bs JOIN sites s ON s.id = bs.site_id
     WHERE bs.business_id IN (${placeholders})`,
    ids
  );
  const catParams = [...ids];
  const catSiteSql = siteId ? ' AND bc.site_id = ?' : '';
  if (siteId) catParams.push(siteId);
  const [catRows] = await pool.query(
    `SELECT bc.business_id, c.id, c.slug, c.label
     FROM business_categories bc JOIN categories c ON c.id = bc.category_id
     WHERE bc.business_id IN (${placeholders})${catSiteSql} ORDER BY c.sort_order, c.label`,
    catParams
  );
  const badgeParams = [...ids];
  const badgeSiteSql = siteId ? ' AND bb.site_id = ?' : '';
  if (siteId) badgeParams.push(siteId);
  const [badgeRows] = await pool.query(
    `SELECT bb.business_id, b.id, b.key, b.label, b.color, bb.sort_order
     FROM business_badges bb JOIN badges b ON b.id = bb.badge_id
     WHERE bb.business_id IN (${placeholders})${badgeSiteSql} ORDER BY bb.sort_order`,
    badgeParams
  );
  const [imageRows] = await pool.query(
    `SELECT id, business_id, url, sort_order, is_primary
     FROM business_images WHERE business_id IN (${placeholders})
     ORDER BY is_primary DESC, sort_order, id`,
    ids
  );

  const group = (rows, mapFn) => {
    const map = new Map();
    for (const row of rows) {
      const key = row.business_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(mapFn(row));
    }
    return map;
  };

  return {
    sites: group(siteRows, (r) => ({ id: r.id, code: r.code, name: r.name })),
    categories: group(catRows, (r) => ({ id: r.id, slug: r.slug, label: r.label })),
    badges: group(badgeRows, (r) => ({ id: r.id, key: r.key, label: r.label, color: r.color })),
    images: group(imageRows, (r) => ({
      id: r.id,
      url: r.url,
      sortOrder: r.sort_order,
      isPrimary: !!r.is_primary,
    })),
  };
}

// Site-scoped child data shape: everything besides base columns, siteIds and
// the shared image gallery is entered separately per site (see
// BusinessForm.vue's per-site tabs) -- one of these per site id, keyed by
// `siteData[siteId]` in both the GET /:id response and the POST/PUT payload.
function emptySiteData() {
  return { categoryIds: [], badgeIds: [], info: [], paragraphs: [], specialties: [], services: [], rates: [], reviews: [] };
}

// Resolves either a numeric business id or a slug to the numeric id.
async function resolveBusinessId(idOrSlug) {
  if (/^\d+$/.test(idOrSlug)) return Number(idOrSlug);
  const [rows] = await pool.query('SELECT id FROM businesses WHERE slug = ?', [idOrSlug]);
  return rows[0] ? rows[0].id : null;
}

// ---------------------------------------------------------------------------
// GET /api/businesses -- public list. Query params:
//   site (site code, e.g. "site1"), category (slug), city, search,
//   priceMin, priceMax, verified (0/1), homeVisit (0/1),
//   sort (name | rating_desc | price_asc | price_desc | newest),
//   page, pageSize (max 100, default 20)
// Admin (JWT) can omit `site` to see businesses from every site.
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      site,
      category,
      city,
      search,
      priceMin,
      priceMax,
      verified,
      homeVisit,
      sort,
      page = '1',
      pageSize = '20',
    } = req.query;

    const where = [];
    const params = [];
    let joins = '';

    let resolvedSiteId = null;
    if (site) {
      const [siteRows] = await pool.query('SELECT id FROM sites WHERE code = ?', [site]);
      resolvedSiteId = siteRows[0] ? siteRows[0].id : null;
      joins += ' JOIN business_sites fbs ON fbs.business_id = b.id JOIN sites fs ON fs.id = fbs.site_id';
      where.push('fs.code = ?');
      params.push(site);
    }
    if (category) {
      joins +=
        ' JOIN business_categories fbc ON fbc.business_id = b.id JOIN categories fc ON fc.id = fbc.category_id';
      where.push('fc.slug = ?');
      params.push(category);
      // Categories are per-site -- when a site filter is active, only match
      // this business's categories as tagged on that specific site.
      if (site) where.push('fbc.site_id = fs.id');
    }
    if (city) {
      where.push('b.city = ?');
      params.push(city);
    }
    if (search) {
      where.push('(b.name LIKE ? OR b.tagline LIKE ? OR b.short_description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (priceMin) {
      where.push('b.price_from >= ?');
      params.push(Number(priceMin));
    }
    if (priceMax) {
      where.push('b.price_from <= ?');
      params.push(Number(priceMax));
    }
    if (verified !== undefined) {
      where.push('b.verified = ?');
      params.push(verified === '1' || verified === 'true' ? 1 : 0);
    }
    if (homeVisit !== undefined) {
      where.push('b.home_visit = ?');
      params.push(homeVisit === '1' || homeVisit === 'true' ? 1 : 0);
    }

    const sortMap = {
      rating_desc: 'b.rating DESC',
      price_asc: 'b.price_from ASC',
      price_desc: 'b.price_from DESC',
      newest: 'b.created_at DESC',
      name: 'b.name ASC',
    };
    const orderBy = sortMap[sort] || sortMap.name;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (pageNum - 1) * size;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [totalRows] = await pool.query(
      `SELECT COUNT(DISTINCT b.id) AS total FROM businesses b ${joins} ${whereSql}`,
      params
    );
    const total = totalRows[0].total;

    const [rows] = await pool.query(
      `SELECT DISTINCT b.* FROM businesses b ${joins} ${whereSql}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    const ids = rows.map((r) => r.id);
    const children = await loadChildrenForIds(ids, resolvedSiteId);

    const items = rows.map((row) => ({
      ...mapBusinessRow(row),
      sites: children.sites.get(row.id) || [],
      categories: children.categories.get(row.id) || [],
      badges: children.badges.get(row.id) || [],
      images: (children.images.get(row.id) || []).map((i) => i.url),
    }));

    return res.json({ items, total, page: pageNum, pageSize: size });
  })
);

// ---------------------------------------------------------------------------
// GET /api/businesses/:id -- public full detail. :id can be numeric id or slug.
// Optional `?site=` (site code, e.g. "site1"): also flattens that one site's
// scoped data (info/badges/categories/rates/services/paragraphs/specialties)
// to top-level fields, matching the shape the public sites' frontends expect
// (see web_a_minh's api/spas.js mapDetail()) -- without it only `siteData`
// (every site at once, keyed by site id, for the admin edit form) is returned.
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = await resolveBusinessId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Không tìm thấy dịch vụ.' });

    let resolvedSiteId = null;
    if (req.query.site) {
      const [siteLookup] = await pool.query('SELECT id FROM sites WHERE code = ?', [req.query.site]);
      resolvedSiteId = siteLookup[0] ? siteLookup[0].id : null;
    }

    const [rows] = await pool.query('SELECT * FROM businesses WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy dịch vụ.' });

    // `site` is not restricted here -- the admin edit form needs every site's
    // data at once (one tab per site), so categories/badges come back for
    // every site the business belongs to, then get grouped below.
    const children = await loadChildrenForIds([id]);
    const [catRows] = await pool.query(
      `SELECT bc.site_id, c.id, c.slug, c.label
       FROM business_categories bc JOIN categories c ON c.id = bc.category_id
       WHERE bc.business_id = ? ORDER BY c.sort_order, c.label`,
      [id]
    );
    const [badgeRows] = await pool.query(
      `SELECT bb.site_id, b.id, b.key, b.label, b.color, bb.sort_order
       FROM business_badges bb JOIN badges b ON b.id = bb.badge_id
       WHERE bb.business_id = ? ORDER BY bb.sort_order`,
      [id]
    );
    const [info] = await pool.query(
      'SELECT site_id, label, value FROM business_info WHERE business_id = ? ORDER BY sort_order, id',
      [id]
    );
    const [paragraphs] = await pool.query(
      'SELECT site_id, content FROM business_paragraphs WHERE business_id = ? ORDER BY sort_order, id',
      [id]
    );
    const [specialties] = await pool.query(
      'SELECT site_id, label FROM business_specialties WHERE business_id = ? ORDER BY sort_order, id',
      [id]
    );
    const [services] = await pool.query(
      'SELECT id, site_id, name, included, price, extra_price, sort_order FROM business_services WHERE business_id = ? ORDER BY sort_order, id',
      [id]
    );
    const [rates] = await pool.query(
      'SELECT id, site_id, time_label, studio_price, home_price, sort_order FROM business_rates WHERE business_id = ? ORDER BY sort_order, id',
      [id]
    );
    const [reviews] = await pool.query(
      'SELECT id, site_id, author, review_date, rating, text, reply FROM business_reviews WHERE business_id = ? ORDER BY review_date DESC, id DESC',
      [id]
    );

    const siteRows = children.sites.get(id) || [];
    const siteData = {};
    for (const s of siteRows) siteData[s.id] = emptySiteData();
    const ensure = (sid) => (siteData[sid] || (siteData[sid] = emptySiteData()));

    for (const r of catRows) ensure(r.site_id).categoryIds.push(r.id);
    for (const r of badgeRows) ensure(r.site_id).badgeIds.push(r.id);
    for (const r of info) ensure(r.site_id).info.push({ label: r.label, value: r.value });
    for (const r of paragraphs) ensure(r.site_id).paragraphs.push(r.content);
    for (const r of specialties) ensure(r.site_id).specialties.push(r.label);
    for (const r of services) {
      ensure(r.site_id).services.push({
        id: r.id,
        name: r.name,
        included: r.included === null ? null : !!r.included,
        price: r.price === null ? null : Number(r.price),
        extraPrice: r.extra_price === null ? null : Number(r.extra_price),
        sortOrder: r.sort_order,
      });
    }
    for (const r of rates) {
      ensure(r.site_id).rates.push({
        id: r.id,
        timeLabel: r.time_label,
        studioPrice: r.studio_price === null ? null : Number(r.studio_price),
        homePrice: r.home_price === null ? null : Number(r.home_price),
        sortOrder: r.sort_order,
      });
    }
    for (const r of reviews) {
      ensure(r.site_id).reviews.push({
        id: r.id,
        author: r.author,
        reviewDate: r.review_date,
        rating: r.rating,
        text: r.text,
        reply: r.reply,
      });
    }

    // Flattened single-site view, only built when `?site=` matched a real
    // site -- reuses the arrays already queried above (filtered by site_id)
    // instead of hitting the DB again.
    const flatSite = resolvedSiteId
      ? {
          categories: catRows
            .filter((r) => r.site_id === resolvedSiteId)
            .map((r) => ({ id: r.id, slug: r.slug, label: r.label })),
          badges: badgeRows
            .filter((r) => r.site_id === resolvedSiteId)
            .map((r) => ({ id: r.id, key: r.key, label: r.label, color: r.color })),
          info: info
            .filter((r) => r.site_id === resolvedSiteId)
            .map((r) => ({ label: r.label, value: r.value })),
          paragraphs: paragraphs.filter((r) => r.site_id === resolvedSiteId).map((r) => r.content),
          specialties: specialties.filter((r) => r.site_id === resolvedSiteId).map((r) => r.label),
          services: services
            .filter((r) => r.site_id === resolvedSiteId)
            .map((r) => ({
              id: r.id,
              name: r.name,
              included: r.included === null ? null : !!r.included,
              price: r.price === null ? null : Number(r.price),
              extraPrice: r.extra_price === null ? null : Number(r.extra_price),
            })),
          rates: rates
            .filter((r) => r.site_id === resolvedSiteId)
            .map((r) => ({
              id: r.id,
              timeLabel: r.time_label,
              studioPrice: r.studio_price === null ? null : Number(r.studio_price),
              homePrice: r.home_price === null ? null : Number(r.home_price),
            })),
          reviews: reviews
            .filter((r) => r.site_id === resolvedSiteId)
            .map((r) => ({
              id: r.id,
              author: r.author,
              reviewDate: r.review_date,
              rating: r.rating,
              text: r.text,
              reply: r.reply,
            })),
        }
      : {};

    return res.json({
      ...mapBusinessRow(rows[0]),
      sites: siteRows,
      images: children.images.get(id) || [],
      siteData,
      ...flatSite,
    });
  })
);

// ---------------------------------------------------------------------------
// Shared transactional writer for POST (insert) and PUT (update): applies
// basic columns then fully replaces every child collection (delete+reinsert)
// -- same "full replace" semantics the legacy sites already used for their
// child tables, kept here for consistency and simplicity.
// ---------------------------------------------------------------------------
const BASIC_COLUMNS = [
  ['name', 'name'],
  ['tagline', 'tagline'],
  ['city', 'city'],
  ['neighborhood', 'neighborhood'],
  ['country', 'country'],
  ['address', 'address'],
  ['phone', 'phone'],
  ['priceFrom', 'price_from'],
  ['priceUnit', 'price_unit'],
  ['priceRange', 'price_range'],
  ['rating', 'rating'],
  ['reviewCount', 'review_count'],
  ['savedCount', 'saved_count'],
  ['questionCount', 'question_count'],
  ['verified', 'verified'],
  ['homeVisit', 'home_visit'],
  ['heroImage', 'hero_image'],
  ['shortDescription', 'short_description'],
];

// Inserts the base `businesses` row for a new record and returns its id.
// Shared by the POST route and the mock-data seed script (server/migrate/)
// so both go through the exact same "omit undefined fields, let DB DEFAULT
// apply" logic instead of duplicating it.
export async function insertBusinessBase(conn, slug, payload) {
  const columns = ['slug', 'name'];
  const placeholders = ['?', '?'];
  const values = [slug, payload.name];
  for (const [apiKey, col] of BASIC_COLUMNS) {
    if (apiKey === 'name' || payload[apiKey] === undefined) continue;
    columns.push(col);
    placeholders.push('?');
    values.push(payload[apiKey]);
  }
  const [result] = await conn.query(
    `INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  );
  return result.insertId;
}

// `payload.siteData` is `{ [siteId]: { categoryIds, badgeIds, info,
// paragraphs, specialties, services, rates, reviews } }` -- one entry per id
// in `payload.siteIds` (BusinessForm.vue's per-site tabs). Every site-scoped
// table is fully cleared then reinserted per site, same "full replace"
// semantics as before, just partitioned by site_id now.
export async function writeChildren(conn, businessId, payload) {
  const { siteIds = [], siteData = {} } = payload;

  await conn.query('DELETE FROM business_sites WHERE business_id = ?', [businessId]);
  for (const siteId of siteIds) {
    await conn.query('INSERT INTO business_sites (business_id, site_id) VALUES (?, ?)', [
      businessId,
      siteId,
    ]);
  }

  await conn.query('DELETE FROM business_categories WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_badges WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_info WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_paragraphs WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_specialties WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_services WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_rates WHERE business_id = ?', [businessId]);
  await conn.query('DELETE FROM business_reviews WHERE business_id = ?', [businessId]);

  for (const siteId of siteIds) {
    const data = { ...emptySiteData(), ...(siteData[siteId] || {}) };
    const { categoryIds, badgeIds, info, paragraphs, specialties, services, rates, reviews } = data;

    for (const categoryId of categoryIds) {
      await conn.query(
        'INSERT INTO business_categories (business_id, site_id, category_id) VALUES (?, ?, ?)',
        [businessId, siteId, categoryId]
      );
    }

    for (let i = 0; i < badgeIds.length; i += 1) {
      await conn.query(
        'INSERT INTO business_badges (business_id, site_id, badge_id, sort_order) VALUES (?, ?, ?, ?)',
        [businessId, siteId, badgeIds[i], i]
      );
    }

    for (let i = 0; i < info.length; i += 1) {
      if (!info[i].label || !info[i].value) continue;
      await conn.query(
        'INSERT INTO business_info (business_id, site_id, label, value, sort_order) VALUES (?, ?, ?, ?, ?)',
        [businessId, siteId, info[i].label, info[i].value, i]
      );
    }

    for (let i = 0; i < paragraphs.length; i += 1) {
      const content = typeof paragraphs[i] === 'string' ? paragraphs[i] : paragraphs[i]?.content;
      if (!content) continue;
      await conn.query(
        'INSERT INTO business_paragraphs (business_id, site_id, content, sort_order) VALUES (?, ?, ?, ?)',
        [businessId, siteId, content, i]
      );
    }

    for (let i = 0; i < specialties.length; i += 1) {
      const label = typeof specialties[i] === 'string' ? specialties[i] : specialties[i]?.label;
      if (!label) continue;
      await conn.query(
        'INSERT INTO business_specialties (business_id, site_id, label, sort_order) VALUES (?, ?, ?, ?)',
        [businessId, siteId, label, i]
      );
    }

    for (let i = 0; i < services.length; i += 1) {
      const s = services[i];
      if (!s.name) continue;
      await conn.query(
        'INSERT INTO business_services (business_id, site_id, name, included, price, extra_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          businessId,
          siteId,
          s.name,
          s.included === undefined || s.included === null ? null : s.included ? 1 : 0,
          s.price ?? null,
          s.included ? null : s.extraPrice ?? null,
          i,
        ]
      );
    }

    for (let i = 0; i < rates.length; i += 1) {
      const r = rates[i];
      if (!r.timeLabel) continue;
      await conn.query(
        'INSERT INTO business_rates (business_id, site_id, time_label, studio_price, home_price, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [businessId, siteId, r.timeLabel, r.studioPrice ?? null, r.homePrice ?? null, i]
      );
    }

    for (const r of reviews) {
      if (!r.author || !r.text) continue;
      await conn.query(
        'INSERT INTO business_reviews (business_id, site_id, author, review_date, rating, text, reply) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [businessId, siteId, r.author, r.reviewDate || new Date(), r.rating || 5, r.text, r.reply || null]
      );
    }
  }
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    if (!payload.name) return res.status(400).json({ error: 'Tên (name) là bắt buộc.' });
    // siteIds is intentionally NOT required here (unlike the old behavior):
    // BusinessForm.vue auto-creates a nameless "draft" row the moment the
    // admin opens "Thêm dịch vụ mới", before any site has been picked, so
    // image upload (which needs a real id) works immediately. The "must
    // belong to at least one site to be a real listing" rule is still
    // enforced client-side in submit() before the admin's actual save.

    const [existing] = await pool.query('SELECT slug FROM businesses');
    const existingSlugs = new Set(existing.map((r) => r.slug));
    const baseSlug = slugify(payload.slug || payload.name);
    const slug = uniqueSlug(baseSlug, existingSlugs);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const insertId = await insertBusinessBase(conn, slug, payload);
      await writeChildren(conn, insertId, payload);
      await conn.commit();
      return res.status(201).json({ id: insertId, slug });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = await resolveBusinessId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Không tìm thấy dịch vụ.' });
    const payload = req.body || {};

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let slug;
      if (payload.slug) {
        const [existing] = await conn.query('SELECT slug FROM businesses WHERE id != ?', [id]);
        slug = uniqueSlug(slugify(payload.slug), new Set(existing.map((r) => r.slug)));
      }

      const setClauses = slug ? ['slug = ?'] : [];
      const values = slug ? [slug] : [];
      for (const [apiKey, col] of BASIC_COLUMNS) {
        if (payload[apiKey] === undefined) continue;
        setClauses.push(`${col} = ?`);
        values.push(payload[apiKey]);
      }
      if (setClauses.length) {
        values.push(id);
        await conn.query(`UPDATE businesses SET ${setClauses.join(', ')} WHERE id = ?`, values);
      }

      await writeChildren(conn, id, payload);
      await conn.commit();
      return res.json({ id, slug: slug || undefined });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = await resolveBusinessId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Không tìm thấy dịch vụ.' });
    const [images] = await pool.query('SELECT url FROM business_images WHERE business_id = ?', [id]);
    await pool.query('DELETE FROM businesses WHERE id = ?', [id]); // cascades every child table
    images.forEach((img) => deleteUploadedFile(img.url));
    return res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// Images (multipart upload -- cannot go through the JSON body above)
// ---------------------------------------------------------------------------
router.post(
  '/:id/images',
  requireAuth,
  // 'images' accepts one or many files in the same field (admin sends every
  // picked file under this name whether it's a single-file or multi-file
  // selection) — up to 20 per request.
  uploadImage.array('images', 20),
  asyncHandler(async (req, res) => {
    const id = await resolveBusinessId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Không tìm thấy dịch vụ.' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Chưa tải lên tệp ảnh nào.' });

    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM business_images WHERE business_id = ?',
      [id]
    );

    // Only the very first image ever added (across this whole request) becomes
    // primary — the rest just append after it, in the order they were picked.
    const uploaded = [];
    let sortOrder = count;
    let heroUrl = null;
    for (const file of req.files) {
      const url = `/uploads/${file.filename}`;
      const isPrimary = sortOrder === 0 ? 1 : 0;
      const [result] = await pool.query(
        'INSERT INTO business_images (business_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
        [id, url, sortOrder, isPrimary]
      );
      if (isPrimary) heroUrl = url;
      uploaded.push({ id: result.insertId, url, isPrimary: !!isPrimary });
      sortOrder += 1;
    }
    if (heroUrl) {
      await pool.query('UPDATE businesses SET hero_image = ? WHERE id = ?', [heroUrl, id]);
    }
    return res.status(201).json(uploaded);
  })
);

router.delete(
  '/:id/images/:imageId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT url FROM business_images WHERE id = ?', [req.params.imageId]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy ảnh.' });
    await pool.query('DELETE FROM business_images WHERE id = ?', [req.params.imageId]);
    deleteUploadedFile(rows[0].url);
    return res.status(204).end();
  })
);

router.patch(
  '/:id/images/:imageId/primary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = await resolveBusinessId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Không tìm thấy dịch vụ.' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE business_images SET is_primary = 0 WHERE business_id = ?', [id]);
      await conn.query('UPDATE business_images SET is_primary = 1 WHERE id = ? AND business_id = ?', [
        req.params.imageId,
        id,
      ]);
      const [rows] = await conn.query('SELECT url FROM business_images WHERE id = ?', [
        req.params.imageId,
      ]);
      if (rows[0]) {
        await conn.query('UPDATE businesses SET hero_image = ? WHERE id = ?', [rows[0].url, id]);
      }
      await conn.commit();
      return res.status(204).end();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

export default router;
