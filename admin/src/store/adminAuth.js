import { reactive, computed } from 'vue';
import { login as loginApi, fetchMe } from '../api/auth';

const state = reactive({
  token: localStorage.getItem('admin_token') || '',
  user: null,
  restored: false,
});

export function useAdminAuth() {
  const isAuthenticated = computed(() => !!state.token);

  async function login(username, password) {
    const data = await loginApi(username, password);
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('admin_token', data.token);
  }

  function logout() {
    state.token = '';
    state.user = null;
    localStorage.removeItem('admin_token');
  }

  // Validates the stored token (if any) against the server, once per app load.
  async function restore() {
    if (state.restored) return;
    state.restored = true;
    if (!state.token) return;
    try {
      state.user = await fetchMe();
    } catch {
      logout();
    }
  }

  return { state, isAuthenticated, login, logout, restore };
}
