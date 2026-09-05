import { http } from './http';

export const fetchSites = () => http.get('/api/sites');
export const createSite = (payload) => http.post('/api/sites', payload);
export const updateSite = (id, payload) => http.put(`/api/sites/${id}`, payload);
export const deleteSite = (id) => http.del(`/api/sites/${id}`);
