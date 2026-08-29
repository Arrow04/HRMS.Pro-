// Currency formatting driven by the organization's currency setting.
// The setting is stored in the DB (organizations.default_currency) and synced
// to localStorage under "appCurrency" by the Settings page.

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'Fr',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  BGN: 'лв',
  TRY: '₺',
  RUB: '₽',
  UAH: '₴',
  ILS: '₪',
  SAR: '﷼',
  AED: 'د.إ',
  QAR: '﷼',
  KWD: 'د.ك',
  BHD: 'د.ب',
  OMR: 'ر.ع.',
  JOD: 'د.ا',
  EGP: 'E£',
  ZAR: 'R',
  NGN: '₦',
  KES: 'KSh',
  GHS: 'GH₵',
  MAD: 'د.م.',
  TND: 'د.ت',
  BRL: 'R$',
  MXN: '$',
  ARS: '$',
  CLP: '$',
  COP: '$',
  PEN: 'S/',
  THB: '฿',
  VND: '₫',
  IDR: 'Rp',
  MYR: 'RM',
  PHP: '₱',
  PKR: '₨',
  BDT: '৳',
  LKR: 'Rs',
  NPR: '₨',
  MMK: 'K',
  KHR: '៛',
  LAK: '₭',
  BND: 'B$',
  MVR: 'Rf',
  GEL: '₾',
  AZN: '₼',
  AMD: '֏',
  BYN: 'Br',
  KZT: '₸',
  UZS: 'soʻm',
  TZS: 'TSh',
  UGX: 'USh',
  ETB: 'Br',
  XOF: 'CFA',
  XAF: 'FCFA',
  SGD: 'S$',
  HKD: 'HK$',
  NZD: 'NZ$',
};

// Get the org's configured currency code (from localStorage, synced from DB)
export const getAppCurrency = (): string => {
  try {
    return localStorage.getItem('appCurrency') || 'INR';
  } catch {
    return 'INR';
  }
};

// Get currency symbol from currency code (falls back to the code itself)
export const getCurrencySymbol = (currencyCode: string = getAppCurrency()): string => {
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode || '';
};

// Format amount with the currency symbol, e.g. "₹1,234.50"
export const formatCurrency = (amount: number | string, currencyCode?: string): string => {
  const code = currencyCode || getAppCurrency();
  const symbol = getCurrencySymbol(code);
  let numAmount: number;

  if (typeof amount === 'string') {
    const cleanAmount = amount.replace(/[^0-9.-]/g, '');
    numAmount = parseFloat(cleanAmount);
  } else {
    numAmount = amount;
  }

  if (isNaN(numAmount)) return `${symbol}0`;

  const formatted = numAmount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return symbol ? `${symbol}${formatted}` : formatted;
};
