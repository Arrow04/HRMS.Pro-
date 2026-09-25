import { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { Employee, Branch, Department, Designation, Company } from '../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { normalizeArray } from '../utils/normalize';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee } from '../utils/employeePickerUtils';
import { joinEmployeeName, personDisplayName, personInitials } from '../utils/employeeNameUtils';
import { formatAppDate } from '../services/appSettingsService';
import DatePicker from '../components/DatePicker';
import DateRangePicker from '../components/DateRangePicker';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import EmployeeFormModal from './EmployeeFormModal';
import type { EmployeeFormData as SharedFormData } from './EmployeeFormModal';
import {
  Search, UserPlus, LogIn, X, Upload, User, Heart, MapPin, IdCard,
  GraduationCap, Award, Briefcase, HeartHandshake, Building2, Smartphone,
  Trophy, Sparkles, FileText, Settings, CheckCircle, Info, Phone, Edit2, Trash2, Banknote,
  TrendingUp, TrendingDown
} from 'lucide-react';

type Option = { value: string | number; label: string; code?: string; name?: string };

interface OnboardingSectionProps {
  companiesList: Company[];
  genderOptions: Option[];
  bloodGroupOptions: Option[];
  maritalStatusOptions: Option[];
  educationLevelOptions: Option[];
  employmentTypeOptions: Option[];
  statusOptions: Option[];
  deviceTypeOptions: Option[];
  activityTypeOptions: Option[];
  /** called from an external "Start Onboarding" button (e.g. page hero) */
  onStartOnboarding?: (employee?: Employee) => void;
}

// =============================================================================
// ONBOARDING SECTION - manages employees in active onboarding (status='new')
// =============================================================================

interface OnboardingFormData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  employeeCode?: string;
  joinDate?: string;
  companyId?: string | number;
  departmentId?: string | number;
  designationId?: string | number;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  employmentType?: string;
  status?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  currentAddress?: string;
  permanentAddress?: string;
  landmark?: string;
  aadharNumber?: string;
  panNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  passportNumber?: string;
  educationLevel?: string;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: string;
  grade?: string;
  certification?: string;
  certificationOrg?: string;
  certificationDate?: string;
  certificationExpiry?: string;
  skills?: string;
  language1?: string;
  language2?: string;
  language3?: string;
  pfNumber?: string;
  pfUan?: string;
  esicNumber?: string;
  mediclaimNumber?: string;
  mediclaimProvider?: string;
  fatherName?: string;
  motherName?: string;
  spouseName?: string;
  spousePhone?: string;
  numberOfChildren?: string | number;
  nomineeName?: string;
  nomineeRelationship?: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankAccounts?: { bankName?: string; bankAccountNumber?: string; ifscCode?: string; isPrimary?: boolean }[];
  baseSalary?: string | number;
  salaryComponents?: {
    basic?: string | number;
    hra?: string | number;
    specialAllowance?: string | number;
    otherAllowance?: string | number;
    conveyance?: string | number;
    medical?: string | number;
    travel?: string | number;
    performanceBonus?: string | number;
    pf?: string | number;
    esi?: string | number;
    professionalTax?: string | number;
    incomeTax?: string | number;
    gratuity?: string | number;
    loanRecovery?: string | number;
    otherDeductions?: string | number;
    [key: string]: unknown;
  };
  hobbies?: string;
  userId?: string | number;
  deviceType?: string;
  deviceIpAddress?: string;
  deviceMacAddress?: string;
  deviceSerialNumber?: string;
  branchIds?: number[];
  aadharFile?: File | null;
  panFile?: File | null;
  voterFile?: File | null;
  drivingLicenseFile?: File | null;
  passportFile?: File | null;
  certificationFiles?: FileList | null;
  deviceAssignedDate?: string;
  achievement1_title?: string;
  achievement1_org?: string;
  achievement1_date?: string;
  achievement1_description?: string;
  activity1_type?: string;
  activity1_name?: string;
  activity1_role?: string;
  activity1_description?: string;
  exp1_company?: string;
  exp1_designation?: string;
  exp1_from?: string;
  exp1_to?: string;
  exp1_reason?: string;
  [key: string]: unknown;
}

