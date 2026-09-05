<script setup>
import { reactive, computed, onMounted, ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  fetchBusiness, createBusiness, updateBusiness,
  uploadBusinessImages, deleteBusinessImage, setPrimaryBusinessImage,
} from '../api/businesses';
import { fetchSites } from '../api/sites';
import { fetchCategories } from '../api/categories';
import { fetchBadges } from '../api/badges';
import './admin.css';

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => !!route.params.id);
const businessId = computed(() => route.params.id);

// Placeholder name for the row auto-created the instant "Thêm dịch vụ mới"
// is opened (see onMounted below), so image upload — which needs a real id
// — works right away instead of requiring a manual save first.
const DRAFT_NAME = 'Dịch vụ mới';
// True only for that freshly auto-created row, for as long as the admin
// stays on this page (carried across the /new → /:id/edit redirect via the
// ?draft=1 query param, not persisted beyond that). Lets slugPreview() keep
// deriving the URL slug from whatever name the admin types, the same way it
// would have before the first manual save — otherwise the slug would stay
// stuck on "dich-vu-moi" forever. Reopening this same service later (a
// normal "Sửa" from the list, no ?draft=1) leaves it false, so editing the
// name on an already-published service never silently changes its URL.
const isDraft = ref(false);
// True once the admin has typed into the Slug field themselves — stops any
// further automatic slug updates so we never override a manual choice.
const slugEdited = ref(false);

const loading = ref(true);
const saving = ref(false);
const error = ref('');

const sites = ref([]);
const categories = ref([]);
const badges = ref([]);
const images = ref([]); // [{id, url, isPrimary}] — only populated in edit mode

// Shared fields (name, hero image via `images` above, and every other basic
// column) are entered once here and apply to every site the service is on.
const form = reactive({
  slug: '',
  name: '',
  tagline: '',
  city: '',
  neighborhood: '',
  country: '',
  address: '',
  phone: '',
  priceFrom: null,
  priceUnit: '',
  priceRange: '',
  rating: 4.5,
  reviewCount: 0,
  savedCount: 0,
  questionCount: 0,
  verified: false,
  homeVisit: false,
  shortDescription: '',
  siteIds: [],
  // Everything else (categories, badges, description paragraphs,
  // specialties, info table, services, rate card, reviews) is entered
  // separately per site — siteData[siteId] holds one full set of these.
  siteData: {},
});

const activeSiteTab = ref(null);

// Pre-filled so a freshly added site tab starts with the usual info/service
// rows already in place instead of blank — the admin just edits or deletes
// what doesn't apply rather than typing every row from scratch each time.
function defaultInfo() {
  return [
    { label: 'Gender', value: 'Female' },
    { label: 'Age', value: '25' },
    { label: 'Height', value: '165cm' },
    { label: 'Weight', value: '49' },
    { label: 'Nationality', value: 'VietNam' },
    { label: 'Languages', value: 'English, China' },
    { label: 'Meeting with', value: 'Man' },
  ];
}

function defaultServices() {
  return [
    'Shower together', 'Roam', 'Chest push', 'BJ', 'FJ', 'Simple massage',
    '69Type', 'French kiss', 'Bath oral sex', 'Deep throat', 'Boobs Fuck',
    'Nuru Gel B2B Erotic massage',
  ].map((name) => ({ name, included: true, price: null, extraPrice: null }));
}

function defaultRates() {
  return [
    { timeLabel: '1 hour', studioPrice: 150, homePrice: 250 },
    { timeLabel: '1.5 hour', studioPrice: 200, homePrice: 350 },
    { timeLabel: '2 hour', studioPrice: 250, homePrice: 400 },
  ];
}

function emptySiteData() {
  return {
    categoryIds: [],
    badgeIds: [],
    info: defaultInfo(),
    paragraphs: [''],
    specialties: [''],
    services: defaultServices(),
    rates: defaultRates(),
    reviews: [],
  };
}

