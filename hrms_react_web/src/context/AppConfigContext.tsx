import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchGeneralSettings } from '../services/settingsService';
import { syncAppSettings } from '../services/appSettingsService';

// Country → default dial code + max local-digit length for phone validation.
// eslint-disable-next-line react-refresh/only-export-components
export const COUNTRY_PHONE_CONFIG: Record<string, { dial: string; localMax: number }> = {
  'India': { dial: '+91', localMax: 10 },
  'United States': { dial: '+1', localMax: 10 },
  'USA': { dial: '+1', localMax: 10 },
  'United Kingdom': { dial: '+44', localMax: 10 },
  'Canada': { dial: '+1', localMax: 10 },
  'Australia': { dial: '+61', localMax: 9 },
  'Germany': { dial: '+49', localMax: 11 },
  'France': { dial: '+33', localMax: 9 },
  'Singapore': { dial: '+65', localMax: 8 },
  'United Arab Emirates': { dial: '+971', localMax: 9 },
  'UAE': { dial: '+971', localMax: 9 },
  'Saudi Arabia': { dial: '+966', localMax: 9 },
  'Nepal': { dial: '+977', localMax: 10 },
  'Bangladesh': { dial: '+880', localMax: 10 },
  'Sri Lanka': { dial: '+94', localMax: 10 },
  'Pakistan': { dial: '+92', localMax: 10 },
  'China': { dial: '+86', localMax: 11 },
  'Japan': { dial: '+81', localMax: 10 },
  'South Korea': { dial: '+82', localMax: 10 },
  'Malaysia': { dial: '+60', localMax: 9 },
  'Indonesia': { dial: '+62', localMax: 10 },
  'Thailand': { dial: '+66', localMax: 9 },
  'Brazil': { dial: '+55', localMax: 11 },
  'Mexico': { dial: '+52', localMax: 10 },
  'New Zealand': { dial: '+64', localMax: 9 },
  'South Africa': { dial: '+27', localMax: 9 },
};

// eslint-disable-next-line react-refresh/only-export-components
export const COUNTRY_CURRENCY: Record<string, string> = {
  'India': 'INR',
  'United States': 'USD',
  'USA': 'USD',
  'United Kingdom': 'GBP',
  'Canada': 'CAD',
  'Australia': 'AUD',
  'Germany': 'EUR',
  'France': 'EUR',
  'Singapore': 'SGD',
  'United Arab Emirates': 'AED',
  'UAE': 'AED',
  'Saudi Arabia': 'SAR',
  'Nepal': 'NPR',
  'Bangladesh': 'BDT',
  'Sri Lanka': 'LKR',
  'Pakistan': 'PKR',
  'China': 'CNY',
  'Japan': 'JPY',
  'Malaysia': 'MYR',
  'Indonesia': 'IDR',
  'Thailand': 'THB',
  'Brazil': 'BRL',
  'Mexico': 'MXN',
  'New Zealand': 'NZD',
  'South Africa': 'ZAR',
};

interface AppConfigContextValue {
  country: string;
  isIndia: boolean;
  currency: string;
  dialCode: string;
  localMax: number;
  loading: boolean;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  country: 'India',
  isIndia: true,
  currency: 'INR',
  dialCode: '+91',
  localMax: 10,
  loading: true,
});

export const AppConfigProvider = ({ children }: { children: ReactNode }) => {
  const [cfg, setCfg] = useState<AppConfigContextValue>({
    country: 'India',
    isIndia: true,
    currency: 'INR',
    dialCode: '+91',
    localMax: 10,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await fetchGeneralSettings();
        if (!active) return;
        const country = s.country || 'India';
        const phone = COUNTRY_PHONE_CONFIG[country] || { dial: '+91', localMax: 10 };
        const currency = s.currency || COUNTRY_CURRENCY[country] || 'INR';
        syncAppSettings({
          country,
          dateFormat: s.dateFormat,
          timezone: s.timezone,
          financialYear: s.financialYear,
        });
        setCfg({
          country,
          isIndia: country.toLowerCase() === 'india',
          currency,
          dialCode: phone.dial,
          localMax: phone.localMax,
          loading: false,
        });
        // Sync currency so currencyService picks it up app-wide.
        try { localStorage.setItem('appCurrency', currency); } catch { /* ignore */ }
      } catch {
        if (active) setCfg((c) => ({ ...c, loading: false }));
      }
    })();
    return () => { active = false; };
  }, []);

  return <AppConfigContext.Provider value={cfg}>{children}</AppConfigContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppConfig = () => useContext(AppConfigContext);
