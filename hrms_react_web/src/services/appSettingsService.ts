import { useEffect, useState } from 'react';

// App-wide settings (date format, timezone, financial year) driven by the
// organization's settings page. Values are synced to localStorage by the
// Settings page so every module can format dates consistently.

export const APP_SETTINGS_EVENT = 'hrms-app-settings-changed';

const DEFAULTS = {
  dateFormat: 'DD/MM/YYYY',
  timezone: 'Asia/Kolkata',
  financialYear: 'April',
  country: 'India',
};

export interface AppSettings {
  dateFormat: string;
  timezone: string;
  financialYear: string;
  country: string;
}

type ZonedDateParts = {
  weekday: string;
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
    monthShort: map.month || '',
    monthLong: longMonth,
    month2,
    day2: map.day || '01',
    year: map.year || String(d.getFullYear()),
  };
};

const formatWithPattern = (parts: ZonedDateParts, pattern: string): string => {
  switch (pattern) {
    case 'EEE MMM DD YYYY':
      return `${parts.weekday} ${parts.monthShort} ${parts.day2} ${parts.year}`;
    case 'MM/DD/YYYY':
      return `${parts.month2}/${parts.day2}/${parts.year}`;
    case 'YYYY-MM-DD':
      return `${parts.year}-${parts.month2}-${parts.day2}`;
    case 'DD-MMM-YYYY':
      return `${parts.day2}-${parts.monthShort}-${parts.year}`;
    case 'DD MMM YYYY':
      return `${parts.day2} ${parts.monthShort} ${parts.year}`;
    case 'DD MMMM YYYY':
      return `${parts.day2} ${parts.monthLong} ${parts.year}`;
    case 'DD/MM/YYYY':
    default:
      return `${parts.day2}/${parts.month2}/${parts.year}`;
  }
};

// Persist the app settings to localStorage (called by the Settings page on save)
export const syncAppSettings = (settings: Partial<AppSettings>): void => {
  try {
    if (settings.dateFormat !== undefined) localStorage.setItem('appDateFormat', settings.dateFormat);
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
      timezone: localStorage.getItem('appTimezone') || DEFAULTS.timezone,
      financialYear: localStorage.getItem('appFinancialYear') || DEFAULTS.financialYear,
      country: localStorage.getItem('appCountry') || DEFAULTS.country,
    };
  } catch {
    return DEFAULTS;
  }
};

export const getAppDateFormat = (): string => getAppSettings().dateFormat;
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

export const formatAppTime = (input?: string | Date | null): string => {
  if (!input) return '-';
  try {
    const d = parseInputDate(input);
    if (!d) return '-';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: getAppTimezone(),
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
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
