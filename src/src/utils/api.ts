const API_URL = import.meta.env.VITE_API_URL || '/api';

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { ...headers, ...(rest.headers as Record<string, string> || {}) }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    // Surface Zod validation field errors if present (array of {path, message})
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      const fieldErrors = error.details
        .map((d: { path: string; message: string }) => `${d.path}: ${d.message}`)
        .join('; ');
      throw new Error(fieldErrors);
    }
    // Build a diagnostic string from whatever fields the backend surfaced.
    // Some routes (e.g. admin rankings import) return separate detail/hint
    // fields; prefer concatenating them so toasts show the real DB error
    // instead of a generic "Failed to X".
    const parts = [error.error || `HTTP ${response.status}`];
    if (typeof error.detail === 'string' && error.detail) parts.push(error.detail);
    if (typeof error.hint === 'string' && error.hint) parts.push(`hint: ${error.hint}`);
    throw new Error(parts.join(' — '));
  }

  return response.json();
}

export function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), token });
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET', token });
}

export function apiPatch<T>(path: string, body: unknown, token?: string): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), token });
}

export function apiDelete<T>(path: string, token?: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE', token });
}

export function apiPut<T>(path: string, body: unknown, token?: string): Promise<T> {
  return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), token });
}

/** Upload a file via multipart/form-data (no JSON Content-Type header). */
export async function apiUpload<T>(path: string, formData: FormData, token?: string): Promise<T> {
  const API_URL_INNER = import.meta.env.VITE_API_URL || '/api';
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // Do NOT set Content-Type — browser sets multipart boundary automatically

  const response = await fetch(`${API_URL_INNER}${path}`, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}
