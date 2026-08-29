import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import SearchableSelect from './SearchableSelect';
import FormGrid from './FormGrid';
import FormField from './FormField';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { toEmployeeSelectOptions } from '../utils/employeePickerUtils';
import api from '../services/api';
import type { EmployeePickerItem } from '../services/employeeListService';

interface CascadeItem {
  id: string | number;
  name?: string;
  companyId?: string | number;
  company_id?: number;
}

interface EmployeeScopedCascadeProps {
  employees?: EmployeePickerItem[];
  companies?: CascadeItem[];
  branches?: CascadeItem[];
  departments?: CascadeItem[];
  companyId: string;
  branchId: string;
  departmentId: string;
  employeeId: string;
  onCompanyChange: (val: string) => void;
  onBranchChange: (val: string) => void;
  onDepartmentChange: (val: string) => void;
  onEmployeeChange: (val: string) => void;
  /** Preferred — one atomic update; avoids stale state when clearing downstream fields */
  onScopeChange?: (patch: Partial<Record<'companyId' | 'branchId' | 'departmentId' | 'employeeId', string>>) => void;
  status?: string;
  extra?: React.ReactNode;
}

const itemCompanyId = (item: CascadeItem) =>
  item.companyId ?? item.company_id;

const EmployeeScopedCascade: React.FC<EmployeeScopedCascadeProps> = ({
  companies = [],
  branches: branchesProp,
  departments: departmentsProp,
  companyId,
  branchId,
  departmentId,
  employeeId,
  onCompanyChange,
  onBranchChange,
  onDepartmentChange,
  onEmployeeChange,
  onScopeChange,
  status = 'active',
  extra,
}) => {
  const { data: fetchedBranches = [] } = useQuery<CascadeItem[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get('/branches');
      return Array.isArray(res.data) ? res.data : res.data?.items || res.data?.data || [];
    },
    enabled: !branchesProp?.length,
    staleTime: 5 * 60 * 1000,
  });

  const { data: fetchedDepartments = [] } = useQuery<CascadeItem[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await api.get('/departments');
      return Array.isArray(res.data) ? res.data : res.data?.items || res.data?.data || [];
    },
    enabled: !departmentsProp?.length,
    staleTime: 5 * 60 * 1000,
  });

  const branchList = branchesProp?.length ? branchesProp : fetchedBranches;
  const departmentList = departmentsProp?.length ? departmentsProp : fetchedDepartments;

  const companyOpts = useMemo(
    () => (Array.isArray(companies) ? companies : []).map((c) => ({
      id: String(c.id),
      name: c.name || '',
    })),
    [companies],
  );

  const branchOpts = useMemo(
    () => branchList
      .filter((b) => !companyId || String(itemCompanyId(b) ?? '') === String(companyId))
      .map((b) => ({ id: String(b.id), name: b.name || '' })),
    [branchList, companyId],
  );

  const departmentOpts = useMemo(
    () => departmentList
      .filter((d) => !companyId || String(itemCompanyId(d) ?? '') === String(companyId))
      .map((d) => ({ id: String(d.id), name: d.name || '' })),
    [departmentList, companyId],
  );

  const pickerEnabled = !!companyId;
  const {
    data: loadedEmployees = [],
    isLoading: employeesLoading,
    isError: employeesError,
  } = useEmployeePicker({
    status,
    companyId: companyId ? Number(companyId) : undefined,
    branchId: branchId ? Number(branchId) : undefined,
    departmentId: departmentId ? Number(departmentId) : undefined,
    enabled: pickerEnabled,
  });

  const employeeOptions = useMemo(() => toEmployeeSelectOptions(loadedEmployees), [loadedEmployees]);

  const handleCompanyChange = (val: string) => {
    if (onScopeChange) {
      onScopeChange({ companyId: val, branchId: '', departmentId: '', employeeId: '' });
      return;
    }
    onCompanyChange(val);
    onBranchChange('');
    onDepartmentChange('');
    onEmployeeChange('');
  };

  const handleBranchChange = (val: string) => {
    if (onScopeChange) {
      onScopeChange({ branchId: val, departmentId: '', employeeId: '' });
      return;
    }
    onBranchChange(val);
    onDepartmentChange('');
    onEmployeeChange('');
  };

  const handleDepartmentChange = (val: string) => {
    if (onScopeChange) {
      onScopeChange({ departmentId: val, employeeId: '' });
      return;
    }
    onDepartmentChange(val);
    onEmployeeChange('');
  };

  const handleEmployeeChange = (val: string) => {
    if (onScopeChange) {
      onScopeChange({ employeeId: val });
      return;
    }
    onEmployeeChange(val);
  };

  const Field = FormField;

  const employeePlaceholder = !companyId
    ? 'Select company first'
    : employeesLoading
      ? 'Loading employees…'
      : employeesError
        ? 'Failed to load employees'
        : employeeOptions.length
          ? `Select Employee (${employeeOptions.length})`
          : 'No employees in this scope';

  return (
    <div className="space-y-4">
      <FormGrid>
        <Field label="Company" required help="Select the company first">
          <SearchableSelect
            value={companyId}
            onChange={(val) => handleCompanyChange(val === '' ? '' : String(val))}
            options={companyOpts}
            placeholder="Select Company"
            showAllOption={false}
            clearable
            className="w-full"
          />
        </Field>

        <Field label="Branch" help="Optional — leave blank for all branches in the company">
          <SearchableSelect
            value={branchId}
            onChange={(val) => handleBranchChange(val === '' ? '' : String(val))}
            options={branchOpts}
            placeholder={companyId ? 'Select Branch' : 'Select company first'}
            showAllOption={false}
            clearable
            className="w-full"
            disabled={!companyId}
          />
        </Field>

        <Field label="Department" help="Optional — leave blank for all departments in the company">
          <SearchableSelect
            value={departmentId}
            onChange={(val) => handleDepartmentChange(val === '' ? '' : String(val))}
            options={departmentOpts}
            placeholder={companyId ? 'Select Department' : 'Select company first'}
            showAllOption={false}
            clearable
            className="w-full"
            disabled={!companyId}
          />
        </Field>

        <Field label="Employee" required help="Sorted A–Z by name and employee code">
          <SearchableSelect
            value={employeeId}
            onChange={(val) => handleEmployeeChange(val === '' ? '' : String(val))}
            options={employeeOptions}
            placeholder={employeePlaceholder}
            showAllOption={false}
            clearable
            className="w-full"
            disabled={!companyId || employeesLoading}
            preserveOrder
          />
        </Field>
      </FormGrid>

      {companyId && !employeesLoading && !employeesError && (
        <p className="text-xs text-[#64748B]">
          {employeeOptions.length
            ? `${employeeOptions.length.toLocaleString()} employee${employeeOptions.length === 1 ? '' : 's'} in this scope`
            : 'No employees found for this company — check that employees have company assigned in their profile'}
        </p>
      )}

      {extra && <FormGrid className="mt-1">{extra}</FormGrid>}
    </div>
  );
};

export default EmployeeScopedCascade;
