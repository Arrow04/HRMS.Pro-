// Appends the auth JWT to /uploads/* URLs.
// <img> and <a> tags cannot send an Authorization header, and the backend's
// file route accepts ?token= as an alternative for exactly this reason.
// Non-upload URLs (data:, http(s):, public /static, etc.) pass through unchanged.
export const uploadUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) return url || '';
  try {
    const token = localStorage.getItem('token');
    if (!token) return url;
    const u = new URL(url, window.location.origin);
    u.searchParams.set('token', token);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};
