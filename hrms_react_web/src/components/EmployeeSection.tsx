import { Ban, CheckCircle2, Edit2, Trash2, Users, X, LogOut, RotateCcw } from 'lucide-react';import React, { memo, useState } from 'react';
import { joinEmployeeName, personDisplayName } from '../utils/employeeNameUtils';
import SearchableSelect from './SearchableSelect';
import ToggleSwitch from './ToggleSwitch';
import DateRangePicker from './DateRangePicker';
import DataTable, { type ServerPaginationConfig } from './DataTable';
import ConfirmActionModal from './ConfirmActionModal';
import { useMasterData } from '../hooks/useMasterData';
import type { Company, Branch, Department, Employee } from '../types';
import type { LookupValue } from '../services/masterDataService';

interface EmployeeRow extends Employee {
  designationName?: string;
}

interface EmployeeSectionProps {
  companiesList: Company[];
  branchesList: Branch[];
  departmentsList: Department[];
  /** full branch list for the filter dropdown, independent of the employee form's company scope */
  filterBranchesList?: Branch[];
  loadingEmployees: boolean;
  filteredData: EmployeeRow[];
  showDeleted: boolean;
  setShowDeleted: (value: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  filterCompanyId: number | 'all';
  setFilterCompanyId: (value: number | 'all') => void;
  filterBranchId: number | 'all';
  setFilterBranchId: (value: number | 'all') => void;
  filterDepartmentId: number | 'all';
  setFilterDepartmentId: (value: number | 'all') => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  handleView: (item: Employee) => void;
  handleEdit: (item: Employee) => void;
  handleDelete: (id: number) => void;
  handleRestore: (id: number) => void;
  handleAddEmployee: () => void;
  handleToggleStatus: (item: Employee) => void;
  handleBulkStatusChange: (items: Employee[], status: 'active' | 'inactive') => void;
  onProcessExit?: (item: Employee) => void;
  isSuperAdmin: boolean;
  downloadTemplate: () => void;
  setShowBulkUpload: (value: boolean) => void;
  setIsClosing: (value: boolean) => void;
  setShowQuickAddModal: (value: boolean) => void;
  setQuickAddFormData: (data: Record<string, unknown>) => void;
  serverPagination?: ServerPaginationConfig;
}

const EmployeeSection = ({
  companiesList,
  branchesList,
  departmentsList,
  filterBranchesList,
  loadingEmployees,
  filteredData,
  showDeleted,
  setShowDeleted,
  search,
  setSearch,
  filterCompanyId,
  setFilterCompanyId,
  filterBranchId,
  setFilterBranchId,
  filterDepartmentId,
  setFilterDepartmentId,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  clearFilters,
  hasActiveFilters,
  handleView,
  handleEdit,
  handleDelete,
  handleRestore,
  handleAddEmployee,
  handleToggleStatus,
  handleBulkStatusChange,
  onProcessExit,
  isSuperAdmin,
  downloadTemplate,
  setShowBulkUpload,
  setIsClosing,
  setShowQuickAddModal,
  setQuickAddFormData,
  serverPagination,
}: EmployeeSectionProps) => {
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'activate' | 'deactivate' | 'delete'; items: EmployeeRow[] } | null>(null);

  const runConfirm = () => {
    if (!confirmTarget) return;
    const { type, items } = confirmTarget;
    if (type === 'activate') items.forEach((i) => handleBulkStatusChange([i], 'active'));
    else if (type === 'deactivate') items.forEach((i) => handleBulkStatusChange([i], 'inactive'));
    else items.forEach((i) => handleDelete(i.id));
    setConfirmTarget(null);
  };

