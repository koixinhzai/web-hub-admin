<script setup>
import { ref, onMounted } from 'vue';
import { fetchSites, createSite, updateSite, deleteSite } from '../api/sites';
import './admin.css';

const items = ref([]);
const error = ref('');
const editing = ref(null);
const form = ref({ code: '', name: '', domain: '' });

async function load() { items.value = await fetchSites(); }
function startCreate() { editing.value = 'new'; form.value = { code: '', name: '', domain: '' }; }
function startEdit(s) { editing.value = s.id; form.value = { ...s }; }

async function save() {
  error.value = '';
  try {
    if (editing.value === 'new') await createSite(form.value);
    else await updateSite(editing.value, form.value);
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (!confirm('Xóa trang web này? Các dịch vụ sẽ ngừng hiển thị trên trang này nhưng không bị xóa.')) return;
  try {
    await deleteSite(id);
    await load();
  } catch (e) {
    alert(e.message);
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-header">
      <h1>Trang web</h1>
      <button class="admin-btn admin-btn-primary" @click="startCreate">+ Thêm trang web</button>
    </div>
    <p class="admin-muted">
      Mỗi dòng tương ứng một trang web công khai dùng chung cơ sở dữ liệu này. Thêm trang thứ 4, thứ 5… chỉ cần
      thêm một dòng mới ở đây — không cần thay đổi schema hay backend.
    </p>
    <p v-if="error" class="admin-error">{{ error }}</p>

    <form v-if="editing" class="admin-inline-form" @submit.prevent="save">
      <input v-model="form.code" placeholder="code (vd: site4)" required :disabled="editing !== 'new'" />
      <input v-model="form.name" placeholder="Tên hiển thị" required />
      <input v-model="form.domain" placeholder="Tên miền production (tùy chọn)" />
      <button class="admin-btn admin-btn-primary" type="submit">Lưu</button>
      <button class="admin-btn" type="button" @click="editing = null">Hủy</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Code</th><th>Tên</th><th>Tên miền</th><th></th></tr></thead>
      <tbody>
        <tr v-for="s in items" :key="s.id">
          <td>{{ s.code }}</td>
          <td>{{ s.name }}</td>
          <td>{{ s.domain || '—' }}</td>
          <td class="admin-row-actions">
            <button class="admin-link" @click="startEdit(s)">Sửa</button>
            <button class="admin-link-danger" @click="remove(s.id)">Xóa</button>
          </td>
        </tr>
        <tr v-if="!items.length"><td colspan="4" class="admin-muted">Chưa có trang web nào.</td></tr>
      </tbody>
    </table>
  </div>
</template>
