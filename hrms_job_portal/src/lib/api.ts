const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

async function parseBody(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildUrl(path: string) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const apiPath = clean.startsWith('/api/') ? clean : `/api${clean}`;
  return `${RAW_BASE}${apiPath}`;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildUrl(path), { ...init, headers: { ...(init?.headers || {}) } });
  const body = await parseBody(res);
  if (!res.ok) {
    const detail = (body as any)?.detail || `Request failed (${res.status})`;
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`);
  }
  return body as T;
}

export async function apiPost<T>(path: string, payload: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(payload),
    ...init,
  });
  const body = await parseBody(res);
  if (!res.ok) {
    const detail = (body as any)?.detail || `Request failed (${res.status})`;
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`);
  }
  return body as T;
}

export type UploadKind = 'resume' | 'avatar' | 'logo' | 'cover';

export async function uploadPortalFile(file: File, kind: UploadKind): Promise<string> {
  const res = await fetch(buildUrl(`/public/uploads?kind=${kind}`), {
    method: 'POST',
    body: (() => {
      const fd = new FormData();
      fd.append('file', file);
      return fd;
    })(),
  });
  const body = await parseBody(res);
  if (!res.ok) {
    const detail = (body as any)?.detail || 'Upload failed';
    throw new Error(typeof detail === 'string' ? detail : 'Upload failed');
  }
  const url = (body as any)?.url;
  if (!url) throw new Error('Upload failed — no URL returned');
  return url as string;
}

export function absoluteUrl(url?: string) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${RAW_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

export function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

export function prettify(value?: string) {
  return (value || '').replace(/_/g, ' ');
}
