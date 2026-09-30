import { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import type { Employee, Company, Department, Branch } from '../types';
type Option = { value: string | number; label: string; code?: string; name?: string };

interface OrgTreeNode {
  id: number;
  name?: string;
  email?: string;
  department?: string;
  designation?: string;
  directReports?: OrgTreeNode[];
}
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import ConfirmActionModal from '../components/ConfirmActionModal';
import {
  Plus,
  Search,
  Edit2,
  Users,
  UserCheck,
  UserX,
  X,
  Upload,
  User,
  CheckCircle,
  ArrowRightLeft,
  Archive,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import TransfersSection from '../components/TransfersSection';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMasterData } from '../hooks/useMasterData';
import { capitalizeStatus } from '../utils/statusUtils';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { getCurrentUser } from '../services/authService';
import EmployeeSection from '../components/EmployeeSection';
import SearchableSelect from '../components/SearchableSelect';
import EmployeeProfileModal from '../components/EmployeeProfileModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import BulkUploadModal from '../components/BulkUploadModal';
import DatePicker from '../components/DatePicker';
import DateRangePicker from '../components/DateRangePicker';
import { useEmployeeData } from '../hooks/useEmployeeData';
import { useUndoDelete } from '../hooks/useUndoDelete';
import { normalizeArray } from '../utils/normalize';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import { formatAppDate } from '../services/appSettingsService';
import EmployeeFormModal from '../components/EmployeeFormModal';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import Modal from '../components/Modal';
import type { EmployeeFormData as SharedFormData } from '../components/EmployeeFormModal';
import { personDisplayName, toFullNamePayload } from '../utils/employeeNameUtils';


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
  geofenceEnabled?: boolean;
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
  lifeInsuranceNumber?: string;
  lifeInsuranceProvider?: string;
  fatherName?: string;
  motherName?: string;
  siblingName?: string;
  spouseName?: string;
  spousePhone?: string;
  numberOfChildren?: string | number;
  nomineeName?: string;
  nomineeRelationship?: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
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
  [key: string]: unknown;
}

interface ArchivedEmployee {
  id: number;
  originalId?: number;
  name?: string;
  email?: string;
  employeeCode?: string;
  designation?: string;
  exitType?: string;
  exitDate?: string;
  archiveDate?: string;
  fnfSettledDate?: string;
  companyId?: number;
  companyName?: string;
  departmentId?: number;
  departmentName?: string;
  branchIds?: number[];
  branchNames?: string[];
}


// =============================================================================
// EMPLOYEE MANAGEMENT MAIN COMPONENT
// =============================================================================

