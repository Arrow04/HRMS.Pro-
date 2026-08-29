import api from './api';

export interface EmployeeOrgScope {
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  organizationId?: number;
  companyId?: number;
  companyName?: string;
  branchId?: number;
  branchName?: string;
  departmentId?: number;
  departmentName?: string;
}

export async function fetchEmployeeScope(employeeId: number): Promise<EmployeeOrgScope> {
  const response = await api.get(`/employees/${employeeId}/scope`);
  return response.data;
}

export function scopeToFormFields(scope: EmployeeOrgScope) {
  return {
    employeeId: scope.employeeId ? String(scope.employeeId) : '',
    organizationId: scope.organizationId ? String(scope.organizationId) : '',
    companyId: scope.companyId ? String(scope.companyId) : '',
    branchId: scope.branchId ? String(scope.branchId) : '',
    departmentId: scope.departmentId ? String(scope.departmentId) : '',
    companyName: scope.companyName || '',
    branchName: scope.branchName || '',
    departmentName: scope.departmentName || '',
    employeeName: scope.employeeName || '',
    employeeCode: scope.employeeCode || '',
  };
}
