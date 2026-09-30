import api from './api';
import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';

export interface LookupValue {
  id: number;
  code: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
}

export interface LookupCategory {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_system: boolean;
  values: LookupValue[];
}

// Cache for lookup values to avoid repeated API calls
const lookupCache: Map<string, LookupValue[]> = new Map();

/**
 * Get lookup values by category code
 * @param categoryCode - e.g., 'gender', 'employment_type', 'leave_type'
 * @returns Array of lookup values
 */
export const getLookupValues = async (categoryCode: string): Promise<LookupValue[]> => {
  // Check cache first
  if (lookupCache.has(categoryCode)) {
    return lookupCache.get(categoryCode) || [];
  }

  try {
    const response = await api.get(`/master-data/lookup/${categoryCode}`);
    const values = response.data?.values || [];
    // Only return active values for dropdowns
    const activeValues = values.filter((v: LookupValue) => v.is_active !== false);
    // Cache the active results
    lookupCache.set(categoryCode, activeValues);
    return activeValues;
  } catch (error) {
    logger.error(`Error fetching lookup values for ${categoryCode}:`, error);
    return [];
  }
};

/**
 * Get a single lookup value name by code
 * @param categoryCode - Category code
 * @param valueCode - Value code
 * @returns Display name or code if not found
 */
export const getLookupValueName = async (categoryCode: string, valueCode: string): Promise<string> => {
  const values = await getLookupValues(categoryCode);
  const value = values.find(v => v.code === valueCode);
  return value?.name || valueCode;
};

/**
 * Clear the lookup cache
 */
export const clearLookupCache = (): void => {
  lookupCache.clear();
};

/**
 * Preload common lookup values on app startup
 */
export const preloadCommonLookups = async (): Promise<void> => {
  const commonCategories = [
    'gender',
    'employment_type',
    'marital_status',
    'blood_group',
    'education_level',
    'leave_type',
    'expense_category',
    'relation_type'
  ];

  await Promise.all(
    commonCategories.map(code => getLookupValues(code))
  );
};

// React Hook for using lookup values
export const useLookupValues = (categoryCode: string) => {
  const [values, setValues] = useState<LookupValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchValues = async () => {
      try {
        setLoading(true);
        const data = await getLookupValues(categoryCode);
        setValues(data);
      } catch {
        setError(`Failed to load ${categoryCode}`);
      } finally {
        setLoading(false);
      }
    };

    fetchValues();
  }, [categoryCode]);

  return { values, loading, error };
};
