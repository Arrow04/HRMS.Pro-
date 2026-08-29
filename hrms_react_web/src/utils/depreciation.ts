import { formatCurrency } from '../services/currencyService';

export interface DepreciationInfo {
  purchaseValue: number;
  currentValue: number;
  accumulatedDepreciation: number;
  annualDepreciation: number;
  depreciationRate: number;
  usefulLifeYears: number;
  ageYears: number;
  remainingLifeYears: number;
  pctDepreciated: number;
  fullyDepreciated: boolean;
}

/**
 * Straight-line depreciation calculation for an asset.
 * Falls back to a default 5-year life / 20% annual rate when not configured.
 */
export function calcDepreciation(
  purchaseValue: number,
  purchaseDate?: string,
  usefulLifeYears?: number,
  depreciationRate?: number,
  salvageValue = 0
): DepreciationInfo {
  const cost = purchaseValue || 0;
  const salvage = salvageValue || 0;
  const life = usefulLifeYears && usefulLifeYears > 0 ? usefulLifeYears : 5;
  const rate = depreciationRate && depreciationRate > 0 ? depreciationRate : 100 / life;

  const base = Math.max(0, cost - salvage);
  const annualDep = base / life;

  const start = purchaseDate ? new Date(purchaseDate) : null;
  let ageYears = 0;
  if (start && !isNaN(start.getTime())) {
    const now = new Date();
    const ms = now.getTime() - start.getTime();
    ageYears = ms > 0 ? ms / (365.25 * 24 * 60 * 60 * 1000) : 0;
  }

  const accumulated = Math.min(base, annualDep * ageYears);
  const currentValue = Math.max(salvage, cost - accumulated);
  const pctDepreciated = base > 0 ? Math.min(100, (accumulated / base) * 100) : 0;
  const remainingLife = Math.max(0, life - ageYears);

  return {
    purchaseValue: cost,
    currentValue: Math.round(currentValue * 100) / 100,
    accumulatedDepreciation: Math.round(accumulated * 100) / 100,
    annualDepreciation: Math.round(annualDep * 100) / 100,
    depreciationRate: Math.round(rate * 100) / 100,
    usefulLifeYears: life,
    ageYears: Math.round(ageYears * 100) / 100,
    remainingLifeYears: Math.round(remainingLife * 100) / 100,
    pctDepreciated: Math.round(pctDepreciated * 100) / 100,
    fullyDepreciated: currentValue <= salvage || accumulated >= base - 0.01,
  };
}

export function formatCurrencyRs(value: number): string {
  return formatCurrency(value);
}