function ensureSiteData(siteId) {
  if (!form.siteData[siteId]) form.siteData[siteId] = emptySiteData();
  return form.siteData[siteId];
}

const activeSiteData = computed(() => (
  activeSiteTab.value != null ? ensureSiteData(activeSiteTab.value) : null
));

function siteName(siteId) {
  return sites.value.find((s) => s.id === siteId)?.name || `#${siteId}`;
}

function toggleSite(siteId) {
  const i = form.siteIds.indexOf(siteId);
  if (i === -1) {
    form.siteIds.push(siteId);
    ensureSiteData(siteId);
    activeSiteTab.value = siteId;
  } else {
    form.siteIds.splice(i, 1);
    if (activeSiteTab.value === siteId) {
      activeSiteTab.value = form.siteIds.length ? form.siteIds[0] : null;
    }
  }
}

function addInfo() { activeSiteData.value.info.push({ label: '', value: '' }); }
function removeInfo(i) { activeSiteData.value.info.splice(i, 1); }
function addService() { activeSiteData.value.services.push({ name: '', included: true, price: null, extraPrice: null }); }
function removeService(i) { activeSiteData.value.services.splice(i, 1); }
function addRate() { activeSiteData.value.rates.push({ timeLabel: '', studioPrice: null, homePrice: null }); }
function removeRate(i) { activeSiteData.value.rates.splice(i, 1); }
function addReview() {
  activeSiteData.value.reviews.push({ author: '', reviewDate: new Date().toISOString().slice(0, 10), rating: 5, text: '', reply: '' });
}
function removeReview(i) { activeSiteData.value.reviews.splice(i, 1); }

function toggleId(list, id) {
  const i = list.indexOf(id);
  if (i === -1) list.push(id);
  else list.splice(i, 1);
}

