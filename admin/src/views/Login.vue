<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAdminAuth } from '../store/adminAuth';
import './admin.css';

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const router = useRouter();
const route = useRoute();
const { login } = useAdminAuth();

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await login(username.value, password.value);
    router.push(route.query.redirect || '/businesses');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="admin-login-page">
    <form class="admin-login-card" @submit.prevent="submit">
      <h1>🗂️ Quản trị web_hub</h1>
      <p class="sub">Đăng nhập để quản lý dịch vụ trên mọi trang web.</p>
      <label>
        Tên đăng nhập
        <input v-model="username" type="text" required autofocus />
      </label>
      <label>
        Mật khẩu
        <input v-model="password" type="password" required />
      </label>
      <p v-if="error" class="admin-error">{{ error }}</p>
      <button class="admin-btn admin-btn-primary" type="submit" :disabled="loading">
        {{ loading ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
    </form>
  </div>
</template>
