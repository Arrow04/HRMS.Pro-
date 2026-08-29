import { useQuery } from '@tanstack/react-query';
import { fetchAllEmployeePickerList, type EmployeePickerParams } from '../services/employeeListService';

/**
 * Cached lightweight employee options — loads the full roster (paginated API calls).
 * Uses GET /employees/list with no artificial cap.
 */
export function useEmployeePicker(params: EmployeePickerParams & { enabled?: boolean } = {}) {
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: ['employees-picker', queryParams],
    queryFn: () => fetchAllEmployeePickerList(queryParams),
    staleTime: 5 * 60 * 1000,
    enabled,
    select: (result) => result.data,
  });
}
