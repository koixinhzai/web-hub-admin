// Thin fetch wrapper: attaches the admin JWT (if present) and normalizes error handling.
// Base is relative ('') so requests go through the Vite dev proxy in dev, and hit the
// same-origin Express server in production (see vite.config.js / server/index.js).

async function request(path, options = {}) {
  const token = localStorage.getItem('admin_token');
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body (e.g. some error pages) — fall through with data = null
  }

  if (!res.ok) {
    throw new Error(data?.error || `Yêu cầu thất bại (${res.status})`);
  }
  return data;
}

export const http = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: (path) => request(path, { method: 'PATCH' }),
  del: (path) => request(path, { method: 'DELETE' }),
};
