import { http } from './http';

export const fetchBadges = () => http.get('/api/badges');
export const createBadge = (payload) => http.post('/api/badges', payload);
export const updateBadge = (id, payload) => http.put(`/api/badges/${id}`, payload);
export const deleteBadge = (id) => http.del(`/api/badges/${id}`);
