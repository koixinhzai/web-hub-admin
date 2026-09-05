<script setup>
import { ref, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { fetchBusinesses, deleteBusiness } from '../api/businesses';
import { fetchSites } from '../api/sites';
import './admin.css';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const search = ref('');
const siteFilter = ref(''); // '' = every site (admin view)
const sites = ref([]);
const loading = ref(false);
const error = ref('');
const totalPages = ref(1);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchBusinesses({
      search: search.value,
      site: siteFilter.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    items.value = data.items;
    total.value = data.total;
    totalPages.value = Math.max(1, Math.ceil(data.total / pageSize.value));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function remove(item) {
  if (!confirm(`Xóa dịch vụ "${item.name}"? Thao tác này sẽ xóa khỏi mọi trang web và không thể hoàn tác.`)) return;
  try {
    await deleteBusiness(item.id);
    await load();
  } catch (e) {
    alert(e.message);
  }
}

function goToPage(p) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
}

watch(page, load);
watch(siteFilter, () => { page.value = 1; load(); });

let searchTimer;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 300);
});

onMounted(async () => {
  sites.value = await fetchSites();
  await load();
});
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <h1>Dịch vụ</h1>
      <RouterLink to="/businesses/new" class="admin-btn admin-btn-primary">+ Thêm dịch vụ</RouterLink>
    </div>

    <div class="admin-filters">
      <input v-model="search" class="admin-input" placeholder="Tìm theo tên, khẩu hiệu, mô tả…" />
      <select v-model="siteFilter">
        <option value="">Tất cả trang web</option>
        <option v-for="s in sites" :key="s.id" :value="s.code">{{ s.name }}</option>
      </select>
    </div>

    <p v-if="error" class="admin-error">{{ error }}</p>
    <p v-if="loading" class="admin-muted">Đang tải…</p>

    <table v-else class="admin-table">
      <thead>
        <tr><th>Tên</th><th>Trang web</th><th>Thành phố</th><th>Đánh giá</th><th>Lượt đánh giá</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>
            <strong>{{ item.name }}</strong>
            <div class="admin-muted">{{ item.tagline }}</div>
          </td>
          <td>
            <span v-for="s in item.sites" :key="s.id" class="admin-tag">{{ s.code }}</span>
          </td>
          <td>{{ item.city }}</td>
          <td>⭐ {{ item.rating }}</td>
          <td>{{ item.reviewCount }}</td>
          <td class="admin-row-actions">
            <RouterLink class="admin-link" :to="`/businesses/${item.id}/edit`">Sửa</RouterLink>
            <button class="admin-link-danger" @click="remove(item)">Xóa</button>
          </td>
        </tr>
        <tr v-if="!items.length"><td colspan="6" class="admin-muted">Không tìm thấy dịch vụ nào.</td></tr>
      </tbody>
    </table>

    <div class="admin-pagination">
      <button :disabled="page <= 1" @click="goToPage(page - 1)">‹ Trước</button>
      <span>Trang {{ page }} / {{ totalPages }} ({{ total }} tổng cộng)</span>
      <button :disabled="page >= totalPages" @click="goToPage(page + 1)">Tiếp ›</button>
    </div>
  </div>
</template>