const OnboardingSection = forwardRef<{ startOnboarding: () => void }, OnboardingSectionProps>(({ companiesList, genderOptions, bloodGroupOptions, maritalStatusOptions, educationLevelOptions, employmentTypeOptions, statusOptions, deviceTypeOptions, activityTypeOptions, onStartOnboarding }, ref) => {
  const [search, setSearch] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('all');
  const [filterBranchId, setFilterBranchId] = useState('all');
  const [filterDepartmentId, setFilterDepartmentId] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingFormData, setOnboardingFormData] = useState<OnboardingFormData>({});
  const [employeeFormTab, setEmployeeFormTab] = useState('basic');
  const [isClosing, setIsClosing] = useState(false);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [onboardingSavingProgress, setOnboardingSavingProgress] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Employee[] | null>(null);
  const [activateTarget, setActivateTarget] = useState<Employee | null>(null);
  const [activating, setActivating] = useState(false);

  const queryClient = useQueryClient();


  const handleCreateEmployee = async () => {
    // Validate mandatory fields temporarily bypassed for dev
    /*
    const requiredFields = ['firstName', 'lastName', 'phone', 'currentAddress'];
    const missingFields = requiredFields.filter(field => !onboardingFormData[field as keyof typeof onboardingFormData]);
    if (missingFields.length > 0) {
      toast.error(`Please fill in all mandatory fields: ${missingFields.join(', ')}`);
      return;
    }
    */
  };

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowOnboardingModal(false);
      setIsClosing(false);
    }, 300);
  };

  // Fetch branches, departments, and designations based on selected company
  const { data: branchesList } = useQuery({
    queryKey: ['onboarding-branches', onboardingFormData.companyId],
    queryFn: async () => {
      try {
        const params = onboardingFormData.companyId ? `?companyId=${onboardingFormData.companyId}` : '';
        const response = await api.get(`/branches${params}`);
        const data = response.data || [];
        return data.filter((item: Branch) => item.status !== 'inactive');
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: departmentsList } = useQuery({
    queryKey: ['onboarding-departments', onboardingFormData.companyId],
    queryFn: async () => {
      try {
        const params = onboardingFormData.companyId ? `?companyId=${onboardingFormData.companyId}` : '';
        const response = await api.get(`/departments${params}`);
        const data = response.data || [];
        return data.filter((item: Department) => item.status !== 'inactive');
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ['onboarding-designations', onboardingFormData.companyId],
    queryFn: async () => {
      try {
        const params = onboardingFormData.companyId ? `?companyId=${onboardingFormData.companyId}` : '';
        const response = await api.get(`/api/designations${params}`);
        const data = response.data || [];
        return data.filter((item: Designation) => item.status !== 'inactive');
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: pickerRows = [], isLoading } = useEmployeePicker({ status: 'new' });
  const employees = pickerRows.map(normalizePickerEmployee) as Employee[];

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      toast.success('Employee deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete employee'),
  });

  const handleDelete = (id: number, name: string = 'employee') => {
    setDeleteTarget({ id, name });
  };

  const filteredData = useMemo(() => {
    if (!employees) return [];
    return employees.filter((item: Employee) => {
      const matchSearch = !search ||
        personDisplayName(item).toLowerCase().includes(search.toLowerCase()) ||
        item.email?.toLowerCase().includes(search.toLowerCase());
      const matchCompany = filterCompanyId === 'all' || String(item.companyId || '') === String(filterCompanyId);
      const matchBranch = filterBranchId === 'all' || (item.branchIds || []).map(String).includes(String(filterBranchId));
      const matchDept = filterDepartmentId === 'all' || String(item.departmentId || '') === String(filterDepartmentId);
      const rawStatus = String(item.onboardingStep || item.status || '').toLowerCase();
      const statusBucket = rawStatus === 'completed' ? 'onboarded' : 'pending';
      const matchStatus = filterStatus === 'all' || statusBucket === filterStatus.toLowerCase();
      let matchDate = true;
      if (filterStartDate && item.joinDate) {
        const join = item.joinDate.split('T')[0];
        if (filterEndDate) matchDate = join >= filterStartDate && join <= filterEndDate;
        else matchDate = join >= filterStartDate;
      }
      return matchSearch && matchCompany && matchBranch && matchDept && matchStatus && matchDate;
    });
  }, [employees, search, filterCompanyId, filterBranchId, filterDepartmentId, filterStatus, filterStartDate, filterEndDate]);

  // Progress is based on how many onboarding fields the user has actually filled,
  // not the step. So even an "onboarded" employee can show <100% if work remains.
  const computeOnboardingProgress = (item: Employee): number => {
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
    return Math.round((filled / (fields.length + 1)) * 100);
  };

  const handleStartOnboarding = (employee: Employee) => {
    setSelectedEmployee(employee);
    // Format dates to YYYY-MM-DD for date inputs
    const formatDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return '';
      return dateStr.split('T')[0]; // Extract just the date part
    };

    setOnboardingFormData({
      ...employee,
      // Map various fields that might have different names
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      email: employee.email || '',
      phone: employee.phone || '',
      employeeCode: employee.employeeCode || '',
      joinDate: formatDate(employee.joinDate),
      companyId: employee.companyId || '',
      departmentId: employee.departmentId || '',
      gender: employee.gender || '',
      dateOfBirth: formatDate(employee.dateOfBirth),
      bloodGroup: employee.bloodGroup || '',
      maritalStatus: employee.maritalStatus || '',
      emergencyContact: employee.emergencyContact || '',
      emergencyPhone: employee.emergencyPhone || '',
      currentAddress: employee.currentAddress || '',
      permanentAddress: employee.permanentAddress || '',
      landmark: employee.landmark || '',
      aadharNumber: employee.aadharNumber || '',
      panNumber: employee.panNumber || '',
      passportNumber: employee.passportNumber || '',
      certificationDate: formatDate(employee.certificationDate),
      certificationExpiry: formatDate(employee.certificationExpiry),
    });
    setOnboardingStep(0);
    setEmployeeFormTab('basic');
    setShowOnboardingModal(true);
  };

  const handleCompleteOnboarding = async () => {
    if (!selectedEmployee?.id) return;
    setOnboardingSubmitting(true);
    try {
      // Save all onboarding form data to the employee record first
      await api.put(`/employees/${selectedEmployee.id}/onboarding-data`, onboardingFormData);
      await api.post(`/employees/${selectedEmployee.id}/complete-onboarding`);
      toast.success('Onboarding completed. Use "Active Employee" to activate.');
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      handleCloseDrawer();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(apiErr.response?.data?.detail || 'Failed to complete onboarding');
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const handleActivateEmployee = async () => {
    if (!activateTarget?.id) return;
    setActivating(true);
    try {
      await api.post(`/employees/${activateTarget.id}/activate-onboarding`);
      toast.success(`${personDisplayName(activateTarget)} is now an active employee.`);
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      setActivateTarget(null);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(apiErr.response?.data?.detail || 'Failed to activate employee');
    } finally {
      setActivating(false);
    }
  };

  // Save the current onboarding form data to the employee record without completing it â€”
  // the employee stays in the onboarding pipeline (status 'new') and can resume later.
  const handleSaveProgress = async () => {
    if (!selectedEmployee?.id) return;
    setOnboardingSavingProgress(true);
    try {
      await api.put(`/employees/${selectedEmployee.id}/onboarding-data`, onboardingFormData);
      toast.success('Progress saved. You can resume this onboarding anytime.');
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(apiErr.response?.data?.detail || 'Failed to save progress');
    } finally {
      setOnboardingSavingProgress(false);
    }
  };

  const onboardingSteps = [
    { id: 'basic', label: 'Basic Info', icon: User },
    { id: 'personal', label: 'Personal', icon: Heart },
    { id: 'address', label: 'Address', icon: MapPin },
    { id: 'identity', label: 'Identity', icon: IdCard },
    { id: 'education', label: 'Education', icon: GraduationCap },
    { id: 'skills', label: 'Skills', icon: Award },
    { id: 'benefits', label: 'Benefits', icon: Briefcase },
    { id: 'family', label: 'Family', icon: HeartHandshake },
    { id: 'bank', label: 'Bank', icon: Building2 },
    { id: 'salary', label: 'Salary', icon: Banknote },
    { id: 'device', label: 'Device', icon: Smartphone },
    { id: 'experience', label: 'Experience', icon: Briefcase },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
    { id: 'activities', label: 'Activities', icon: Sparkles },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'it_setup', label: 'IT Setup', icon: Settings },
    { id: 'review', label: 'Review', icon: CheckCircle },
  ];

  useImperativeHandle(ref, () => ({
    startOnboarding: () => {
      if (filteredData.length > 0) handleStartOnboarding(filteredData[0]);
      else toast.error('No employees in onboarding');
    },
  }), [filteredData]);

  return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
      <div className="flex flex-col md:flex-row gap-4 px-6 py-5 border-b border-[var(--border-color)] bg-white">
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            value={filterCompanyId === 'all' ? 'all' : Number(filterCompanyId)}
            onChange={(val) => { setFilterCompanyId(val === 'all' ? 'all' : val.toString()); setFilterBranchId('all'); setFilterDepartmentId('all'); }}
            options={(companiesList || []).map((comp: Company) => ({ id: comp.id, name: comp.name }))}
            placeholder="All Companies" allOption="All Companies" className="w-40"
          />
          <SearchableSelect
            value={filterBranchId === 'all' ? 'all' : Number(filterBranchId)}
            onChange={(val) => setFilterBranchId(val === 'all' ? 'all' : val.toString())}
            options={(branchesList || []).map((branch: Branch) => ({ id: branch.id, name: branch.name }))}
            placeholder="All Branches" allOption="All Branches" className="w-40"
          />
          <SearchableSelect
            value={filterDepartmentId === 'all' ? 'all' : Number(filterDepartmentId)}
            onChange={(val) => setFilterDepartmentId(val === 'all' ? 'all' : val.toString())}
            options={(departmentsList || []).map((dept: Department) => ({ id: dept.id, name: dept.name }))}
            placeholder="All Departments" allOption="All Departments" className="w-40"
          />
          <SearchableSelect
            value={filterStatus === 'all' ? 'all' : filterStatus}
            onChange={(val) => setFilterStatus(val === 'all' ? 'all' : val.toString())}
            options={[
              { id: 'pending', name: 'Pending' },
              { id: 'onboarded', name: 'Onboarded' },
            ]}
            placeholder="All Status" allOption="All Status" className="w-40"
          />
          <DateRangePicker
            startDate={filterStartDate}
            endDate={filterEndDate}
            onDateChange={(s, e) => { setFilterStartDate(s); setFilterEndDate(e); }}
            placeholder="Filter by Date"
          />
          {(filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDepartmentId !== 'all' || filterStatus !== 'all' || filterStartDate || filterEndDate || search) && (
            <button
              onClick={() => { setSearch(''); setFilterCompanyId('all'); setFilterBranchId('all'); setFilterDepartmentId('all'); setFilterStatus('all'); setFilterStartDate(''); setFilterEndDate(''); }}
              className="flex items-center gap-2 px-4 py-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl text-sm font-medium transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
          </div>
        ) : (
          <DataTable
            data={filteredData}
            rowKey={(item: Employee) => item.id}
            searchable
            searchKeys={(item: Employee) => `${personDisplayName(item)} ${item.email || ''} ${item.employeeCode || ''}`}
            searchPlaceholder="Search employees..."
            emptyMessage="No employees in onboarding"
            logEntityType="employee"
            logFor={(item: Employee) => ({ id: item.id, label: personDisplayName(item) })}
            onEdit={(item: Employee) => handleStartOnboarding(item)}
            bulkActions={[
              {
                label: 'Start',
                icon: LogIn,
                variant: 'cyan',
                disabled: (selected) => selected.length !== 1,
                disabledTitle: 'Select exactly one employee to start',
                onAction: (items) => {
                  if (items.length === 1) handleStartOnboarding(items[0] as Employee);
                },
              },
              {
                label: 'Active Employee',
                icon: CheckCircle,
                variant: 'success',
                disabled: (selected) => selected.length !== 1,
                disabledTitle: 'Select exactly one employee to activate',
                onAction: (items) => {
                  if (items.length === 1) setActivateTarget(items[0] as Employee);
                },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  setBulkDeleteTargets(items as Employee[]);
                },
              },
            ]}
            columns={[
              {
                key: 'fullName', header: 'Employee', sortable: true,
                render: (item: Employee) => (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {personInitials(item)}
                    </div>
                    <div>
                      <div className="font-medium text-[#0F172A] text-sm">{personDisplayName(item)}</div>
                      <div className="text-xs text-[#94A3B8]">{item.email}</div>
                    </div>
                  </div>
                ),
                sortValue: (item: Employee) => personDisplayName(item),
              },
              { key: 'employeeCode', header: 'Code', render: (item: Employee) => <span className="inline-flex px-2.5 py-1 bg-[#F8FAFC] text-[#64748B] text-sm font-medium rounded-lg">{item.employeeCode || '-'}</span> },
              { key: 'joinDate', header: 'Onboarding Date', render: (item: Employee) => <span className="text-sm text-[#64748B]">{item.joinDate ? formatAppDate(item.joinDate) : 'Not set'}</span> },
              {
                key: 'status', header: 'Status', align: 'center',
                render: (item: Employee) => {
                  const isOnboarded = item.onboardingStep === 'completed';
                  return (
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isOnboarded ? 'bg-[#D1FAE5] text-[#047857]' : 'bg-[#FEF3C7] text-[#B45309]'}`}>
                      {isOnboarded ? 'Onboarded' : 'Pending'}
                    </span>
                  );
                },
              },
              {
                key: 'progress', header: 'Progress',
                render: (item: Employee) => {
                  const pct = computeOnboardingProgress(item);
                  return (
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#94A3B8] font-medium">{pct}%</span>
                    </div>
                  );
                },
              },
            ]}
            actions={(item: Employee) => (
              <div className="flex items-center justify-end gap-1">
                {item.onboardingStep === 'completed' && (
                  <button
                    onClick={() => setActivateTarget(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10B981] text-white rounded-lg text-xs font-semibold hover:bg-[#059669] transition-colors"
                    title="Move to active employee"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Active Employee
                  </button>
                )}
                {item.onboardingStep !== 'completed' && (
                  <button
                    onClick={() => handleStartOnboarding(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-xs font-semibold hover:bg-cyan-600 transition-colors"
                  >
                    <LogIn className="w-3 h-3" />
                    Start
                  </button>
                )}
                <button onClick={() => handleStartOnboarding(item)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(item.id, personDisplayName(item) || 'employee')} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* Onboarding Modal (shared component - same design/fields as Add/Edit Employee) */}
      {showOnboardingModal && (
        <EmployeeFormModal
          open={showOnboardingModal}
          title={`Onboarding - ${personDisplayName(selectedEmployee)}`}
          isClosing={isClosing}
          accent="#14B8A6"
          employeeId={selectedEmployee?.id}
          formData={onboardingFormData as unknown as SharedFormData}
          setFormData={setOnboardingFormData as (d: SharedFormData) => void}
          companiesList={companiesList}
          branchesList={branchesList || []}
          departmentsList={departmentsList || []}
          designations={designations}
          genderOptions={genderOptions}
          bloodGroupOptions={bloodGroupOptions}
          maritalStatusOptions={maritalStatusOptions}
          employmentTypeOptions={employmentTypeOptions}
          statusOptions={statusOptions}
          educationLevelOptions={educationLevelOptions}
          deviceTypeOptions={deviceTypeOptions}
          onClose={handleCloseDrawer}
          onSubmit={handleCompleteOnboarding}
          submitting={onboardingSubmitting}
          submitLabel="Complete Onboarding"
          onSaveProgress={handleSaveProgress}
          savingProgress={onboardingSavingProgress}
          showStatus
        />
      )}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        itemName={deleteTarget?.name || 'this employee'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isDeleting={deleteMutation.isPending}
      />

      {/* Bulk Delete Employees Modal */}
      {bulkDeleteTargets && bulkDeleteTargets.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => { if (!deleteMutation.isPending) setBulkDeleteTargets(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Delete {bulkDeleteTargets.length} employee(s)?</h3>
                <p className="text-xs text-[#64748B] mt-1">This will permanently remove the selected employees from onboarding. This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setBulkDeleteTargets(null)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  (bulkDeleteTargets || []).forEach((e) => deleteMutation.mutate(e.id));
                  setBulkDeleteTargets(null);
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[#DC2626] hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate Employee Modal - read-only onboarding date (system date) */}
      {activateTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => { if (!activating) setActivateTarget(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-[#D1FAE5] text-[#047857] flex items-center justify-center shrink-0">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Move to Active Employee</h3>
                <p className="text-xs text-[#64748B]">{personDisplayName(activateTarget)}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Onboarding Date</label>
                <input
                  type="text"
                  readOnly
                  value={formatAppDate(new Date())}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#64748B]"
                />
                <p className="mt-1 text-xs text-[#94A3B8]">Today's date will be recorded as the onboarding date when you proceed.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setActivateTarget(null)}
                  disabled={activating}
                  className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleActivateEmployee}
                  disabled={activating}
                  className="flex-1 px-4 py-2.5 bg-[#10B981] hover:bg-[#059669] text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {activating ? null : <CheckCircle className="w-4 h-4" />}
                  Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default OnboardingSection;
