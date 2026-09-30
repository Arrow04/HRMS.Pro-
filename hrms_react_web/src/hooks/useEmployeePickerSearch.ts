import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAllEmployeePickerList,
  type EmployeePickerItem,
  type EmployeePickerParams,
} from '../services/employeeListService';

/**
 * Employee dropdown with server-side search — type in the search field to find anyone.
 * Does not load the full roster on mount (use useEmployeePicker for that).
 */
export function useEmployeePickerSearch(
  params: EmployeePickerParams & { enabled?: boolean; minSearchLength?: number } = {},
) {
  const { enabled = true, minSearchLength = 1, ...baseParams } = params;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ['employees-picker-search', baseParams, debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < minSearchLength) {
        return { data: [] as EmployeePickerItem[], total: 0 };
      }
      return fetchAllEmployeePickerList({
        ...baseParams,
        search: debouncedSearch,
      });
    },
    enabled: enabled && debouncedSearch.length >= minSearchLength,
    staleTime: 30_000,
  });

  const employees: EmployeePickerItem[] = query.data?.data ?? [];

  return {
    employees,
    total: query.data?.total ?? employees.length,
    search,
    setSearch,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