// MAIN COMPONENT
// =============================================================================
const EmployeeManagement = () => {
  const queryClient = useQueryClient();
  const { can, canDelete } = usePermission();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active');
  const [search, setSearch] = useState('');
  const [archivedCompany, setArchivedCompany] = useState<number | 'all'>('all');
  const [archivedBranch, setArchivedBranch] = useState<number | 'all'>('all');
  const [archivedDepartment, setArchivedDepartment] = useState<number | 'all'>('all');
  const [archivedStartDate, setArchivedStartDate] = useState<string>('');
  const [archivedEndDate, setArchivedEndDate] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [expandedManagers, setExpandedManagers] = useState<Record<number, boolean>>({});
  const EMPTY_FORM_DATA = {
    firstName: '', lastName: '', employeeCode: '', joinDate: '', email: '', phone: '',
    companyId: '', departmentId: '', branchIds: [] as number[], designationId: '',
    employmentType: '', status: '', gender: '', dateOfBirth: '', bloodGroup: '',
    maritalStatus: '', emergencyContact: '', emergencyPhone: '',
    currentAddress: '', permanentAddress: '', landmark: '', permanentLandmark: '',
    currentState: '', currentPincode: '', permanentState: '', permanentPincode: '',
    aadharNumber: '', aadharFile: null, panNumber: '', panFile: null,
    voterId: '', voterFile: null, drivingLicense: '', drivingLicenseFile: null,
    passportNumber: '', passportFile: null,
    educationLevel: '', institution: '', degree: '', fieldOfStudy: '', graduationYear: '', grade: '',
    educationDetails: [{}, {}] as Record<string, unknown>[],
    certification: '', certificationOrg: '', certificationDate: '', certificationFiles: null, certificationFile: null,
    certifications: [{}, {}] as Record<string, unknown>[],
    skills: '', skillsList: [{}, {}] as Record<string, unknown>[], language1: '', language2: '', language3: '', languages: [{}, {}] as Record<string, unknown>[],
    experienceDetails: [{}, {}] as Record<string, unknown>[], achievementsDetails: [{}, {}] as Record<string, unknown>[], activitiesDetails: [{}, {}] as Record<string, unknown>[],
    pfNumber: '', pfUan: '', esicNumber: '', mediclaimNumber: '', mediclaimProvider: '', lifeInsuranceNumber: '', lifeInsuranceProvider: '',
    fatherName: '', motherName: '', siblingName: '', spouseName: '', spousePhone: '', numberOfChildren: '',
    nomineeName: '', nomineeRelationship: '',
    bankName: '', bankAccountNumber: '', ifscCode: '', accountHolderName: '',
    bankAccounts: [] as { bankName?: string; bankAccountNumber?: string; ifscCode?: string; accountHolderName?: string; isPrimary?: boolean }[],
    baseSalary: '', salaryComponents: {} as Record<string, unknown>,
    userId: '', deviceType: '', deviceIpAddress: '', deviceMacAddress: '', deviceSerialNumber: '', deviceAssignedDate: '',
    photoUrl: '', photoFile: null,
  };
  const [formData, setFormData] = useState<OnboardingFormData>(EMPTY_FORM_DATA);
  const [photoFile] = useState<File | null>(null);

  const [editingItem, setEditingItem] = useState<Employee | null>(null);
  const [, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [, setEmployeeFormTab] = useState('basic');
  const [filterOrgId, setFilterOrgId] = useState<number | 'all'>('all');
  const [filterCompanyId, setFilterCompanyId] = useState<number | 'all'>('all');
  const [filterBranchId, setFilterBranchId] = useState<number | 'all'>('all');
  const [filterDepartmentId, setFilterDepartmentId] = useState<number | 'all'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [, setUploadFile] = useState<File | null>(null);
  const [, setShowQuickAddModal] = useState(false);
  const [, setQuickAddFormData] = useState<OnboardingFormData>({});
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: number; name: string } | null>(null);
  const [toggleConfirmTarget, setToggleConfirmTarget] = useState<Employee | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [updateConfirmTarget, setUpdateConfirmTarget] = useState(false);
  const [restoreConfirmTarget, setRestoreConfirmTarget] = useState<ArchivedEmployee | null>(null);
  const [restoreActiveConfirmId, setRestoreActiveConfirmId] = useState<number | null>(null);

  const user = getCurrentUser();
  const isSuperAdmin = user?.role === 'super_admin';

  const hasActiveFilters = Boolean(search || filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDepartmentId !== 'all' || startDate || endDate);

  const clearFilters = () => {
    setSearch('');
    setFilterCompanyId('all');
    setFilterBranchId('all');
    setFilterDepartmentId('all');
    setStartDate('');
    setEndDate('');
  };

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const handleView = (item: Employee) => {
    setSelectedEmployee(item);
  };

  // Archived records store the original employee id — fetch the full employee to open the drawer.
  // If the original record no longer exists, fall back to the archived snapshot so the drawer still opens.
  const handleViewArchived = async (a: ArchivedEmployee) => {
    const fromSnapshot = (): void => {
      const [first = '', ...rest] = (a.name || '').split(' ');
      setSelectedEmployee({
        id: a.originalId || a.id,
        firstName: first,
        lastName: rest.join(' '),
        name: a.name || 'Archived Employee',
        email: a.email || '',
        employeeCode: a.employeeCode || '',
        designation: a.designation || '',
        status: 'inactive',
        exitType: a.exitType || '',
        exitDate: a.exitDate || '',
        archiveDate: a.archiveDate || '',
        fnfSettledDate: a.fnfSettledDate || '',
      } as unknown as Employee);
    };
    if (!a.originalId) {
      fromSnapshot();
      return;
    }
    try {
      const res = await api.get(`/employees/${a.originalId}`);
      const emp = res.data?.data || res.data || res.data?.items;
      if (emp) {
        setSelectedEmployee(emp);
      } else {
        fromSnapshot();
      }
    } catch {
      fromSnapshot();
    }
  };

  const handleSubmitEmployee = async () => {
    // Ask for consent before updating an existing employee
    if (editingItem) {
      setUpdateConfirmTarget(true);
      return;
    }
    await doSubmitEmployee();
  };

  const doSubmitEmployee = async () => {
    let finalFormData = toFullNamePayload({ ...formData });
    if (photoFile) {
      try {
        const fd = new FormData();
        fd.append('file', photoFile);
        if (editingItem) fd.append('employeeId', String(editingItem.id));
        const res = await api.post('/employees/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        finalFormData = { ...finalFormData, photoUrl: res.data?.photoUrl || res.data?.url || '' };
      } catch {
        toast.error('Failed to upload photo');
        return;
      }
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload: finalFormData });
    } else {
      createMutation.mutate(finalFormData);
    }
  };

  useEffect(() => {
    setMounted(true);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) handleCloseDrawer();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showModal]);

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
    }, 300);
  };

  const [savingProgress, setSavingProgress] = useState(false);

  // Save the current form data to the employee record without creating/activating it.
  // - Editing an existing employee: save the data in place.
  // - Adding a new employee: create a draft (status 'new') first so it appears in the
  //   Onboarding pipeline and can be resumed later, then save the data to that record.
  const handleSaveProgress = async () => {
    setSavingProgress(true);
    try {
      if (editingItem?.id) {
        await api.put(`/employees/${editingItem.id}/onboarding-data`, toFullNamePayload(formData as Record<string, unknown>));
        toast.success('Progress saved. You can resume this employee anytime.');
      } else {
        const res = await api.post('/employees', toFullNamePayload({
          ...formData,
          status: 'new',
          employeeCode: formData.employeeCode || `EMP-${Date.now()}`,
        }));
        const newId = res.data?.id || res.data?.employeeId;
        if (newId) {
          await api.put(`/employees/${newId}/onboarding-data`, toFullNamePayload(formData as Record<string, unknown>));
          setEditingItem({ id: newId } as Employee);
          toast.success('Draft saved. Continue from the Onboarding pipeline to complete it.');
        } else {
          toast.error('Could not create a draft employee');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(apiErr.response?.data?.detail || 'Failed to save progress');
    } finally {
      setSavingProgress(false);
    }
  };

  // Stats Queries
  const { data: stats } = useQuery({
    queryKey: ['employeeStats', filterOrgId, filterCompanyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterOrgId !== 'all') params.append('organizationId', String(filterOrgId));
      if (filterCompanyId !== 'all') params.append('companyId', String(filterCompanyId));
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [total, active, inactive, newJoiners, transfers, , archived] = await Promise.all([
        api.get(`/employees/count?${params.toString()}`),
        api.get(`/employees/count?status=active&${params.toString()}`),
        api.get(`/employees/count?status=inactive&${params.toString()}`),
        api.get(`/employees/count?joinDateAfter=${monthAgo}&${params.toString()}`),
        api.get('/employees/transfers'),
        api.get('/employees/transfers'),
        api.get('/archived-employees'),
        api.get('/archived-employees'),
      ]);

      const transferList = Array.isArray(transfers.data) ? transfers.data : [];
      const archivedList = Array.isArray(archived.data) ? archived.data : [];

      const transferRecent = transferList.filter((t: { created_at?: string }) => {
        const d = new Date(t.created_at || '');
        return !isNaN(d.getTime()) && d.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
      }).length;
      const archivedRecentCount = archivedList.filter((a: { archiveDate?: string }) => {
        const d = new Date(a.archiveDate || '');
        return !isNaN(d.getTime()) && d.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
      }).length;

      const pct = (recent: number, totalCount: number) => totalCount > 0 ? Math.round((recent / totalCount) * 100) : 0;

      return {
        total: total.data?.count || 0,
        active: active.data?.count || 0,
        inactive: inactive.data?.count || 0,
        newJoiners: newJoiners.data?.count || 0,
        transfersTotal: transferList.length,
        transfersRecent: pct(transferRecent, transferList.length),
        archivedTotal: archivedList.length,
        archivedRecent: pct(archivedRecentCount, archivedList.length),
        activeTrend: pct(newJoiners.data?.count || 0, active.data?.count || 0),
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Use custom hook for employee data
  const { masterData, organizationalData } = useEmployeeData(filterOrgId, filterCompanyId, formData.companyId ?? '', isSuperAdmin);
  const { genderOptions, statusOptions, bloodGroupOptions, employmentTypeOptions, maritalStatusOptions, educationLevelOptions, deviceTypeOptions, activityTypeOptions } = masterData;
  const { data: exitTypeOptions = [] } = useMasterData('EXIT_TYPE');
  const { organizationsList, companiesList, branchesList, departmentsList, designations } = organizationalData;

  // Main Data Query with pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const deferredSearch = useDeferredValue(search);

  const { data: employeesResponse, isLoading: loadingEmployees, isFetching } = useQuery({
    queryKey: ['employees', activeTab, filterOrgId, filterCompanyId, filterBranchId, filterDepartmentId, showDeleted, page, limit, deferredSearch],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        page,
        limit,
        view: 'summary',
      };
      if (deferredSearch.trim()) params.search = deferredSearch.trim();
      if (filterOrgId !== 'all') params.organizationId = filterOrgId;
      if (filterCompanyId !== 'all') params.companyId = filterCompanyId;
      if (filterBranchId !== 'all') params.branchId = filterBranchId;
      if (filterDepartmentId !== 'all') params.departmentId = filterDepartmentId;
      if (showDeleted) params.includeDeleted = true;
      if (activeTab === 'active') params.status = 'active';
      if (activeTab === 'inactive') params.status = 'inactive';
      if (activeTab === 'new') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        params.joinDateAfter = thirtyDaysAgo.toISOString().split('T')[0];
      }

      const response = await api.get('/employees', { params });
      const respData = response.data;
      const items = respData?.data || respData?.items || [];
      const paginationMeta = respData?.pagination || {};
      return {
        items: normalizeArray(items),
        page: paginationMeta.page || page,
        size: paginationMeta.limit || limit,
        total: paginationMeta.total ?? items.length,
        pages: paginationMeta.pages || Math.ceil((paginationMeta.total ?? items.length) / (paginationMeta.limit || limit)),
      };
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const employeesData = useMemo(
    () => (employeesResponse?.items as Employee[]) || [],
    [employeesResponse]
  );
  const pagination = { 
    page: employeesResponse?.page || 1, 
    limit: employeesResponse?.size || 10, 
    total: employeesResponse?.total || 0, 
    pages: employeesResponse?.pages || 0 
  };

  const { data: archivedEmployees = [] } = useQuery<ArchivedEmployee[]>({
    queryKey: ['archived-employees'],
    queryFn: () => api.get('/archived-employees').then(r => r.data),
  });

  const { data: orgStructure = [], isLoading: orgLoading } = useQuery({
    queryKey: ['employees', 'org-structure'],
    queryFn: () => api.get('/employees/org-structure').then(r => r.data?.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const toggleManager = (managerId: number) => {
    setExpandedManagers((prev) => ({ ...prev, [managerId]: !prev[managerId] }));
  };

  const filterOrgTree = useCallback((nodes: OrgTreeNode[], q: string): OrgTreeNode[] => {
    if (!q.trim()) return nodes;
    const lower = q.toLowerCase();
    return nodes.reduce((acc: OrgTreeNode[], node: OrgTreeNode) => {
      const nodeMatches = `${node.name || ''} ${node.email || ''} ${node.department || ''} ${node.designation || ''}`.toLowerCase().includes(lower);
      const filteredReports = filterOrgTree(node.directReports || [], q);
      if (nodeMatches || filteredReports.length > 0) {
        acc.push({ ...node, directReports: filteredReports });
      }
      return acc;
    }, []);
  }, []);

  const filteredOrg = useMemo(() => filterOrgTree(orgStructure, search), [orgStructure, search, filterOrgTree]);

  const renderOrgNode = (node: OrgTreeNode, level = 0): React.ReactElement => {
    const hasReports = node.directReports && node.directReports.length > 0;
    const isExpanded = expandedManagers[node.id];
    const initials = (node.name || '')
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border-color)] hover:shadow-md transition-shadow"
          style={{ marginLeft: level * 24 }}
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-white font-bold text-lg">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{node.name}</p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{node.designation || ''}</p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{node.department || ''}</p>
          </div>
          {hasReports && (
            <button
              onClick={() => toggleManager(node.id)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4 text-[#64748B]" /> : <ChevronDown className="w-4 h-4 text-[#64748B]" />}
            </button>
          )}
        </div>
        {isExpanded && hasReports && (
          <div>
            {node.directReports?.map((child) => renderOrgNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredArchivedEmployees = useMemo(() => {
    return (archivedEmployees || []).filter((a: ArchivedEmployee) => {
      const matchCompany = archivedCompany === 'all' || String(a.companyId ?? '') === String(archivedCompany);
      const matchBranch = archivedBranch === 'all' || (a.branchIds || []).includes(Number(archivedBranch));
      const matchDepartment = archivedDepartment === 'all' || String(a.departmentId ?? '') === String(archivedDepartment);
      const aDate = a.archiveDate ? a.archiveDate.split('T')[0] : '';
      const matchDate = (!archivedStartDate && !archivedEndDate)
        || (archivedStartDate && archivedEndDate && aDate >= archivedStartDate && aDate <= archivedEndDate)
        || (archivedStartDate && !archivedEndDate && aDate >= archivedStartDate)
        || (!archivedStartDate && archivedEndDate && aDate <= archivedEndDate);
      return matchCompany && matchBranch && matchDepartment && matchDate;
    });
  }, [archivedEmployees, archivedCompany, archivedBranch, archivedDepartment, archivedStartDate, archivedEndDate]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/employees', payload),
    onSuccess: () => {
      toast.success('Employee created successfully');
      handleCloseDrawer();
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['exitEmployees'] });
    },
    onError: () => toast.error('Failed to create employee'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => api.patch(`/employees/${id}`, payload),
    onSuccess: () => {
      toast.success('Employee updated successfully');
      handleCloseDrawer();
      queryClient.invalidateQueries({ queryKey: ['employees', activeTab, filterOrgId, filterCompanyId, filterBranchId, filterDepartmentId, showDeleted] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['exitEmployees'] });
    },
    onError: () => toast.error('Failed to update employee'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['exitEmployees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
    },
    onSettled: () => {
      setEmployeeToDelete(null);
    },
    onError: () => toast.error('Failed to delete employee'),
  });

  const { deleteWithUndo } = useUndoDelete<{ id: number; name: string }>({
    entityName: 'Employee',
    onDelete: (e) => deleteMutation.mutateAsync(e.id),
    onRestore: (e) => api.patch(`/employees/${e.id}/restore`),
    onDeleteDone: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['exitEmployees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
    },
    onRestoreDone: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['exitEmployees'] });
    },
  });

  const restoreArchivedMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/archived-employees/${id}/restore`),
    onSuccess: () => {
      toast.success('Employee restored to active');
      queryClient.invalidateQueries({ queryKey: ['archived-employees'] });
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
    },
    onSettled: () => {
      setRestoreConfirmTarget(null);
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { detail?: string } } };
      toast.error(apiErr.response?.data?.detail || 'Failed to restore employee');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => api.patch(`/employees/${id}/restore`),
    onSuccess: () => {
      toast.success('Employee restored successfully');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['exitEmployees'] });
    },
    onSettled: () => setRestoreActiveConfirmId(null),
    onError: () => toast.error('Failed to restore employee'),
  });

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      if (filterCompanyId !== 'all') formData.append('companyId', String(filterCompanyId));
      return api.post('/employees/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: (data: { data?: { created?: number; updated?: number; errors?: Array<{ row: number; error: string }> } }) => {
      const created = data.data?.created || 0;
      const updated = data.data?.updated || 0;
      const errors = data.data?.errors || [];
      if (errors.length > 0) {
        const errorSummary = errors.slice(0, 5).map(e => `Row ${e.row}: ${e.error}`).join('\n');
        const moreCount = errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : '';
        toast.error(`Bulk upload completed with errors:\n${errorSummary}${moreCount}\n\nCreated: ${created}, Updated: ${updated}, Failed: ${errors.length}`, {
          duration: 8000,
          style: { whiteSpace: 'pre-line' }
        });
      } else {
        toast.success(`Bulk upload completed: ${created} created, ${updated} updated`);
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (error: unknown) => {
      const apiErr = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${apiErr.response?.data?.message || apiErr.message}`);
    }
  });

  // Download template function
  const downloadTemplate = useCallback(async () => {
    try {
      const response = await api.get('/employees/template', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'employee_bulk_upload_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch {
      toast.error('Failed to download template');
    }
  }, []);


  const handleToggleStatus = async (item: Employee) => {
    if (!can('employees', 'write')) return;
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      // Always ask for consent before deactivating an employee
      setToggleConfirmTarget(item);
      return;
    }
    await doToggleStatus(item, newStatus);
  };

  const doToggleStatus = async (item: Employee, newStatus: string) => {
    setIsTogglingStatus(true);
    try {
      await api.patch(`/employees/${item.id}`, { status: newStatus });
      toast.success(`Employee ${newStatus} successfully`);
      // If deactivated, jump straight to the Inactive Employees tab
      if (newStatus === 'inactive' && activeTab === 'active') {
        setActiveTab('inactive');
        setPage(1);
      }
      queryClient.invalidateQueries({ queryKey: ['employees', activeTab, filterOrgId, filterCompanyId, filterBranchId, filterDepartmentId, showDeleted] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      queryClient.invalidateQueries({ queryKey: ['archived-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-inactive'] });
    } catch (error: unknown) {
      // Error logged
      const apiErr = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed to toggle status: ${apiErr.response?.data?.detail || apiErr.message}`);
    } finally {
      setIsTogglingStatus(false);
      setToggleConfirmTarget(null);
    }
  };

  const handleBulkStatusChange = useCallback(async (items: Employee[], status: 'active' | 'inactive') => {
    if (items.length === 0) return;
    if (!can('employees', 'write')) return;
    try {
      await Promise.all(items.map((item) => api.patch(`/employees/${item.id}`, { status })));
      toast.success(`${items.length} employee(s) ${status === 'active' ? 'activated' : 'deactivated'} successfully`);
      queryClient.invalidateQueries({ queryKey: ['employees', activeTab, filterOrgId, filterCompanyId, filterBranchId, filterDepartmentId, showDeleted] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats', filterOrgId, filterCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
    } catch (error: unknown) {
      // Error logged
      const apiErr = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed to update employees: ${apiErr.response?.data?.detail || apiErr.message}`);
    }
  }, [activeTab, filterOrgId, filterCompanyId, filterBranchId, filterDepartmentId, showDeleted, queryClient, can]);

  const [exitConfirmTarget, setExitConfirmTarget] = useState<Employee | null>(null);

  const handleProcessExit = (item: Employee) => {
    setExitConfirmTarget(item);
  };

  const confirmProcessExit = () => {
    if (!exitConfirmTarget) return;
    navigate(`/exit-management?employeeId=${exitConfirmTarget.id}`);
    setExitConfirmTarget(null);
  };

  const handleEdit = async (item: Employee) => {
    if (!can('employees', 'write')) return;
    try {
      const res = await api.get(`/employees/${item.id}`);
      const full = (res.data?.data || res.data) as Employee;
      setEditingItem(full || item);
      const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '';
        return dateStr.split('T')[0];
      };
      const emp = full || item;
      setFormData({
        ...emp,
        joinDate: formatDate(emp.joinDate),
        dateOfBirth: formatDate(emp.dateOfBirth),
        certificationDate: formatDate(emp.certificationDate),
        certificationExpiry: formatDate(emp.certificationExpiry),
        deviceAssignedDate: formatDate(emp.deviceAssignedDate),
      });
      setEmployeeFormTab('basic');
      setShowModal(true);
      setIsClosing(false);
    } catch {
      toast.error('Could not load employee details');
    }
  };

  const handleDelete = (id: number, name: string = 'employee') => {
    if (!canDelete('employees')) return;
    setEmployeeToDelete({ id, name });
  };

  const [showExitModal, setShowExitModal] = useState(false);
  const [exitForm, setExitForm] = useState({ exitType: 'resigned', exitDate: '', reason: '', lastWorkingDay: '' });

  const initiateExitMutation = useMutation({
    mutationFn: (data: { employeeId: number; payload: Record<string, unknown> }) =>
      api.post(`/employees/${data.employeeId}/initiate-exit`, data.payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Exit initiated successfully');
      setShowExitModal(false);
      setExitForm({ exitType: 'resigned', exitDate: '', reason: '', lastWorkingDay: '' });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats'] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { detail?: string } } };
      toast.error(apiErr.response?.data?.detail || 'Failed to initiate exit');
    },
  });

  const handleExitSubmit = () => {
    if (!selectedEmployee) return;
    initiateExitMutation.mutate({
      employeeId: selectedEmployee.id,
      payload: {
        exitType: exitForm.exitType,
        exitDate: exitForm.exitDate,
        reason: exitForm.reason,
        lastWorkingDay: exitForm.lastWorkingDay || exitForm.exitDate,
      },
    });
  };

  const handleRestore = (id: number) => {
    setRestoreActiveConfirmId(id);
  };

  const filteredData = useMemo(() => {
    if (!employeesData) return [];
    let rows = employeesData;
    if (startDate && endDate) {
      rows = rows.filter((item: Employee) => {
        if (!item.joinDate) return false;
        const joinDate = item.joinDate.split('T')[0];
        return joinDate >= startDate && joinDate <= endDate;
      });
    }
    return rows;
  }, [employeesData, startDate, endDate]);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [filterOrgId, filterCompanyId, filterBranchId, filterDepartmentId, activeTab, deferredSearch]);

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (employeesResponse && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [employeesResponse, hasLoaded]);

  if (!hasLoaded && isFetching) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Active Employees', value: stats?.active || 0, trend: stats?.activeTrend ?? 0, tooltip: 'Currently active employees', icon: UserCheck, iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5', iconColor: 'text-[#059669]', onClick: () => setActiveTab('active') },
    { label: 'Total Transfers', value: stats?.transfersTotal ?? 0, trend: stats?.transfersRecent ?? 0, tooltip: 'Employee transfers across departments', icon: ArrowRightLeft, iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5', iconColor: 'text-[var(--primary-blue)]', onClick: () => setActiveTab('transfers') },
    { label: 'Inactive Employees', value: stats?.inactive || 0, trend: -((stats?.total || 0) > 0 ? Math.round(((stats?.inactive || 0) / (stats?.total || 0)) * 100) : 0), tooltip: 'Currently inactive employees', icon: UserX, iconBg: 'bg-gradient-to-br from-[#EF4444]/20 via-[#F87171]/10 to-[#FCA5A5]/5', iconColor: 'text-[#DC2626]', onClick: () => setActiveTab('inactive') },
    { label: 'Archived Employees', value: stats?.archivedTotal ?? 0, trend: stats?.archivedRecent ?? 0, tooltip: 'Archived employees from past exits', icon: Archive, iconBg: 'bg-gradient-to-br from-[#14B8A6]/20 via-[#2DD4BF]/10 to-[#5EEAD4]/5', iconColor: 'text-[#0D9488]', onClick: () => setActiveTab('archived') },
  ];

  const TABS = [
    { id: 'active', label: 'Active Employees', icon: Users },
    { id: 'team', label: 'Team Directory', icon: Users },
    { id: 'transfers', label: 'Employee Transfer', icon: ArrowRightLeft },
    { id: 'inactive', label: 'Inactive Employees', icon: UserX },
    { id: 'archived', label: 'Archived', icon: Archive },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">

        {/* HEADER SECTION */}
        <PageHero
          title="Employee Management"
          subtitle="Manage employees, track status, view details"
          icon={Users}
          accent="blue"
          breadcrumbs={['HRMS.Pro!', 'Employees']}
          actions={
            <>
              {isSuperAdmin && (
                <SearchableSelect
                  value={filterOrgId === 'all' ? 'all' : Number(filterOrgId)}
                  onChange={(val) => setFilterOrgId(val === 'all' ? 'all' : Number(val))}
                  options={(organizationsList || []).map((org: { id: number; name: string }) => ({ id: org.id, name: org.name }))}
                  placeholder="All Organizations"
                  allOption="All Organizations"
                  className="w-52"
                  variant="hero"
                />
              )}
              <ExportButton
                rows={filteredData}
                filename="employees_export"
                label="Export"
              />
              <button
                onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                className={`flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium transition-colors ${activeTab === 'inactive' || activeTab === 'archived' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
                disabled={activeTab === 'inactive' || activeTab === 'archived'}
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              {activeTab === 'transfers' ? (
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Initiate Transfer
                </button>
              ) : can('employees', 'write') && activeTab !== 'inactive' && activeTab !== 'archived' ? (
                <button
                  onClick={() => {
                    setIsClosing(false);
                    setShowModal(true);
                    setEditingItem(null);
                    setFormData({ ...EMPTY_FORM_DATA });
                    setEmployeeFormTab('basic');
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  Add Employee
                </button>
              ) : null}
            </>
          }
        />

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat, index) => (
            <div key={stat.label} className="transition-all duration-300" style={{ transitionDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} trend={stat.trend} tooltip={stat.tooltip} iconBg={stat.iconBg} iconColor={stat.iconColor} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* TABS - Pill Style like Company Page */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[var(--primary-blue)] text-white shadow-md shadow-[#1C64F2]/20'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        {activeTab === 'team' ? (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[var(--border-color)]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search team by name, email, or department..."
                  className="w-full pl-9 pr-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-transparent outline-none text-[var(--text-primary)] placeholder-[#94A3B8]"
                />
              </div>
            </div>
            <div className="p-6">
              {orgLoading ? (
                <div className="text-center py-12 text-[var(--text-tertiary)]">Loading org structure...</div>
              ) : filteredOrg.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-tertiary)]">No reporting hierarchy configured yet.</div>
              ) : (
                <div className="space-y-2">
                  {filteredOrg.map((node) => renderOrgNode(node, 0))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'transfers' ? (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden flex flex-col flex-1">
            <TransfersSection
              companiesList={companiesList}
              branchesList={branchesList}
              departmentsList={departmentsList}
              designations={designations}
              showModal={showTransferModal}
              setShowModal={setShowTransferModal}
            />
          </div>
        ) : activeTab === 'archived' ? (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[var(--border-color)]">
              <SearchableSelect
                value={archivedCompany === 'all' ? 'all' : archivedCompany}
                onChange={(val) => { setArchivedCompany(val === 'all' ? 'all' : Number(val)); setArchivedBranch('all'); setArchivedDepartment('all'); }}
                options={(companiesList || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-40"
              />
              <SearchableSelect
                value={archivedBranch === 'all' ? 'all' : archivedBranch}
                onChange={(val) => setArchivedBranch(val === 'all' ? 'all' : Number(val))}
                options={(branchesList || []).filter((b: Branch) => archivedCompany === 'all' || (b as { companyId?: number }).companyId === archivedCompany).map((b: Branch) => ({ id: b.id, name: b.name }))}
                placeholder="All Branches"
                allOption="All Branches"
                className="w-40"
              />
              <SearchableSelect
                value={archivedDepartment === 'all' ? 'all' : archivedDepartment}
                onChange={(val) => setArchivedDepartment(val === 'all' ? 'all' : Number(val))}
                options={(departmentsList || []).filter((d: Department) => archivedCompany === 'all' || (d as { companyId?: number }).companyId === archivedCompany).map((d: Department) => ({ id: d.id, name: d.name }))}
                placeholder="All Departments"
                allOption="All Departments"
                className="w-40"
              />
              <DateRangePicker
                startDate={archivedStartDate}
                endDate={archivedEndDate}
                onDateChange={(start, end) => { setArchivedStartDate(start); setArchivedEndDate(end); }}
                placeholder="Filter by Archive Date"
              />
              {(archivedCompany !== 'all' || archivedBranch !== 'all' || archivedDepartment !== 'all' || archivedStartDate || archivedEndDate) && (
                <button
                  onClick={() => { setArchivedCompany('all'); setArchivedBranch('all'); setArchivedDepartment('all'); setArchivedStartDate(''); setArchivedEndDate(''); }}
                  className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors"
                  title="Clear Filters"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
            <DataTable
              data={filteredArchivedEmployees}
              rowKey={(a: ArchivedEmployee) => a.id}
              searchable
              searchKeys={(a: ArchivedEmployee) => `${a.name} ${a.employeeCode || ''} ${a.designation || ''}`}
              searchPlaceholder="Search archived employees..."
              logEntityType="employee"
              logFor={(a: ArchivedEmployee) => ({ id: a.originalId || a.id, label: a.name })}
              emptyMessage="No archived employees"
              columns={[
                {
                  key: 'name', header: 'Employee', sortable: true,
                  render: (a: ArchivedEmployee) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-sm font-medium text-[#0F172A]">{a.name}</span>
                          {a.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{a.employeeCode}</span>}
                        </div>
                        <p className="text-xs text-[#64748B] truncate">{a.designation || ''}</p>
                      </div>
                    </div>
                  ),
                  sortValue: (a: ArchivedEmployee) => a.name,
                },
                {
                  key: 'exitType', header: 'Exit Type', sortable: true,
                  render: (a: ArchivedEmployee) => {
                    const t = (a.exitType || '').toLowerCase();
                    const cls = t === 'resignation' ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' : t === 'termination' ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]' : t === 'retirement' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{capitalizeStatus(a.exitType || '')}</span>;
                  },
                  sortValue: (a: ArchivedEmployee) => a.exitType,
                },
                { key: 'exitDate', header: 'Exit Date', render: (a: ArchivedEmployee) => <span className="text-sm text-[#64748B]">{a.exitDate ? formatAppDate(a.exitDate) : '-'}</span> },
                { key: 'archiveDate', header: 'Archive Date', render: (a: ArchivedEmployee) => <span className="text-sm text-[#64748B]">{a.archiveDate ? formatAppDate(a.archiveDate) : '-'}</span> },
                {
                  key: 'fnfSettledDate', header: 'FnF Settled',
                  render: (a: ArchivedEmployee) => a.fnfSettledDate ? <span className="text-xs text-[#059669] font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {formatAppDate(a.fnfSettledDate)}</span> : <span className="text-xs text-[#D97706]">Pending</span>,
                },
              ]}
              actions={(a: ArchivedEmployee) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => handleViewArchived(a)}
                    title="View employee details & history"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] text-[#64748B] rounded-lg text-xs font-semibold hover:bg-[#EFF6FF] hover:text-[#1C64F2] transition-colors">
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  <button onClick={() => setRestoreConfirmTarget(a)} disabled={restoreArchivedMutation.isPending}
                    title="Restore employee to active"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#64748B] text-white rounded-lg text-xs font-semibold hover:bg-[#475569] transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              )}
            />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <EmployeeSection
             companiesList={companiesList || []}
             branchesList={branchesList || []}
             filterBranchesList={branchesList || []}
             departmentsList={departmentsList || []}
             loadingEmployees={loadingEmployees}
             filteredData={filteredData}
             showDeleted={showDeleted}
             setShowDeleted={setShowDeleted}
             search={search}
             setSearch={setSearch}
             filterCompanyId={filterCompanyId}
             setFilterCompanyId={setFilterCompanyId}
             filterBranchId={filterBranchId}
             setFilterBranchId={setFilterBranchId}
             filterDepartmentId={filterDepartmentId}
             setFilterDepartmentId={setFilterDepartmentId}
             startDate={startDate}
             setStartDate={setStartDate}
             endDate={endDate}
             setEndDate={setEndDate}
             clearFilters={clearFilters}
             hasActiveFilters={hasActiveFilters}
               handleView={handleView}
                handleEdit={handleEdit}
                handleToggleStatus={handleToggleStatus}
                handleBulkStatusChange={handleBulkStatusChange}
                onProcessExit={handleProcessExit}
                handleDelete={handleDelete}
              handleRestore={handleRestore}
              isSuperAdmin={user?.role === 'superadmin'}
              handleAddEmployee={() => {
               setIsClosing(false);
               setShowModal(true);
               setEditingItem(null);
                setFormData({ ...EMPTY_FORM_DATA });
                setEmployeeFormTab('basic');
              }}
              downloadTemplate={downloadTemplate}
              setShowBulkUpload={setShowBulkUpload}
              setIsClosing={setIsClosing}
             setShowQuickAddModal={setShowQuickAddModal}
             setQuickAddFormData={setQuickAddFormData}
             serverPagination={{
               page: pagination.page,
               pageSize: limit,
               total: pagination.total,
               onPageChange: setPage,
               onPageSizeChange: (size) => { setLimit(size); setPage(1); },
             }}
           />
          </div>
        )}

        {/* Employee Form Modal (shared - same design for Add/Edit) */}
        {showModal && (
          <EmployeeFormModal
            open={showModal}
            title={editingItem ? 'Edit Employee' : 'Add Employee'}
            isClosing={isClosing}
            accent="#1C64F2"
            employeeId={editingItem?.id}
            currentUserName={user?.fullName || ''}
            formData={formData as unknown as SharedFormData}
            setFormData={setFormData as (d: SharedFormData) => void}
            companiesList={companiesList || []}
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
            activityTypeOptions={activityTypeOptions}
            onClose={handleCloseDrawer}
            onSubmit={handleSubmitEmployee}
            submitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={editingItem ? 'Update Employee' : 'Create Employee'}
            onSaveProgress={handleSaveProgress}
            savingProgress={savingProgress}
            showStatus
          />
        )}
        {/* Exit Initiation Modal */}
        {showExitModal && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowExitModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Initiate Exit</h3>
                <button onClick={() => setShowExitModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exit Type</label>
                  <select value={exitForm.exitType} onChange={e => setExitForm(f => ({ ...f, exitType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {exitTypeOptions.map((opt: Option) => (
                      <option key={opt.code} value={opt.code}>{opt.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Type of exit</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exit Date</label>
                  <DatePicker value={exitForm.exitDate} onChange={(val) => setExitForm(f => ({ ...f, exitDate: val }))} />
                  <p className="mt-1 text-xs text-gray-400">Date the exit takes effect</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Working Day</label>
                  <DatePicker value={exitForm.lastWorkingDay} onChange={(val) => setExitForm(f => ({ ...f, lastWorkingDay: val }))} />
                  <p className="mt-1 text-xs text-gray-400">Employee's final working day</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <textarea value={exitForm.reason} onChange={e => setExitForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={3} />
                  <p className="mt-1 text-xs text-gray-400">Reason for the exit</p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={() => setShowExitModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleExitSubmit} disabled={initiateExitMutation.isPending}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                  {initiateExitMutation.isPending ? 'Processing...' : 'Initiate Exit'}
                </button>
              </div>
            </div>
          </div>
        )}

        <BulkUploadModal
          isOpen={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          title="Employees"
          columns="first_name, last_name, email, employee_code, phone, current_address, company_id, department_id, designation_id, status"
          onDownloadTemplate={downloadTemplate}
          onUpload={async (file) => bulkUploadMutation.mutateAsync(file)}
          isUploading={bulkUploadMutation.isPending}
        />

        {selectedEmployee && (
          <EmployeeProfileModal
            employeeId={selectedEmployee.id}
            isOpen={!!selectedEmployee}
            onClose={() => setSelectedEmployee(null)}
          />
        )}

        {/* Update confirmation modal */}
        <Modal isOpen={updateConfirmTarget} onClose={() => setUpdateConfirmTarget(false)} title="Confirm Update">
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Edit2 className="w-8 h-8 text-[#1C64F2]" />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">Are you sure?</h3>
              <p className="text-[#64748B] mb-6">
                You are about to update <span className="font-semibold text-[#0F172A]">{editingItem ? personDisplayName(editingItem) : 'this employee'}</span>'s details.
                This will overwrite the existing employee record.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => setUpdateConfirmTarget(false)}
                  className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
                  Cancel
                </button>
                <button onClick={() => { setUpdateConfirmTarget(false); doSubmitEmployee(); }}
                  className="flex-1 px-4 py-2.5 bg-[#1C64F2] text-white font-medium rounded-xl hover:bg-[#1E40AF] transition-colors flex items-center justify-center gap-2">
                  <Edit2 className="w-4 h-4" /> Yes, Update
                </button>
              </div>
            </div>
          </div>
        </Modal>

        <ConfirmDeleteModal
          isOpen={!!employeeToDelete}
          onClose={() => setEmployeeToDelete(null)}
          onConfirm={() => employeeToDelete && deleteWithUndo(employeeToDelete)}
          itemName={employeeToDelete?.name || 'this employee'}
          isDeleting={deleteMutation.isPending}
        />

        {/* Deactivation consent modal */}
        <Modal isOpen={!!toggleConfirmTarget} onClose={() => { if (!isTogglingStatus) setToggleConfirmTarget(null); }} title="Deactivate Employee">
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <UserX className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">Are you sure?</h3>
              <p className="text-[#64748B] mb-2">
                You are about to deactivate <span className="font-semibold text-[#0F172A]">{toggleConfirmTarget ? personDisplayName(toggleConfirmTarget) : ''}</span>.
              </p>
              <p className="text-xs text-[#94A3B8] mb-6 leading-relaxed">
                This will restrict their login access, move them to the <b>Inactive Employees</b> tab, and
                automatically create an exit record on the <b>Exit Management</b> page for FnF settlement and clearance.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => setToggleConfirmTarget(null)} disabled={isTogglingStatus}
                  className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
                  Cancel
                </button>
                <button onClick={() => toggleConfirmTarget && doToggleStatus(toggleConfirmTarget, 'inactive')} disabled={isTogglingStatus}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-white font-medium rounded-xl hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {isTogglingStatus ? (
                    <>
                      Deactivating...
                    </>
                  ) : (
                    <>
                      <UserX className="w-4 h-4" />
                      Yes, Deactivate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Restore confirmation modal */}
        <Modal isOpen={!!restoreConfirmTarget} onClose={() => { if (!restoreArchivedMutation.isPending) setRestoreConfirmTarget(null); }} title="Restore Employee">
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <RotateCcw className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">Restore this employee?</h3>
              <p className="text-[#64748B] mb-6">
                <span className="font-semibold text-[#0F172A]">{restoreConfirmTarget?.name || 'This employee'}</span> will be
                moved back to <b>Active Employees</b>, their login access will be restored, and the associated
                exit record will be re-opened for processing.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => setRestoreConfirmTarget(null)} disabled={restoreArchivedMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
                  Cancel
                </button>
                <button onClick={() => restoreConfirmTarget && restoreArchivedMutation.mutate(restoreConfirmTarget.id)} disabled={restoreArchivedMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {restoreArchivedMutation.isPending ? (
                    <>
                      Restoring...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Yes, Restore
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Modal>

        <ConfirmActionModal
          isOpen={!!exitConfirmTarget}
          title="Process Exit"
          message={`Are you sure you want to process exit for ${personDisplayName(exitConfirmTarget)}?`}
          consequence="This will initiate the exit process and move the employee to the Exit Management page for FnF settlement and clearance."
          confirmLabel="Yes, Process Exit"
          variant="warning"
          isPending={false}
          onConfirm={confirmProcessExit}
          onCancel={() => setExitConfirmTarget(null)}
        />
        <ConfirmActionModal
          isOpen={restoreActiveConfirmId !== null}
          title="Restore Employee"
          message="Are you sure you want to restore this employee? They will be moved back to the active employees list."
          consequence="The employee will become active again and regain access to the system."
          confirmLabel="Yes, Restore"
          variant="success"
          isPending={restoreMutation.isPending}
          onConfirm={() => {
            if (restoreActiveConfirmId !== null) {
              restoreMutation.mutate(restoreActiveConfirmId);
              setRestoreActiveConfirmId(null);
            }
          }}
          onCancel={() => setRestoreActiveConfirmId(null)}
        />
    </div>
    </div>
  );
};

export default EmployeeManagement;
