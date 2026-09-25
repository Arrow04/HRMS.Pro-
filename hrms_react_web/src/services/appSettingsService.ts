import { useEffect, useState } from 'react';

// App-wide settings (date format, timezone, financial year) driven by the
// organization's settings page. Values are synced to localStorage by the
// Settings page so every module can format dates consistently.

export const APP_SETTINGS_EVENT = 'hrms-app-settings-changed';

const DEFAULTS = {
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'HH:mm',
  timezone: 'Asia/Kolkata',
  financialYear: 'April',
  country: 'India',
};

export interface AppSettings {
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  financialYear: string;
  country: string;
}

type ZonedDateParts = {
  weekday: string;
  weekdayLong: string;
  monthShort: string;
  monthLong: string;
  month2: string;
  day2: string;
  year: string;
};

const parseInputDate = (input: string | Date): Date | null => {
  const d = typeof input === 'string' ? new Date(input) : input;
  return isNaN(d.getTime()) ? null : d;
};

const getZonedParts = (d: Date, timezone: string): ZonedDateParts => {
  const base = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).formatToParts(d);

  const longMonth = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'long',
  }).format(d);

  const longWeekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(d);

  const map: Record<string, string> = {};
  base.forEach((part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });

  const month2 = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: '2-digit',
  })
    .formatToParts(d)
    .find((part) => part.type === 'month')?.value || '01';

  return {
    weekday: map.weekday || '',
    weekdayLong: longWeekday,
    monthShort: map.month || '',
    monthLong: longMonth,
    month2,
    day2: map.day || '01',
    year: map.year || String(d.getFullYear()),
  };
};

// Token-based date formatter. Supported tokens (longest match first):
// YYYY YY MMMM MMM MM M DD D EEEE EEE — everything else is a literal.
const renderToken = (token: string, parts: ZonedDateParts): string => {
  switch (token) {
    case 'YYYY': return parts.year;
    case 'YY': return parts.year.slice(-2);
    case 'MMMM': return parts.monthLong;
    case 'MMM': return parts.monthShort;
    case 'MM': return parts.month2;
    case 'M': return String(Number(parts.month2));
    case 'DD': return parts.day2;
    case 'D': return String(Number(parts.day2));
    case 'EEEE': return parts.weekdayLong;
    case 'EEE': return parts.weekday;
    default: return token;
  }
};

const TOKEN_PATTERN = /YYYY|YY|MMMM|MMM|EEEE|EEE|MM|M|DD|D/g;

const formatWithPattern = (parts: ZonedDateParts, pattern: string): string =>
  pattern.replace(TOKEN_PATTERN, (token) => renderToken(token, parts));

// Persist the app settings to localStorage (called by the Settings page on save)
export const syncAppSettings = (settings: Partial<AppSettings>): void => {
  try {
    if (settings.dateFormat !== undefined) localStorage.setItem('appDateFormat', settings.dateFormat);
    if (settings.timeFormat !== undefined) localStorage.setItem('appTimeFormat', settings.timeFormat);
    if (settings.timezone !== undefined) localStorage.setItem('appTimezone', settings.timezone);
    if (settings.financialYear !== undefined) localStorage.setItem('appFinancialYear', settings.financialYear);
    if (settings.country !== undefined) localStorage.setItem('appCountry', settings.country);
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_EVENT));
  } catch { /* ignore */ }
};

export const getAppSettings = (): AppSettings => {
  try {
    return {
      dateFormat: localStorage.getItem('appDateFormat') || DEFAULTS.dateFormat,
      timeFormat: localStorage.getItem('appTimeFormat') || DEFAULTS.timeFormat,
      timezone: localStorage.getItem('appTimezone') || DEFAULTS.timezone,
      financialYear: localStorage.getItem('appFinancialYear') || DEFAULTS.financialYear,
      country: localStorage.getItem('appCountry') || DEFAULTS.country,
    };
  } catch {
    return DEFAULTS;
  }
};

export const getAppDateFormat = (): string => getAppSettings().dateFormat;
export const getAppTimeFormat = (): string => getAppSettings().timeFormat;
export const getAppTimezone = (): string => getAppSettings().timezone;
export const getAppFinancialYear = (): string => getAppSettings().financialYear;
export const getAppCountry = (): string => getAppSettings().country;

/** Re-render consumers when org settings change (e.g. after saving Settings). */
export const useAppSettingsRevision = (): number => {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    window.addEventListener(APP_SETTINGS_EVENT, bump);
    return () => window.removeEventListener(APP_SETTINGS_EVENT, bump);
  }, []);
  return revision;
};

// Format a date string/Date using the org's configured date format and timezone.
export const formatAppDate = (input?: string | Date | null): string => {
  if (!input) return '-';
  try {
    const d = parseInputDate(input);
    if (!d) return '-';
    const parts = getZonedParts(d, getAppTimezone());
    return formatWithPattern(parts, getAppDateFormat());
  } catch {
    return typeof input === 'string' ? input : '-';
  }
};

// Token-based time formatter. Supported tokens (longest match first):
// HH hh mm ss A H h — everything else is a literal separator.
const TIME_TOKEN_PATTERN = /HH|hh|mm|ss|A|H|h/g;

export const formatAppTime = (input?: string | Date | null): string => {
  if (!input) return '-';
  try {
    const d = parseInputDate(input);
    if (!d) return '-';
    const timezone = getAppTimezone();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const hour24 = Number(get('hour') === '24' ? '00' : get('hour'));
    const values: Record<string, string> = {
      HH: String(hour24).padStart(2, '0'),
      hh: String(((hour24 + 11) % 12) + 1).padStart(2, '0'),
      mm: get('minute'),
      ss: get('second'),
      A: hour24 < 12 ? 'AM' : 'PM',
      H: String(hour24),
      h: String(((hour24 + 11) % 12) + 1),
    };
    return getAppTimeFormat().replace(TIME_TOKEN_PATTERN, (t) => values[t] ?? t);
  } catch {
    return '-';
  }
};

export const formatAppDateTime = (input?: string | Date | null): string => {
  if (!input) return '-';
  const date = formatAppDate(input);
  if (date === '-') return date;
  return `${date} ${formatAppTime(input)}`;
};

// Format a date with a friendly long form (used for headers/hero subtitles)
export const formatAppDateLong = (input?: string | Date | null): string => {
  if (!input) return '-';
  try {
    const d = parseInputDate(input);
    if (!d) return '-';
    const fmt = getAppDateFormat();
    if (fmt === 'EEE MMM DD YYYY') {
      return formatAppDate(d);
    }
    const parts = getZonedParts(d, getAppTimezone());
    return `${parts.weekday}, ${parts.monthLong} ${Number(parts.day2)} ${parts.year}`;
  } catch {
    return '-';
  }
};

// Financial year label based on configured start month, e.g. "April" -> "FY 2026-27"
export const getFinancialYearLabel = (yearOffset = 0): string => {
  const start = getAppFinancialYear() || 'April';
  const now = new Date();
  let fyStartYear = now.getFullYear() + yearOffset;
  const startMonth = ['january', 'february', 'march'].includes(start.toLowerCase())
    ? 0
    : ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(start.toLowerCase()) + 3;
  const currentMonth = now.getMonth();
  if (startMonth > currentMonth && yearOffset === 0) fyStartYear -= 1;
  const fyEndYear = fyStartYear + 1;
  return `FY ${String(fyStartYear).slice(2)}-${String(fyEndYear).slice(2)}`;
};
