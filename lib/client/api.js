'use client';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body; // fetch define o Content-Type do multipart
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const r = await fetch(`/api${path}`, opts);
  if (r.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new CustomEvent('nexos:unauthorized'));
  }
  if (raw) return r;
  const contentType = r.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) throw new ApiError(r.status, data?.error || `Erro ${r.status}`);
  return data;
}
