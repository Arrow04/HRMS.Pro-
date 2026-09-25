export interface DateFormatOption {
  code: string;
  name: string;
  example: string;
}

// Builds a real example for a pattern using today's date.
const buildExample = (pattern: string): string => {
  const d = new Date();
  const year = String(d.getFullYear());
  const yy = year.slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const monthShort = d.toLocaleString('en-US', { month: 'short' });
  const monthLong = d.toLocaleString('en-US', { month: 'long' });
  const weekdayShort = d.toLocaleString('en-US', { weekday: 'short' });
  const weekdayLong = d.toLocaleString('en-US', { weekday: 'long' });
  const values: Record<string, string> = {
    YYYY: year, YY: yy, MMMM: monthLong, MMM: monthShort, MM: mm,
    M: String(d.getMonth() + 1), DD: dd, D: String(d.getDate()),
    EEEE: weekdayLong, EEE: weekdayShort,
  };
  return pattern.replace(/YYYY|YY|MMMM|MMM|EEEE|EEE|MM|M|DD|D/g, (t) => values[t] ?? t);
};

const PATTERNS: string[] = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'YYYY/MM/DD',
  'DD MMM YYYY',
  'DD MMMM YYYY',
  'DD-MMM-YYYY',
  'MMM DD, YYYY',
  'MMMM DD, YYYY',
  'EEE, DD MMM YYYY',
  'EEE MMM DD YYYY',
  'EEE, MMM DD YYYY',
  'D MMM YYYY',
  'D MMMM YYYY',
  'DD/MMM/YY',
  'YY-MM-DD',
  'MMM YYYY',
  'MMMM YYYY',
  'EEE, DD MMMM YYYY',
];

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = PATTERNS.map((code) => ({
  code,
  name: code,
  example: buildExample(code),
}));

// ── Time formats ────────────────────────────────────────────────────────────
export interface TimeFormatOption {
  code: string;
  name: string;
  example: string;
}

const buildTimeExample = (pattern: string): string => {
  const d = new Date();
  const h24 = d.getHours();
  const values: Record<string, string> = {
    HH: String(h24).padStart(2, '0'),
    hh: String(((h24 + 11) % 12) + 1).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0'),
    A: h24 < 12 ? 'AM' : 'PM',
    H: String(h24),
    h: String(((h24 + 11) % 12) + 1),
  };
  return pattern.replace(/HH|hh|mm|ss|A|H|h/g, (t) => values[t] ?? t);
};

// [stored pattern, display label] — 'A' is the formatter token for AM/PM
const TIME_PATTERNS: [string, string][] = [
  ['HH:mm', 'HH:mm (24-hour)'],
  ['HH:mm:ss', 'HH:mm:ss (24-hour with seconds)'],
  ['hh:mm A', 'hh:mm AM/PM'],
  ['hh:mm:ss A', 'hh:mm:ss AM/PM (with seconds)'],
  ['h:mm A', 'h:mm AM/PM (no leading zero)'],
  ['h:mm:ss A', 'h:mm:ss AM/PM (no leading zero, seconds)'],
];

export const TIME_FORMAT_OPTIONS: TimeFormatOption[] = TIME_PATTERNS.map(([code, name]) => ({
  code,
  name,
  example: buildTimeExample(code),
}));

// ── Financial year start months (local list, like the country catalog) ─────
export const FINANCIAL_YEAR_MONTHS: string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
