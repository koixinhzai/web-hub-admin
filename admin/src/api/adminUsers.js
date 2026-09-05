import { http } from './http';

// Note: nested under /api/auth (see server/routes/auth.js), not /api/admin-users.
export const fetchAdminUsers = () => http.get('/api/auth/admin-users');
export const createAdminUser = (payload) => http.post('/api/auth/admin-users', payload);
export const updateAdminUser = (id, payload) => http.put(`/api/auth/admin-users/${id}`, payload);
export const deleteAdminUser = (id) => http.del(`/api/auth/admin-users/${id}`);
