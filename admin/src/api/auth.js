import { http } from './http';

export const login = (username, password) => http.post('/api/auth/login', { username, password });
export const fetchMe = () => http.get('/api/auth/me');
