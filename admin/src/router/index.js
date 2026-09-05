import { createRouter, createWebHistory } from 'vue-router';
import { useAdminAuth } from '../store/adminAuth';

import Login from '../views/Login.vue';
import AdminLayout from '../views/AdminLayout.vue';
import BusinessesList from '../views/BusinessesList.vue';
import BusinessForm from '../views/BusinessForm.vue';
import CategoriesAdmin from '../views/CategoriesAdmin.vue';
import BadgesAdmin from '../views/BadgesAdmin.vue';
import SitesAdmin from '../views/SitesAdmin.vue';
import AdminUsersAdmin from '../views/AdminUsersAdmin.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login },
    {
      path: '/',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/businesses' },
        { path: 'businesses', name: 'businesses', component: BusinessesList },
        { path: 'businesses/new', name: 'business-new', component: BusinessForm },
        { path: 'businesses/:id/edit', name: 'business-edit', component: BusinessForm, props: true },
        { path: 'categories', name: 'categories', component: CategoriesAdmin },
        { path: 'badges', name: 'badges', component: BadgesAdmin },
        { path: 'sites', name: 'sites', component: SitesAdmin },
        { path: 'admins', name: 'admins', component: AdminUsersAdmin },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { isAuthenticated, restore } = useAdminAuth();
    await restore();
    if (!isAuthenticated.value) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }
});

export default router;
