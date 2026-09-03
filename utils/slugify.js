// Same logic as web_a_minh2/server/utils/slugify.js — NFD-normalize and strip
// Vietnamese diacritics before the usual slugify, so Vietnamese names produce
// readable ASCII slugs instead of being stripped to nothing.
// Unicode escapes are used throughout instead of raw literals so this file
// behaves the same regardless of the editor/hosting panel's file encoding.
export function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/đ/g, 'd') // đ
    .replace(/Đ/g, 'D') // Đ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Appends -2, -3, ... until `candidate` is not in `existingSlugs` (a Set).
// Used when creating/migrating a business whose slug would otherwise collide.
export function uniqueSlug(candidate, existingSlugs) {
  let slug = candidate;
  let n = 2;
  while (existingSlugs.has(slug)) {
    slug = `${candidate}-${n}`;
    n += 1;
  }
  return slug;
}
