import { http } from './http';

export const fetchCategories = () => http.get('/api/categories');
export const createCategory = (payload) => http.post('/api/categories', payload);
export const updateCategory = (id, payload) => http.put(`/api/categories/${id}`, payload);
export const deleteCategory = (id) => http.del(`/api/categories/${id}`);
