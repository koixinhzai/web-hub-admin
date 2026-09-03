// One-off migration: imports each site's existing mock data (src/data/*.js —
// there is no real admin-entered data yet on any of the 3 sites, only these
// mock/demo fixtures) into the unified web_hub database, tagging every
// business with the site it came from via business_sites.
//
// Safe to re-run: re-matches existing categories/badges by slug/key, and
// existing businesses by slug (skips a business whose slug already exists
// with a note, rather than creating a duplicate) — see `skipExisting` below.
//
// Usage: npm run db:seed-mock   (from web_hub/server)
import 'dotenv/config';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { pool } from '../db.js';
import { slugify, uniqueSlug } from '../utils/slugify.js';
import { insertBusinessBase, writeChildren } from '../routes/businesses.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The 3 sibling site projects, sitting next to web_hub on disk.
const SITE1_ROOT = path.resolve(__dirname, '../../../web_a_minh');
const SITE2_ROOT = path.resolve(__dirname, '../../../web_a_minh2');
const SITE3_ROOT = path.resolve(__dirname, '../../../web_a_minh3');

function importFrom(root, relPath) {
  return import(pathToFileURL(path.join(root, relPath)).href);
}

// --- shared lookup caches, built once and reused/extended across all 3 sites ---
let categoryIdBySlug = new Map();
let badgeIdByKey = new Map();
let businessSlugs = new Set();
let siteIdByCode = new Map();

async function loadCaches() {
  const [cats] = await pool.query('SELECT id, slug FROM categories');
  categoryIdBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  const [badges] = await pool.query('SELECT id, `key` FROM badges');
  badgeIdByKey = new Map(badges.map((b) => [b.key, b.id]));

  const [rows] = await pool.query('SELECT slug FROM businesses');
  businessSlugs = new Set(rows.map((r) => r.slug));

  const [sites] = await pool.query('SELECT id, code FROM sites');
  siteIdByCode = new Map(sites.map((s) => [s.code, s.id]));
}

async function getOrCreateCategory(conn, { slug, label, title, icon }) {
  const finalSlug = slug || slugify(label);
  if (categoryIdBySlug.has(finalSlug)) return categoryIdBySlug.get(finalSlug);
  const [result] = await conn.query(
    'INSERT INTO categories (slug, label, title, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
    [finalSlug, label, title || label, icon || null, categoryIdBySlug.size]
  );
  categoryIdBySlug.set(finalSlug, result.insertId);
  return result.insertId;
}

async function getOrCreateBadge(conn, { key, label, color }) {
  if (badgeIdByKey.has(key)) return badgeIdByKey.get(key);
  const [result] = await conn.query('INSERT INTO badges (`key`, label, color, sort_order) VALUES (?, ?, ?, ?)', [
    key,
    label,
    color,
    badgeIdByKey.size * 10,
  ]);
  badgeIdByKey.set(key, result.insertId);
  return result.insertId;
}

