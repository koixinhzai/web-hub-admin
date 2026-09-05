<script setup>
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAdminAuth } from '../store/adminAuth';
import './admin.css';

const route = useRoute();
const router = useRouter();
const { state, logout } = useAdminAuth();

function handleLogout() {
  logout();
  router.push('/login');
}
</script>

<template>
  <div class="admin-app">
    <aside class="admin-sidebar">
      <div class="admin-brand">🗂️ Quản trị web_hub</div>
      <nav>
        <RouterLink to="/businesses">Dịch vụ</RouterLink>
        <RouterLink to="/categories">Danh mục</RouterLink>
        <RouterLink to="/badges">Huy hiệu</RouterLink>
        <RouterLink to="/sites">Trang web</RouterLink>
        <RouterLink to="/admins">Người dùng quản trị</RouterLink>
      </nav>
      <div class="admin-user">
        <span>{{ state.user?.displayName || state.user?.username }}</span>
        <button @click="handleLogout">Đăng xuất</button>
      </div>
    </aside>
    <main class="admin-main">
      <!-- :key forces the routed view to remount on every path change, even
           when two routes share the same component (e.g. "Thêm dịch vụ" ->
           /businesses/new -> auto-creates a draft -> router.replace()s to
           /businesses/:id/edit, both rendering BusinessForm). Without this,
           Vue Router patches the existing instance in place instead of
           remounting it, so BusinessForm's onMounted() never re-runs and the
           page is stuck showing "Đang tải…" forever even though every API
           call already succeeded. -->
      <RouterView :key="route.fullPath" />
    </main>
  </div>
</template>