  return (
  <>
  <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden flex flex-col h-full">
    {/* FILTERS */}
    <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center gap-3">
        <SearchableSelect
          value={filterCompanyId === 'all' ? 'all' : Number(filterCompanyId)}
          onChange={(val) => setFilterCompanyId(val === 'all' ? 'all' : Number(val))}
          options={(companiesList || []).map((c: Company) => ({ id: c.id, name: c.name }))}
          placeholder="All Companies"
          allOption="All Companies"
          className="w-40"
        />
        
        <SearchableSelect
          value={filterBranchId === 'all' ? 'all' : Number(filterBranchId)}
          onChange={(val) => setFilterBranchId(val === 'all' ? 'all' : Number(val))}
          options={(filterBranchesList || branchesList || []).map((b: Branch) => ({ id: b.id, name: b.name }))}
          placeholder="All Branches"
          allOption="All Branches"
          className="w-40"
        />
        
        <SearchableSelect
          value={filterDepartmentId === 'all' ? 'all' : Number(filterDepartmentId)}
          onChange={(val) => setFilterDepartmentId(val === 'all' ? 'all' : Number(val))}
          options={(departmentsList || []).map((d: Department) => ({ id: d.id, name: d.name }))}
          placeholder="All Departments"
          allOption="All Departments"
          className="w-40"
        />
        
        <DateRangePicker 
          startDate={startDate} 
          endDate={endDate} 
          onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
          placeholder="Filter by Date"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>

    {/* Table */}
      <div className="overflow-x-auto">
      {loadingEmployees ? (
        null
      ) : (
        <DataTable
          data={filteredData}
          rowKey={(item: EmployeeRow) => item.id}
          searchable
          serverPagination={serverPagination}
          searchKeys={(item: EmployeeRow) => `${personDisplayName(item)} ${item.employeeCode || ''} ${item.email || ''} ${item.company?.name || ''} ${item.department?.name || ''}`}
          searchPlaceholder="Search employees..."
          emptyMessage="No employees found" persistKey="employees"
          logEntityType="employee"
          logFor={(item: EmployeeRow) => ({ id: item.id, label: personDisplayName(item) || item.email })}
          onEdit={(item) => handleEdit(item)}
          bulkActions={[
            {
              label: 'Activate',
              icon: CheckCircle2,
              variant: 'success',
              onAction: (items) => setConfirmTarget({ type: 'activate', items: items as EmployeeRow[] }),
            },
            {
              label: 'Deactivate',
              icon: Ban,
              variant: 'amber',
              onAction: (items) => setConfirmTarget({ type: 'deactivate', items: items as EmployeeRow[] }),
            },
            {
              label: 'Delete',
              icon: Trash2,
              variant: 'danger',
              onAction: (items) => setConfirmTarget({ type: 'delete', items: items as EmployeeRow[] }),
            },
          ]}
          columns={[
            {
              key: 'firstName', header: 'Employee', sortable: true,
              render: (item: EmployeeRow) => (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={personDisplayName(item)} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-medium text-[#0F172A] text-sm">{personDisplayName(item)}</span>
                      <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{item.employeeCode || ''}</span>
                    </div>
                    <div className="text-xs text-[#64748B] truncate max-w-[220px]">{item.email}</div>
                  </div>
                </div>
              ),
              sortValue: (item: EmployeeRow) => personDisplayName(item),
            },
            { key: 'company', header: 'Company', render: (item: EmployeeRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{item.company?.name || '-'}</span> },
            { key: 'branch', header: 'Branch', render: (item: EmployeeRow) => {
              const all = item.branches && item.branches.length > 0 ? item.branches : (item.branch ? [item.branch] : []);
              if (all.length === 0) return <span className="text-sm text-[#64748B]">-</span>;
              const text = all.map((b) => b.name).join(', ');
              const extra = all.length - 3;
              return (
                <span className="inline-flex items-center gap-1.5 text-sm text-[#64748B] max-w-[240px]" title={text}>
                  <span className="truncate">{all.slice(0, 3).map((b) => b.name).join(', ')}</span>
                  {extra > 0 && <span className="shrink-0 text-xs font-semibold text-[#1C64F2] bg-[#EFF6FF] px-1.5 py-0.5 rounded-md whitespace-nowrap">+{extra}</span>}
                </span>
              );
            } },
            { key: 'department', header: 'Department', render: (item: EmployeeRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{item.department?.name || '-'}</span> },
            { key: 'designationName', header: 'Designation', render: (item: EmployeeRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{item.designationName || item.designation || '-'}</span> },
            { key: 'phone', header: 'Phone', render: (item: EmployeeRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{item.phone || '-'}</span> },
            { key: 'joinDate', header: 'Join Date', render: (item: EmployeeRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{item.joinDate ? item.joinDate.split('T')[0] : '-'}</span> },
            {
              key: 'status', header: 'Employee Status', sortable: true,
              render: (item: EmployeeRow) => (
                <ToggleSwitch checked={item.status === 'active' && !item.deletedAt} onChange={() => handleToggleStatus(item)} />
              ),
              sortValue: (item: EmployeeRow) => (item.status === 'active' && !item.deletedAt) ? 1 : 0,
            },
            {
              key: 'progress', header: 'Profile Progress',
              render: (item: EmployeeRow) => {
                const fields = [
                  'phone', 'dateOfBirth', 'gender', 'bloodGroup', 'maritalStatus',
                  'currentAddress', 'permanentAddress', 'emergencyContact', 'emergencyPhone',
                  'educationLevel', 'institution', 'degree', 'graduationYear', 'skills',
                  'bankName', 'bankAccountNumber', 'ifscCode', 'pfNumber', 'pfUan', 'esicNumber',
                  'panNumber', 'aadharNumber', 'designation', 'departmentId', 'companyId', 'employmentType',
                ];
                const rec = item as unknown as Record<string, unknown>;
                const nameFilled = joinEmployeeName(item.firstName, item.lastName) ? 1 : 0;
                const filled = nameFilled + fields.filter((f) => {
                  const v = rec[f];
                  return v !== undefined && v !== null && v !== '' && v !== 0;
                }).length;
                const pct = Math.round((filled / (fields.length + 1)) * 100);
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-[#94A3B8] font-medium">{pct}%</span>
                  </div>
                );
              },
            },
          ]}
          actions={(item: EmployeeRow) => (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              {item.status === 'inactive' && (
                <button onClick={() => setConfirmTarget({ type: 'activate', items: [item] })} className="px-2.5 py-1.5 bg-[#10B981] text-white rounded-lg text-xs font-semibold hover:bg-[#059669] transition-colors flex items-center gap-1 whitespace-nowrap" title="Activate">
                  <CheckCircle2 className="w-3 h-3" /> Activate
                </button>
              )}
              {item.status === 'active' && (
                <button onClick={() => setConfirmTarget({ type: 'deactivate', items: [item] })} className="px-2.5 py-1.5 bg-[#F59E0B] text-white rounded-lg text-xs font-semibold hover:bg-[#D97706] transition-colors flex items-center gap-1 whitespace-nowrap" title="Deactivate">
                  <Ban className="w-3 h-3" /> Deactivate
                </button>
              )}
              {item.status === 'inactive' && onProcessExit && (
                <button onClick={() => onProcessExit(item)} className="px-2.5 py-1.5 bg-[#7C3AED] text-white rounded-lg text-xs font-semibold hover:bg-[#6D28D9] transition-colors flex items-center gap-1 whitespace-nowrap" title="Move to Exit processing">
                  <LogOut className="w-3 h-3" /> Process Exit
                </button>
              )}
              <button onClick={() => handleEdit(item)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => setConfirmTarget({ type: 'delete', items: [item] })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        />
      )}
      </div>
  </div>

    {/* Confirm Action Modal */}
    <ConfirmActionModal
      isOpen={!!confirmTarget}
      onCancel={() => setConfirmTarget(null)}
      onConfirm={runConfirm}
      title={(() => {
        if (!confirmTarget) return '';
        const single = confirmTarget.items.length === 1;
        const label = confirmTarget.type === 'activate' ? 'Activate' : confirmTarget.type === 'deactivate' ? 'Deactivate' : 'Delete';
        return single ? `${label} Employee` : `${label} ${confirmTarget.items.length} Employees`;
      })()}
      message={(() => {
        if (!confirmTarget) return '';
        const names = confirmTarget.items.map((i) => personDisplayName(i) || i.email || `#${i.id}`).join(', ');
        const single = confirmTarget.items.length === 1;
        const subject = single ? names : `${confirmTarget.items.length} employees`;
        const label = confirmTarget.type === 'activate' ? 'activate' : confirmTarget.type === 'deactivate' ? 'deactivate' : 'delete';
        return single ? `You are about to ${label} ${names}.` : `You are about to ${label} ${subject}.`;
      })()}
      consequence={(() => {
        if (!confirmTarget) return '';
        if (confirmTarget.type === 'activate') return 'This will restore their login access and move them to the Active Employees tab. They will regain access to the HRMS portal and their assigned modules.';
        if (confirmTarget.type === 'deactivate') return 'This will restrict their login access, move them to the Inactive Employees tab, and automatically create an exit record on the Exit Management page for FnF settlement and clearance.';
        return 'This will permanently remove the employee record(s), their attendance, leave, payroll, expense, and asset history from the system. This action cannot be undone.';
      })()}
      confirmLabel={(() => {
        if (!confirmTarget) return 'Confirm';
        return confirmTarget.type === 'activate' ? 'Yes, Activate' : confirmTarget.type === 'deactivate' ? 'Yes, Deactivate' : 'Yes, Delete';
      })()}
      variant={confirmTarget?.type === 'activate' ? 'success' : confirmTarget?.type === 'deactivate' ? 'warning' : 'danger'}
    />
  </>
);
};

export default memo(EmployeeSection);

