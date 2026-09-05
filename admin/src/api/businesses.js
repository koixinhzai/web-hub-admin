import { http } from './http';

export function fetchBusinesses(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) query.set(key, value.join(','));
    } else {
      query.set(key, value);
    }
  }
  const qs = query.toString();
  return http.get(`/api/businesses${qs ? `?${qs}` : ''}`);
}

export const fetchBusiness = (id) => http.get(`/api/businesses/${id}`);
export const createBusiness = (payload) => http.post('/api/businesses', payload);
export const updateBusiness = (id, payload) => http.put(`/api/businesses/${id}`, payload);
export const deleteBusiness = (id) => http.del(`/api/businesses/${id}`);

export function uploadBusinessImages(id, files) {
  const form = new FormData();
  for (const file of files) form.append('images', file);
  return http.post(`/api/businesses/${id}/images`, form);
}
export const deleteBusinessImage = (id, imageId) => http.del(`/api/businesses/${id}/images/${imageId}`);
export const setPrimaryBusinessImage = (id, imageId) => http.patch(`/api/businesses/${id}/images/${imageId}/primary`);
