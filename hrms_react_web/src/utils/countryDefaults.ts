export type CountryDefaults = {
  timezone: string;
  currency: string;
  financialYear: string;
  dateFormat: string;
};

/** Defaults aligned with master-data TIMEZONE / CURRENCY options. */
export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  India: {
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    financialYear: 'April',
    dateFormat: 'DD/MM/YYYY',
  },
  'United States': {
    timezone: 'America/New_York',
    currency: 'USD',
    financialYear: 'January',
    dateFormat: 'MM/DD/YYYY',
  },
  'United Kingdom': {
    timezone: 'Europe/London',
    currency: 'GBP',
    financialYear: 'April',
    dateFormat: 'DD/MM/YYYY',
  },
  Australia: {
    timezone: 'Asia/Tokyo',
    currency: 'USD',
    financialYear: 'July',
    dateFormat: 'DD/MM/YYYY',
  },
  'United Arab Emirates': {
    timezone: 'Asia/Dubai',
    currency: 'AED',
    financialYear: 'January',
    dateFormat: 'DD/MM/YYYY',
  },
  Singapore: {
    timezone: 'Asia/Tokyo',
    currency: 'USD',
    financialYear: 'April',
    dateFormat: 'DD/MM/YYYY',
  },
  Germany: {
    timezone: 'Europe/London',
    currency: 'EUR',
    financialYear: 'January',
    dateFormat: 'DD/MM/YYYY',
  },
  Canada: {
    timezone: 'America/New_York',
    currency: 'USD',
    financialYear: 'April',
    dateFormat: 'DD/MM/YYYY',
  },
};

const COUNTRY_ALIASES: Record<string, string> = {
  USA: 'United States',
  US: 'United States',
  UK: 'United Kingdom',
  UAE: 'United Arab Emirates',
};

export const getCountryDefaults = (country: string): CountryDefaults | null => {
  const key = COUNTRY_ALIASES[country] || country;
  return COUNTRY_DEFAULTS[key] || null;
};