// Inserts one business (base row + every child collection) inside its own
// transaction, reusing the exact same writer the admin API uses.
async function insertBusiness(payload, siteCode) {
  const siteId = siteIdByCode.get(siteCode);
  if (!siteId) throw new Error(`Unknown site code "${siteCode}" — check sql/schema.sql seed.`);

  const baseSlug = slugify(payload.slug || payload.name);
  if (businessSlugs.has(baseSlug)) {
    console.log(`  ↷ skip "${payload.name}" — slug "${baseSlug}" already migrated`);
    return;
  }
  const slug = uniqueSlug(baseSlug, businessSlugs);
  businessSlugs.add(slug);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = await insertBusinessBase(conn, slug, payload);
    // writeChildren() now expects site-scoped child data nested under
    // `siteData[siteId]` (see server/routes/businesses.js) instead of flat
    // top-level fields — each mock business only ever lands on the one site
    // it was seeded from, so just wrap everything under that single id.
    const {
      categoryIds = [],
      badgeIds = [],
      info = [],
      paragraphs = [],
      specialties = [],
      services = [],
      rates = [],
      reviews = [],
    } = payload;
    await writeChildren(conn, id, {
      siteIds: [siteId],
      siteData: {
        [siteId]: { categoryIds, badgeIds, info, paragraphs, specialties, services, rates, reviews },
      },
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Site 1 — VIP Spa Directory (badges are inline booleans, no reviews table,
// no images in the mock data — the frontend falls back to a placeholder).
// Badge key mapping: mock uses camelCase (isNew), schema.sql pre-seeded the
// 6 site-1 badges with snake_case keys (is_new) — map explicitly.
// ---------------------------------------------------------------------------
const SITE1_BADGE_KEY = {
  isNew: 'is_new',
  independent: 'independent',
  video: 'video',
  review: 'review',
  verified: 'verified',
  top: 'top',
};

async function seedSite1() {
  console.log('\n== Site 1: VIP Spa Directory ==');
  const { categories } = await importFrom(SITE1_ROOT, 'src/data/categories.js');
  const { spas } = await importFrom(SITE1_ROOT, 'src/data/spas.js');

  const conn = await pool.getConnection();
  for (const c of categories) {
    if (!c.slug) continue; // skip the pseudo "Home" category
    await getOrCreateCategory(conn, c);
  }
  conn.release();

  console.log(`  importing ${spas.length} spas...`);
  for (const s of spas) {
    const categoryIds = (s.categories || [])
      .map((slug) => categoryIdBySlug.get(slug))
      .filter(Boolean);
    const badgeIds = [];
    for (const [mockKey, active] of Object.entries(s.badges || {})) {
      if (!active) continue;
      const unifiedKey = SITE1_BADGE_KEY[mockKey];
      if (unifiedKey && badgeIdByKey.has(unifiedKey)) badgeIds.push(badgeIdByKey.get(unifiedKey));
    }
    const info = [];
    const addInfo = (label, value) => {
      if (value) info.push({ label, value: String(value) });
    };
    addInfo('Gender', s.gender);
    addInfo('Experience', s.experience);
    addInfo('Specialty', s.specialty);
    addInfo('Certification', s.certification);
    addInfo('Session length', s.sessionLength);
    addInfo('Nationality', s.nationality);
    addInfo('Languages', s.languages);
    addInfo('Session type', s.sessionType);
    addInfo('Working hours', s.workingHours);

    await insertBusiness(
      {
        slug: s.id,
        name: s.name,
        city: s.city,
        country: s.country,
        neighborhood: s.cityPart,
        phone: s.phone,
        priceRange: s.priceRange,
        reviewCount: s.reviewsCount || 0,
        homeVisit: !!s.homeVisit,
        shortDescription: s.bio,
        categoryIds,
        badgeIds,
        info,
        services: (s.services || []).map((sv) => ({
          name: sv.name,
          included: sv.included,
          extraPrice: sv.included ? null : sv.extra ?? null,
        })),
        rates: (s.rates || []).map((r) => ({
          timeLabel: r.time,
          studioPrice: r.studio || null,
          homePrice: r.home === false || r.home === undefined ? null : r.home,
        })),
      },
      'site1'
    );
  }
}

// ---------------------------------------------------------------------------
// Site 2 — Serene Spa Directory (has real reviews, badges as a master list,
// cities/areas — unified schema keeps city/neighborhood as free text on the
// business row instead of a separate cities/areas table, see MERGE_PLAN.md).
// ---------------------------------------------------------------------------
async function seedSite2() {
  console.log('\n== Site 2: Serene Spa Directory ==');
  const { categories } = await importFrom(SITE2_ROOT, 'src/data/categories.js');
  const { locationGroups } = await importFrom(SITE2_ROOT, 'src/data/locations.js');
  const { spas, badgeMeta } = await importFrom(SITE2_ROOT, 'src/data/spas.js');

  const areaBySlug = new Map();
  for (const group of locationGroups) {
    for (const area of group.areas) {
      areaBySlug.set(area.slug, { city: group.group, label: area.label });
    }
  }

  const conn = await pool.getConnection();
  for (const c of categories) await getOrCreateCategory(conn, c);
  for (const [key, meta] of Object.entries(badgeMeta || {})) {
    await getOrCreateBadge(conn, { key, label: meta.label, color: meta.color });
  }
  conn.release();

  console.log(`  importing ${spas.length} spas...`);
  for (const s of spas) {
    const area = areaBySlug.get(s.area);
    const categoryIds = (s.categories || [])
      .map((slug) => categoryIdBySlug.get(slug))
      .filter(Boolean);
    const badgeIds = (s.badges || []).map((key) => badgeIdByKey.get(key)).filter(Boolean);

    await insertBusiness(
      {
        slug: s.id,
        name: s.name,
        tagline: s.tagline,
        city: s.city || area?.city,
        neighborhood: area?.label,
        address: s.address,
        rating: s.rating,
        reviewCount: s.reviewCount || 0,
        heroImage: s.cover,
        shortDescription: s.bio,
        categoryIds,
        badgeIds,
        info: Object.entries(s.info || {}).map(([label, value]) => ({ label, value: String(value) })),
        images: [], // images inserted separately below (writeChildren doesn't own business_images)
        rates: (s.rates || []).map((r) => ({ timeLabel: r.duration, studioPrice: r.price, homePrice: null })),
        services: (s.services || []).map((sv) => ({
          name: sv.name,
          included: sv.included,
          extraPrice: sv.included ? null : sv.extraPrice ?? null,
        })),
        reviews: (s.reviews || []).map((r) => ({
          author: r.author,
          reviewDate: r.date,
          rating: r.rating,
          text: r.text,
        })),
      },
      'site2'
    );

    // business_images isn't part of writeChildren (it's managed by the
    // upload endpoints, which expect a real file) — insert the mock image
    // URLs directly here since these are already-hosted external URLs.
    if (s.images?.length) {
      const [rows] = await pool.query('SELECT id FROM businesses WHERE slug = ?', [s.id]);
      const businessId = rows[0]?.id;
      if (businessId) {
        for (let i = 0; i < s.images.length; i += 1) {
          await pool.query(
            'INSERT INTO business_images (business_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
            [businessId, s.images[i], i, i === 0 ? 1 : 0]
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Site 3 — GlowBook Salon Directory (single category per salon, description
// paragraphs + specialty tags, reviews with an optional reply).
// ---------------------------------------------------------------------------
const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const pad2 = (n) => String(n).padStart(2, '0');

// Some mock review dates are calendar-invalid (e.g. site 3's seed data has
// "29 Feb 2026" — 2026 is not a leap year; the site's own seed.sql notes it
// had to be hand-corrected to the 28th). Walk the day back until it's a real
// date instead of letting MySQL reject the INSERT outright.
function clampToRealDate(year, monthIdx, day) {
  let d = day;
  while (d > 0) {
    const dt = new Date(Date.UTC(year, monthIdx, d));
    if (dt.getUTCFullYear() === year && dt.getUTCMonth() === monthIdx && dt.getUTCDate() === d) {
      return `${year}-${pad2(monthIdx + 1)}-${pad2(d)}`;
    }
    d -= 1;
  }
  return `${year}-${pad2(monthIdx + 1)}-01`;
}

// "11 May 2026" -> "2026-05-11". Parsed manually (not via Date+toISOString,
// which converts through UTC and silently shifts the date by a day in any
// timezone ahead of UTC, e.g. UTC+7 turns "11 May" local midnight into "10
// May" UTC) — found by spot-checking site 3's migrated review dates.
function parseDisplayDate(input) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(String(input).trim());
  if (m) {
    const monthIdx = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    if (monthIdx !== undefined) return clampToRealDate(Number(m[3]), monthIdx, Number(m[1]));
  }
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
}

async function seedSite3() {
  console.log('\n== Site 3: GlowBook Salon Directory ==');
  const { salons } = await importFrom(SITE3_ROOT, 'src/data/salons.js');

  console.log(`  importing ${salons.length} salons...`);
  for (const s of salons) {
    const conn = await pool.getConnection();
    const categoryId = s.category
      ? await getOrCreateCategory(conn, { label: s.category, title: s.category })
      : null;
    conn.release();

    await insertBusiness(
      {
        slug: s.id,
        name: s.name,
        tagline: s.tagline,
        city: s.city,
        neighborhood: s.neighborhood,
        verified: !!s.verified,
        savedCount: s.savedCount || 0,
        questionCount: s.questionCount || 0,
        rating: s.rating,
        reviewCount: s.reviewCount || 0,
        priceFrom: s.priceFrom,
        priceUnit: s.priceUnit,
        heroImage: s.heroImage,
        shortDescription: s.shortDescription,
        categoryIds: categoryId ? [categoryId] : [],
        paragraphs: s.longDescription || [],
        specialties: s.specialties || [],
        info: Object.entries(s.details || {}).map(([key, value]) => ({
          label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
          value: String(value),
        })),
        services: (s.servicesPricing || []).map((sv) => ({ name: sv.name, price: sv.price })),
        reviews: (s.reviews || []).map((r) => ({
          author: r.name,
          reviewDate: parseDisplayDate(r.date),
          rating: r.rating,
          text: r.comment,
          reply: r.reply || null,
        })),
      },
      'site3'
    );

    if (s.images?.length) {
      const [rows] = await pool.query('SELECT id FROM businesses WHERE slug = ?', [s.id]);
      const businessId = rows[0]?.id;
      if (businessId) {
        for (let i = 0; i < s.images.length; i += 1) {
          await pool.query(
            'INSERT INTO business_images (business_id, url, sort_order, is_primary) VALUES (?, ?, ?, ?)',
            [businessId, s.images[i], i, i === 0 ? 1 : 0]
          );
        }
      }
    }
  }
}

async function main() {
  await loadCaches();
  await seedSite1();
  await loadCaches();
  await seedSite2();
  await loadCaches();
  await seedSite3();

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM businesses');
  console.log(`\nDone. businesses table now has ${total} rows total.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
