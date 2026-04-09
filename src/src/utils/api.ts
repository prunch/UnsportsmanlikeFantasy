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
    // Surface Zod validation field errors if present
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      const fieldErrors = error.details
        .map((d: { path: string; message: string }) => `${d.path}: ${d.message}`)
        .join('; ');
      throw new Error(fieldErrors);
    }
    throw new Error(error.error || `HTTP ${response.status}`);
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
