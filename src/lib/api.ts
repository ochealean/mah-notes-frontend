// ============================================================
//  Tiny fetch wrapper. Attaches the JWT and base URL, unwraps
//  JSON, and throws a clean Error(message) on failure.
// ============================================================
const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'mahnotes_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(method: string, path: string, body?: any) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text }; } }

  if (!res.ok) {
    const err: any = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p: string) => request('GET', p),
  post: (p: string, b?: any) => request('POST', p, b ?? {}),
  put: (p: string, b?: any) => request('PUT', p, b ?? {}),
  patch: (p: string, b?: any) => request('PATCH', p, b ?? {}),
  del: (p: string) => request('DELETE', p),
};

export const API_BASE = BASE;
