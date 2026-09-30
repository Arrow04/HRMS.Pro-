import api from './api';

export interface EmployeePickerItem {
  id: number;
  firstName: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  employeeCode?: string;
  departmentId?: number;
  designationId?: number;
  branchId?: number;
  status?: string;
  phone?: string;
  companyId?: number;
  profileCompletion?: number;
}

export interface EmployeePickerParams {
  search?: string;
  status?: string;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  limit?: number;
  offset?: number;
}

/** Server page size — client auto-paginates until every employee is loaded. */
export const PICKER_PAGE_SIZE = 5000;

/** Single page from GET /employees/list (slim payload). */
export async function fetchEmployeePickerList(params: EmployeePickerParams = {}): Promise<{
  data: EmployeePickerItem[];
  total: number;
}> {
  const response = await api.get('/employees/list', {
    params: {
      limit: params.limit ?? PICKER_PAGE_SIZE,
      offset: params.offset ?? 0,
      search: params.search || undefined,
      status: params.status || undefined,
      companyId: params.companyId != null ? params.companyId : undefined,
      branchId: params.branchId != null ? params.branchId : undefined,
      departmentId: params.departmentId != null ? params.departmentId : undefined,
    },
  });
  const body = response.data || {};
  return {
    data: body.data || [],
    total: body.total ?? (body.data?.length || 0),
  };
}

/** Load every matching employee (paginated under the hood). No 200 cap. */
export async function fetchAllEmployeePickerList(
  params: EmployeePickerParams = {},
): Promise<{ data: EmployeePickerItem[]; total: number }> {
  const all: EmployeePickerItem[] = [];
  let offset = 0;
  let total = 0;

  for (;;) {
    const page = await fetchEmployeePickerList({
      ...params,
      limit: params.limit ?? PICKER_PAGE_SIZE,
      offset,
    });
    if (!page.data.length) break;
    all.push(...page.data);
    total = page.total;
    offset += page.data.length;
    if (all.length >= total) break;
    if (page.data.length < (params.limit ?? PICKER_PAGE_SIZE)) break;
  }

  return { data: all, total: total || all.length };
}
