import type { EmployeePickerItem } from '../services/employeeListService';
import { personDisplayName } from './employeeNameUtils';

export function formatEmployeeLabel(emp: EmployeePickerItem): string {
  const name = personDisplayName(emp, `#${emp.id}`);
  return emp.employeeCode ? `${name} (${emp.employeeCode})` : name;
}

export function toEmployeeSelectOptions(items: EmployeePickerItem[]) {
  return items.map((e) => ({ id: e.id, name: formatEmployeeLabel(e) }));
}

/** Normalize picker rows for legacy components expecting fullName / branch_id shapes. */
export function normalizePickerEmployee(emp: EmployeePickerItem) {
  return {
    ...emp,
    fullName: personDisplayName(emp),
    branchId: emp.branchId,
    branch_id: emp.branchId,
    companyId: emp.companyId,
    company_id: emp.companyId,
    departmentId: emp.departmentId,
    department_id: emp.departmentId,
  };
}
