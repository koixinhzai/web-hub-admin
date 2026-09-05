<script setup>
import { ref, onMounted } from 'vue';
import { fetchBadges, createBadge, updateBadge, deleteBadge } from '../api/badges';
import './admin.css';

const items = ref([]);
const error = ref('');
const editing = ref(null);
const form = ref({ key: '', label: '', color: 'accent', sortOrder: 0 });

async function load() { items.value = await fetchBadges(); }
function startCreate() { editing.value = 'new'; form.value = { key: '', label: '', color: 'accent', sortOrder: 0 }; }
function startEdit(b) { editing.value = b.id; form.value = { ...b }; }

async function save() {
  error.value = '';
  try {
    if (editing.value === 'new') await createBadge(form.value);
    else await updateBadge(editing.value, form.value);
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (!confirm('Xóa huy hiệu này? Các dịch vụ vẫn giữ những huy hiệu khác.')) return;
  try {
    await deleteBadge(id);
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
      <h1>Huy hiệu</h1>
      <button class="admin-btn admin-btn-primary" @click="startCreate">+ Thêm huy hiệu</button>
    </div>
    <p v-if="error" class="admin-error">{{ error }}</p>

    <form v-if="editing" class="admin-inline-form" @submit.prevent="save">
      <input v-model="form.key" placeholder="key (vd: verified)" required :disabled="editing !== 'new'" />
      <input v-model="form.label" placeholder="Nhãn" required />
      <select v-model="form.color">
        <option value="accent">accent</option>
        <option value="gold">gold</option>
        <option value="danger">danger</option>
      </select>
      <input v-model.number="form.sortOrder" type="number" placeholder="Thứ tự sắp xếp" style="width: 110px" />
      <button class="admin-btn admin-btn-primary" type="submit">Lưu</button>
      <button class="admin-btn" type="button" @click="editing = null">Hủy</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Key</th><th>Nhãn</th><th>Màu</th><th></th></tr></thead>
      <tbody>
        <tr v-for="b in items" :key="b.id">
          <td>{{ b.key }}</td>
          <td>{{ b.label }}</td>
          <td>{{ b.color }}</td>
          <td class="admin-row-actions">
            <button class="admin-link" @click="startEdit(b)">Sửa</button>
            <button class="admin-link-danger" @click="remove(b.id)">Xóa</button>
          </td>
        </tr>
        <tr v-if="!items.length"><td colspan="4" class="admin-muted">Chưa có huy hiệu nào.</td></tr>
      </tbody>
    </table>
  </div>
</template>