// Strips accents/diacritics and non-alphanumerics to build a URL slug from
// a display name. Shared by slugPreview() (interactive preview) and
// submit() (guarantees the draft's placeholder slug is replaced by one
// matching the real name even if the admin never touches the Slug field).
function computeSlugFromName(name) {
  const decomposed = name.normalize('NFD');
  let stripped = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0);
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    if (!isCombiningMark) stripped += ch;
  }
  return stripped.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Client-side preview only (final slug/uniqueness is always resolved by the
// server — see server/utils/slugify.js) — just saves a round trip before save.
function slugPreview() {
  if (slugEdited.value || !form.name) return;
  if (isEdit.value && !isDraft.value) return; // don't silently change an already-published URL
  form.slug = computeSlugFromName(form.name);
}

async function loadLookups() {
  const [s, c, b] = await Promise.all([fetchSites(), fetchCategories(), fetchBadges()]);
  sites.value = s;
  categories.value = c;
  badges.value = b;
}

async function loadBusiness() {
  const b = await fetchBusiness(businessId.value);
  form.slug = b.slug;
  form.name = b.name;
  form.tagline = b.tagline || '';
  form.city = b.city || '';
  form.neighborhood = b.neighborhood || '';
  form.country = b.country || '';
  form.address = b.address || '';
  form.phone = b.phone || '';
  form.priceFrom = b.priceFrom;
  form.priceUnit = b.priceUnit || '';
  form.priceRange = b.priceRange || '';
  form.rating = b.rating;
  form.reviewCount = b.reviewCount;
  form.savedCount = b.savedCount;
  form.questionCount = b.questionCount;
  form.verified = b.verified;
  form.homeVisit = b.homeVisit;
  form.shortDescription = b.shortDescription || '';
  form.siteIds = b.sites.map((s) => s.id);
  form.siteData = {};
  for (const siteId of form.siteIds) {
    const d = b.siteData[siteId] || {};
    form.siteData[siteId] = {
      categoryIds: d.categoryIds || [],
      badgeIds: d.badgeIds || [],
      info: d.info && d.info.length ? d.info.map((r) => ({ ...r })) : defaultInfo(),
      paragraphs: d.paragraphs && d.paragraphs.length ? [...d.paragraphs] : [''],
      specialties: d.specialties && d.specialties.length ? [...d.specialties] : [''],
      services: d.services && d.services.length ? d.services.map((s) => ({ ...s })) : defaultServices(),
      rates: d.rates && d.rates.length ? d.rates.map((r) => ({ ...r })) : defaultRates(),
      reviews: (d.reviews || []).map((r) => ({ ...r, reply: r.reply || '' })),
    };
  }
  activeSiteTab.value = form.siteIds.length ? form.siteIds[0] : null;
  images.value = b.images;
}

onMounted(async () => {
  loading.value = true;
  let redirecting = false;
  try {
    await loadLookups();
    if (isEdit.value) {
      await loadBusiness();
      isDraft.value = route.query.draft === '1';
    } else {
      // Auto-create the row right away instead of waiting for a manual
      // "Lưu" — see the DRAFT_NAME comment above. `loading` stays true
      // through the redirect below (the `finally` skips resetting it, see
      // `redirecting`) so the admin never sees an in-between empty-form
      // flash; the replacement route re-mounts this component fresh and
      // re-enters this same onMounted, this time via the isEdit branch.
      redirecting = true;
      const draft = await createBusiness({ name: DRAFT_NAME, siteIds: [] });
      await router.replace({ path: `/businesses/${draft.id}/edit`, query: { draft: '1' } });
    }
  } catch (e) {
    error.value = e.message;
    redirecting = false;
  } finally {
    if (!redirecting) loading.value = false;
  }
});

async function submit() {
  error.value = '';
  if (!form.name) { error.value = 'Tên là bắt buộc.'; return; }
  if (!form.siteIds.length) { error.value = 'Chọn ít nhất một trang web.'; return; }
  saving.value = true;
  try {
    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    const siteDataPayload = {};
    for (const siteId of form.siteIds) {
      const d = ensureSiteData(siteId);
      siteDataPayload[siteId] = {
        categoryIds: d.categoryIds,
        badgeIds: d.badgeIds,
        info: d.info.filter((i) => i.label && i.value),
        paragraphs: d.paragraphs.filter(Boolean),
        specialties: d.specialties.filter(Boolean),
        // included: true = bundled ("Included"), false = add-on ("Extra cost", uses
        // extraPrice), null = plain priced line item (uses price) — see the 3-way
        // <select> below, matches server/routes/businesses.js's tri-state column.
        services: d.services
          .filter((s) => s.name)
          .map((s) => ({
            name: s.name,
            included: s.included,
            price: s.included === null ? num(s.price) : null,
            extraPrice: s.included === false ? num(s.extraPrice) : null,
          })),
        rates: d.rates
          .filter((r) => r.timeLabel)
          .map((r) => ({ timeLabel: r.timeLabel, studioPrice: num(r.studioPrice), homePrice: num(r.homePrice) })),
        reviews: d.reviews
          .filter((r) => r.author && r.text)
          .map((r) => ({ ...r, rating: Number(r.rating) || 5, reply: r.reply || null })),
      };
    }

    // Guarantees the draft's placeholder slug ("dich-vu-moi") gets replaced
    // by one matching the real name on first real save, even if the admin
    // never focused the Slug field to trigger slugPreview()'s live preview.
    const slugToSend = isDraft.value && !slugEdited.value
      ? computeSlugFromName(form.name)
      : form.slug || undefined;

    const payload = {
      slug: slugToSend,
      name: form.name,
      tagline: form.tagline || null,
      city: form.city || null,
      neighborhood: form.neighborhood || null,
      country: form.country || null,
      address: form.address || null,
      phone: form.phone || null,
      priceFrom: num(form.priceFrom),
      priceUnit: form.priceUnit || null,
      priceRange: form.priceRange || null,
      rating: Number(form.rating) || 0,
      reviewCount: Number(form.reviewCount) || 0,
      savedCount: Number(form.savedCount) || 0,
      questionCount: Number(form.questionCount) || 0,
      verified: !!form.verified,
      homeVisit: !!form.homeVisit,
      shortDescription: form.shortDescription || null,
      siteIds: form.siteIds,
      siteData: siteDataPayload,
    };
    if (isEdit.value) {
      await updateBusiness(businessId.value, payload);
      router.push('/businesses');
    } else {
      // Normally unreachable now that onMounted() always auto-creates the
      // row first (isEdit is true by the time this form can be submitted at
      // all) — kept as a defensive fallback.
      const result = await createBusiness(payload);
      router.push(`/businesses/${result.id}/edit`);
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function onUploadImage(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  try {
    const uploaded = await uploadBusinessImages(businessId.value, files);
    images.value.push(...uploaded);
  } catch (err) {
    alert(err.message);
  } finally {
    e.target.value = '';
  }
}

async function onDeleteImage(imageId) {
  if (!confirm('Xóa ảnh này?')) return;
  try {
    await deleteBusinessImage(businessId.value, imageId);
    images.value = images.value.filter((i) => i.id !== imageId);
  } catch (err) {
    alert(err.message);
  }
}

async function onSetPrimary(imageId) {
  try {
    await setPrimaryBusinessImage(businessId.value, imageId);
    images.value = images.value.map((i) => ({ ...i, isPrimary: i.id === imageId }));
  } catch (err) {
    alert(err.message);
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <h1>{{ isDraft ? 'Thêm dịch vụ mới' : `Sửa dịch vụ: ${form.name}` }}</h1>
      <RouterLink to="/businesses" class="admin-btn">← Quay lại danh sách</RouterLink>
    </div>

    <p v-if="loading" class="admin-muted">Đang tải…</p>
    <form v-else class="admin-form" @submit.prevent="submit">
      <p v-if="error" class="admin-error">{{ error }}</p>

      <fieldset class="admin-fieldset">
        <legend>Thông tin cơ bản</legend>
        <p class="admin-muted">Tiêu đề, hình ảnh và các thông tin dưới đây dùng chung cho mọi trang web mà dịch vụ này xuất hiện.</p>
        <label>
          Đường dẫn (Slug)
          <input v-model="form.slug" @input="slugEdited = true" @blur="slugPreview" placeholder="tự động tạo từ tên nếu để trống" />
        </label>
        <label>
          Tên
          <input v-model="form.name" required />
        </label>
        <label>
          Khẩu hiệu
          <input v-model="form.tagline" />
        </label>
        <div class="admin-row">
          <label style="flex:1">
            Thành phố
            <input v-model="form.city" />
          </label>
          <label style="flex:1">
            Khu vực / quận
            <input v-model="form.neighborhood" />
          </label>
          <label style="flex:1">
            Quốc gia
            <input v-model="form.country" />
          </label>
        </div>
        <label>
          Địa chỉ
          <input v-model="form.address" />
        </label>
        <label>
          Điện thoại
          <input v-model="form.phone" />
        </label>
        <div class="admin-row">
          <label style="flex:1">
            Giá từ
            <input v-model="form.priceFrom" type="number" min="0" step="0.01" />
          </label>
          <label style="flex:1">
            Đơn vị giá (vd: /buổi)
            <input v-model="form.priceUnit" />
          </label>
          <label style="flex:1">
            Nhãn khoảng giá (cũ, tùy chọn)
            <input v-model="form.priceRange" />
          </label>
        </div>
        <div class="admin-row">
          <label style="flex:1">
            Đánh giá
            <input v-model="form.rating" type="number" min="0" max="5" step="0.1" />
          </label>
          <label style="flex:1">
            Số lượt đánh giá
            <input v-model="form.reviewCount" type="number" min="0" />
          </label>
          <label style="flex:1">
            Số lượt lưu
            <input v-model="form.savedCount" type="number" min="0" />
          </label>
          <label style="flex:1">
            Số câu hỏi
            <input v-model="form.questionCount" type="number" min="0" />
          </label>
        </div>
        <div class="admin-checkbox-grid">
          <label class="admin-checkbox"><input type="checkbox" v-model="form.verified" /> Đã xác minh</label>
          <label class="admin-checkbox"><input type="checkbox" v-model="form.homeVisit" /> Phục vụ tại nhà</label>
        </div>
        <label>
          Mô tả ngắn
          <textarea v-model="form.shortDescription" rows="3"></textarea>
        </label>
      </fieldset>

      <fieldset class="admin-fieldset">
        <legend>Trang web</legend>
        <p class="admin-muted">Dịch vụ này hiển thị trên (các) trang web nào. Chọn một trang để mở thẻ nhập nội dung riêng cho trang đó ở mục bên dưới.</p>
        <div class="admin-checkbox-grid">
          <label v-for="s in sites" :key="s.id" class="admin-checkbox">
            <input type="checkbox" :checked="form.siteIds.includes(s.id)" @change="toggleSite(s.id)" />
            {{ s.name }}
          </label>
        </div>
      </fieldset>

      <fieldset class="admin-fieldset">
        <legend>Hình ảnh</legend>
        <div class="admin-image-grid">
          <div v-for="img in images" :key="img.id" class="admin-image-item" :class="{ 'is-primary': img.isPrimary }">
            <img :src="img.url" :alt="form.name" />
            <div class="admin-image-item-actions">
              <button v-if="!img.isPrimary" type="button" class="admin-link" @click="onSetPrimary(img.id)">Đặt làm ảnh bìa</button>
              <span v-else class="admin-muted">Ảnh bìa</span>
              <button type="button" class="admin-link-danger" @click="onDeleteImage(img.id)">Xóa</button>
            </div>
          </div>
        </div>
        <input type="file" accept="image/*" multiple @change="onUploadImage" />
      </fieldset>

      <fieldset class="admin-fieldset">
        <legend>Nội dung theo từng trang web</legend>

        <p v-if="!form.siteIds.length" class="admin-muted">
          Chọn ít nhất một trang web ở mục "Trang web" phía trên để nhập danh mục, huy hiệu, mô tả, dịch vụ, bảng giá và đánh giá riêng cho từng trang.
        </p>

        <template v-else>
          <div class="admin-site-tabs">
            <button
              v-for="sid in form.siteIds"
              :key="sid"
              type="button"
              class="admin-tab-btn"
              :class="{ active: sid === activeSiteTab }"
              @click="activeSiteTab = sid"
            >{{ siteName(sid) }}</button>
          </div>

          <div v-if="activeSiteData">
            <div class="admin-subsection">
              <h3>Danh mục</h3>
              <div class="admin-checkbox-grid">
                <label v-for="c in categories" :key="c.id" class="admin-checkbox">
                  <input type="checkbox" :checked="activeSiteData.categoryIds.includes(c.id)" @change="toggleId(activeSiteData.categoryIds, c.id)" />
                  {{ c.icon }} {{ c.label }}
                </label>
              </div>
            </div>

            <div class="admin-subsection">
              <h3>Huy hiệu</h3>
              <div class="admin-checkbox-grid">
                <label v-for="b in badges" :key="b.id" class="admin-checkbox">
                  <input type="checkbox" :checked="activeSiteData.badgeIds.includes(b.id)" @change="toggleId(activeSiteData.badgeIds, b.id)" />
                  {{ b.label }}
                </label>
              </div>
            </div>

            <div class="admin-subsection">
              <h3>Đoạn mô tả</h3>
              <div v-for="(p, i) in activeSiteData.paragraphs" :key="i" class="admin-row">
                <textarea v-model="activeSiteData.paragraphs[i]" rows="2" style="flex:1" placeholder="Nội dung đoạn văn"></textarea>
                <button type="button" class="admin-link-danger" @click="activeSiteData.paragraphs.splice(i, 1)">✕</button>
              </div>
              <button type="button" class="admin-btn" @click="activeSiteData.paragraphs.push('')">+ Thêm đoạn văn</button>
            </div>

            <div class="admin-subsection">
              <h3>Chuyên môn</h3>
              <div v-for="(s, i) in activeSiteData.specialties" :key="i" class="admin-row">
                <input v-model="activeSiteData.specialties[i]" placeholder="Thẻ chuyên môn" />
                <button type="button" class="admin-link-danger" @click="activeSiteData.specialties.splice(i, 1)">✕</button>
              </div>
              <button type="button" class="admin-btn" @click="activeSiteData.specialties.push('')">+ Thêm chuyên môn</button>
            </div>

            <div class="admin-subsection">
              <h3>Bảng thông tin</h3>
              <p class="admin-muted">Thông tin dạng tự do (giới tính, kinh nghiệm, chứng chỉ, giờ mở cửa, …).</p>
              <div v-for="(row, i) in activeSiteData.info" :key="i" class="admin-row">
                <input v-model="row.label" placeholder="Nhãn (vd: Kinh nghiệm)" />
                <input v-model="row.value" placeholder="Giá trị" />
                <button type="button" class="admin-link-danger" @click="removeInfo(i)">✕</button>
              </div>
              <button type="button" class="admin-btn" @click="addInfo">+ Thêm dòng</button>
            </div>

            <div class="admin-subsection">
              <h3>Dịch vụ</h3>
              <div v-for="(row, i) in activeSiteData.services" :key="i" class="admin-service-row">
                <input v-model="row.name" placeholder="Tên dịch vụ" />
                <select v-model="row.included">
                  <option :value="true">Đã bao gồm</option>
                  <option :value="false">Phụ phí</option>
                  <option :value="null">Mục có giá riêng</option>
                </select>
                <input v-if="row.included === false" v-model.number="row.extraPrice" type="number" min="0" placeholder="Phụ phí" />
                <input v-else-if="row.included === null" v-model.number="row.price" type="number" min="0" placeholder="Giá" />
                <span v-else class="admin-muted">—</span>
                <button type="button" class="admin-link-danger" @click="removeService(i)">✕</button>
              </div>
              <button type="button" class="admin-btn" @click="addService">+ Thêm dịch vụ</button>
            </div>

            <div class="admin-subsection">
              <h3>Bảng giá theo thời lượng</h3>
              <div v-for="(row, i) in activeSiteData.rates" :key="i" class="admin-rate-row">
                <input v-model="row.timeLabel" placeholder="Thời lượng (vd: 60 phút)" />
                <input v-model.number="row.studioPrice" type="number" min="0" placeholder="Giá tại cơ sở" />
                <input v-model.number="row.homePrice" type="number" min="0" placeholder="Giá tại nhà" />
                <button type="button" class="admin-link-danger" @click="removeRate(i)">✕</button>
              </div>
              <button type="button" class="admin-btn" @click="addRate">+ Thêm mức giá</button>
            </div>

            <div class="admin-subsection">
              <h3>Đánh giá</h3>
              <div v-for="(row, i) in activeSiteData.reviews" :key="i" class="admin-review-row">
                <input v-model="row.author" placeholder="Người đánh giá" />
                <input v-model="row.reviewDate" type="date" />
                <select v-model.number="row.rating">
                  <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }} ⭐</option>
                </select>
                <textarea v-model="row.text" rows="2" placeholder="Nội dung đánh giá"></textarea>
                <button type="button" class="admin-link-danger" @click="removeReview(i)">✕</button>
                <textarea v-model="row.reply" rows="2" placeholder="Phản hồi của chủ (tùy chọn)" style="grid-column: 2 / span 3"></textarea>
              </div>
              <button type="button" class="admin-btn" @click="addReview">+ Thêm đánh giá</button>
            </div>
          </div>
        </template>
      </fieldset>

      <div class="admin-form-actions">
        <button class="admin-btn admin-btn-primary" type="submit" :disabled="saving">
          {{ saving ? 'Đang lưu…' : 'Lưu' }}
        </button>
      </div>
    </form>
  </div>
</template>
