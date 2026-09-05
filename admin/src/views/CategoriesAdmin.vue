<script setup>
import { ref, onMounted } from 'vue';
import { fetchCategories, createCategory, updateCategory, deleteCategory } from '../api/categories';
import './admin.css';

const items = ref([]);
const error = ref('');
const editing = ref(null); // 'new', a category id, or null
const form = ref({ slug: '', label: '', title: '', icon: '', sortOrder: 0 });

async function load() { items.value = await fetchCategories(); }

function startCreate() { editing.value = 'new'; form.value = { slug: '', label: '', title: '', icon: '', sortOrder: 0 }; }
function startEdit(c) { editing.value = c.id; form.value = { ...c }; }

async function save() {
  error.value = '';
  try {
    if (editing.value === 'new') await createCategory(form.value);
    else await updateCategory(editing.value, form.value);
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (!confirm('Xóa danh mục này? Các dịch vụ vẫn giữ những danh mục khác.')) return;
  try {
    await deleteCategory(id);
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
      <h1>Danh mục</h1>
      <button class="admin-btn admin-btn-primary" @click="startCreate">+ Thêm danh mục</button>
    </div>
    <p v-if="error" class="admin-error">{{ error }}</p>

    <form v-if="editing" class="admin-inline-form" @submit.prevent="save">
      <input v-model="form.slug" placeholder="slug (vd: massage)" required />
      <input v-model="form.label" placeholder="Nhãn" required />
      <input v-model="form.title" placeholder="Tiêu đề (văn bản heading)" />
      <input v-model="form.icon" placeholder="Biểu tượng (emoji)" style="width: 80px" />
      <input v-model.number="form.sortOrder" type="number" placeholder="Thứ tự sắp xếp" style="width: 110px" />
      <button class="admin-btn admin-btn-primary" type="submit">Lưu</button>
      <button class="admin-btn" type="button" @click="editing = null">Hủy</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Biểu tượng</th><th>Slug</th><th>Nhãn</th><th>Tiêu đề</th><th>Dịch vụ</th><th></th></tr></thead>
      <tbody>
        <tr v-for="c in items" :key="c.id">
          <td>{{ c.icon }}</td>
          <td>{{ c.slug }}</td>
          <td>{{ c.label }}</td>
          <td>{{ c.title }}</td>
          <td>{{ c.businessCount }}</td>
          <td class="admin-row-actions">
            <button class="admin-link" @click="startEdit(c)">Sửa</button>
            <button class="admin-link-danger" @click="remove(c.id)">Xóa</button>
          </td>
        </tr>
        <tr v-if="!items.length"><td colspan="6" class="admin-muted">Chưa có danh mục nào.</td></tr>
      </tbody>
    </table>
  </div>
</template>
