/**
 * Format an ISO datetime string or time string into a human-readable
 * 12-hour format like "09:21 AM" or "06:12 PM".
 *
 * Handles:
 *   - Full ISO strings: "2026-09-18T09:21:00+05:30"
 *   - Plain times: "09:21" or "09:21:00"
 *   - Returns fallback for empty/null/invalid values
 */
export function formatTime(value?: string | null, fallback = '-'): string {
  if (!value) return fallback;
  const t = value.includes('T') ? (value.split('T')[1] || '') : value;
  const p = t.split(':');
  if (p.length < 2) return fallback;
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}
