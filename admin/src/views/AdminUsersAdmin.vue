<script setup>
import { ref, onMounted } from 'vue';
import { fetchAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser } from '../api/adminUsers';
import { useAdminAuth } from '../store/adminAuth';
import './admin.css';

const { state } = useAdminAuth();
const items = ref([]);
const error = ref('');
const editing = ref(null);
const form = ref({ username: '', email: '', password: '', displayName: '' });

async function load() { items.value = await fetchAdminUsers(); }
function startCreate() { editing.value = 'new'; form.value = { username: '', email: '', password: '', displayName: '' }; }
function startEdit(u) { editing.value = u.id; form.value = { username: u.username, email: u.email || '', password: '', displayName: u.displayName || '' }; }

async function save() {
  error.value = '';
  try {
    if (editing.value === 'new') {
      await createAdminUser(form.value);
    } else {
      await updateAdminUser(editing.value, {
        email: form.value.email,
        displayName: form.value.displayName,
        password: form.value.password || undefined,
      });
    }
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (!confirm('Xóa tài khoản quản trị này?')) return;
  try {
    await deleteAdminUser(id);
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
      <h1>Tài khoản quản trị</h1>
      <button class="admin-btn admin-btn-primary" @click="startCreate">+ Thêm quản trị viên</button>
    </div>
    <p class="admin-muted">Một tài khoản đăng nhập dùng chung cho mọi trang web — không phân quyền theo từng trang.</p>
    <p v-if="error" class="admin-error">{{ error }}</p>

    <form v-if="editing" class="admin-inline-form" @submit.prevent="save">
      <input v-model="form.username" placeholder="Tên đăng nhập" required :disabled="editing !== 'new'" />
      <input v-model="form.email" type="email" placeholder="Email (tùy chọn)" />
      <input v-model="form.displayName" placeholder="Tên hiển thị" />
      <input
        v-model="form.password"
        type="password"
        :placeholder="editing === 'new' ? 'Mật khẩu (tối thiểu 8 ký tự)' : 'Mật khẩu mới (để trống nếu giữ nguyên)'"
        :required="editing === 'new'"
      />
      <button class="admin-btn admin-btn-primary" type="submit">Lưu</button>
      <button class="admin-btn" type="button" @click="editing = null">Hủy</button>
    </form>

    <table class="admin-table">
      <thead><tr><th>Tên đăng nhập</th><th>Email</th><th>Tên hiển thị</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in items" :key="u.id">
          <td>{{ u.username }}</td>
          <td>{{ u.email || '—' }}</td>
          <td>{{ u.displayName }}</td>
          <td class="admin-row-actions">
            <button class="admin-link" @click="startEdit(u)">Sửa</button>
            <button class="admin-link-danger" v-if="u.id !== state.user?.id" @click="remove(u.id)">Xóa</button>
          </td>
        </tr>
        <tr v-if="!items.length"><td colspan="4" class="admin-muted">Chưa có tài khoản quản trị nào.</td></tr>
      </tbody>
    </table>
  </div>
</template>
