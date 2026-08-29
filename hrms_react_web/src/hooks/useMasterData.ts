import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import type { LookupValue } from '../services/masterDataService';

export const useMasterData = (categoryCode: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['master-data', categoryCode],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/master-data/lookup/${categoryCode}`);
        const data = response.data?.values || response.data || [];
        return data.filter((item: LookupValue) => item.is_active !== false);
      } catch (error) { throw error; }
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    enabled: options?.enabled !== false, // Default to true
  });
};

export const useMasterDataCategories = () => {
  return useQuery({
    queryKey: ['master-data-categories'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/master-data/categories/grouped');
        return response.data || {};
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });
};
