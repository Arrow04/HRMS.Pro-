import React, { useMemo } from 'react';
import SearchableSelect from './SearchableSelect';
import { useEmployeePickerSearch } from '../hooks/useEmployeePickerSearch';
import type { EmployeePickerParams } from '../services/employeeListService';
import { toEmployeeSelectOptions } from '../utils/employeePickerUtils';

interface EmployeeAsyncSelectProps {
  value: string | number | 'all';
  onChange: (val: string | number | 'all') => void;
  status?: string;
  companyId?: number;
  placeholder?: string;
  allOption?: string;
  showAllOption?: boolean;
  clearable?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * Employee dropdown backed by GET /employees/list with server-side search.
 */
const EmployeeAsyncSelect: React.FC<EmployeeAsyncSelectProps> = ({
  value,
  onChange,
  status,
  companyId,
  placeholder = 'Search employee by name or code…',
  allOption = 'All Employees',
  showAllOption = false,
  clearable = false,
  className = '',
  disabled = false,
}) => {
  const params: EmployeePickerParams = { status, companyId };
  const { employees, search, setSearch, isLoading, total } = useEmployeePickerSearch(params);

  const options = useMemo(() => {
    const base = toEmployeeSelectOptions(employees);
    if (value && value !== 'all' && !base.some((o) => String(o.id) === String(value))) {
      const id = Number(value);
      if (!Number.isNaN(id)) {
        base.unshift({ id, name: `Employee #${id}` });
      }
    }
    return base;
  }, [employees, value]);

  return (
    <div className={className}>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={
          isLoading
            ? 'Searching…'
            : search.trim().length < 1
              ? 'Type below to search employees'
              : employees.length
                ? placeholder
                : 'No matches — try another search'
        }
        allOption={allOption}
        showAllOption={showAllOption}
        clearable={clearable}
        disabled={disabled}
        preserveOrder
      />
      <input
        type="text"
        className="mt-2 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1C64F2] focus:outline-none"
        placeholder="Type name, email, or employee code…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {search.trim().length >= 1 && total > employees.length && (
        <p className="mt-1 text-xs text-[#64748B]">
          Showing {employees.length} of {total.toLocaleString()} — refine your search
        </p>
      )}
    </div>
  );
};

export default EmployeeAsyncSelect;
