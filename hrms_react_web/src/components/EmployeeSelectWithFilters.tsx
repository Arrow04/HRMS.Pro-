import React, { useMemo, useState } from 'react';
import SearchableSelect from './SearchableSelect';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { useEmployeePickerSearch } from '../hooks/useEmployeePickerSearch';
import { formatEmployeeLabel, toEmployeeSelectOptions } from '../utils/employeePickerUtils';
import type { EmployeePickerItem } from '../services/employeeListService';

interface EmployeeSelectWithFiltersProps {
  value: string | number | 'all';
  onChange: (val: string | number | 'all') => void;
  /** @deprecated pass status/companyId instead — loads via /employees/list */
  employees?: EmployeePickerItem[];
  companies: { id: number; name: string }[];
  placeholder?: string;
  allOption?: string;
  status?: string;
}

const EmployeeSelectWithFilters: React.FC<EmployeeSelectWithFiltersProps> = ({
  value,
  onChange,
  employees: employeesProp,
  companies = [],
  placeholder = 'Select Employee',
  allOption = 'Select Employee',
  status,
}) => {
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const companyId = companyFilter !== 'all' ? Number(companyFilter) : undefined;
  const pickerParams = { status, companyId };

  const { data: staticPicker = [] } = useEmployeePicker({
    ...pickerParams,
    enabled: !employeesProp?.length && !search,
  });
  const { employees: searched = [], total } = useEmployeePickerSearch({
    ...pickerParams,
    enabled: !employeesProp?.length && !!search,
  });

  const employees = useMemo(() => {
    if (employeesProp?.length) return employeesProp;
    return search ? searched : staticPicker;
  }, [employeesProp, search, searched, staticPicker]);

  const employeeOptions = useMemo(
    () => toEmployeeSelectOptions(employees),
    [employees],
  );

  return (
    <div className="space-y-4">
      {companies.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-[#0F172A] mb-1">Filter by Company</label>
          <SearchableSelect
            value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
            onChange={(val) => {
              setCompanyFilter(val.toString());
              onChange('all');
            }}
            options={companies.map((c) => ({ id: c.id, name: c.name }))}
            placeholder="All Companies"
            allOption="All Companies"
          />
        </div>
      )}

      <div>
        {!employeesProp?.length && (
          <input
            type="text"
            className="mb-2 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            placeholder="Search by name, email, or employee code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={employeeOptions}
          placeholder={placeholder}
          allOption={allOption}
          preserveOrder
        />
        {!employeesProp?.length && total > employees.length && (
          <p className="mt-1 text-xs text-[#64748B]">
            Showing {employees.length} of {total.toLocaleString()} — type to narrow results
          </p>
        )}
      </div>
    </div>
  );
};

export default EmployeeSelectWithFilters;
