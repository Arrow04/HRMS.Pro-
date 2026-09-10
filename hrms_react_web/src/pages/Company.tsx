import { useState, useEffect, useRef, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { usePagination } from '../hooks/usePagination';
import {
  Building, MapPin, Building2, Briefcase, Plus, Search, Edit2, Trash2, X, TrendingUp, Clock, Calendar, Loader2, Sun, CloudRain, CloudLightning, CloudFog, CloudSun, Cloud, Users, Award, CheckCircle, XCircle, RotateCcw, Download, Upload, Info, Filter, Eye, Paperclip, FileText
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import Tooltip from '../components/Tooltip';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import SearchableSelect from '../components/SearchableSelect';
import PhoneInput from '../components/PhoneInput';
import FormField, { formInputClass, formTextareaClass, formReadonlyClass } from '../components/FormField';
import { formGridClass } from '../components/FormGrid';
import CompactImageUpload from '../components/CompactImageUpload';
import { personDisplayName } from '../utils/employeeNameUtils';
import StateSelect from '../components/StateSelect';
import PincodeInput from '../components/PincodeInput';
import DateRangePicker from '../components/DateRangePicker';
import { useMasterData } from '../hooks/useMasterData';
import { useAppConfig } from '../context/AppConfigContext';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import type { DataTableColumn } from '../components/DataTable';
import type { LucideIcon } from 'lucide-react';
import type { Company as CompanyType, Department, Designation, Branch } from '../types';
import Modal from '../components/Modal';

type TabId = 'companies' | 'branches' | 'departments' | 'designations';

type EntityItem = {
  id: number;
  name?: string;
  title?: string;
  code?: string;
  description?: string;
  status?: string;
  registrationNumber?: string;
  taxId?: string;
  cin?: string;
  panNo?: string;
  tanNo?: string;
  gstNo?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  address?: string;
  state?: string;
  pincode?: string;
  website?: string;
  email?: string;
  phone?: string;
  logo?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
  geofenceRadius?: string | number;
  companyId?: string | number;
  managerId?: string | number;
  managerName?: string;
  branchId?: string | number;
  departmentId?: string | number;
  grade?: string;
  createdAt?: string;
};

type EntityForm = {
  name?: string;
  title?: string;
  grade?: string;
  code?: string;
  description?: string;
  email?: string;
  phone?: string;
  status?: string;
  registrationNumber?: string;
  taxId?: string;
  cin?: string;
  panNo?: string;
  tanNo?: string;
  gstNo?: string;
  industry?: string;
  companySize?: string;
  address?: string;
  state?: string;
  pincode?: string;
  website?: string;
  logo?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
  geofenceRadius?: string | number;
  companyId?: string | number;
  managerId?: string | number;
};

interface StatusOption {
  value?: string;
  label?: string;
  name?: string;
  code?: string;
}

interface GradeOption {
  id: number;
  name: string;
}

interface EmployeeListItem {
  id: number;
  firstName: string;
  lastName?: string;
  employeeCode?: string;
  status?: string;
  is_active?: boolean;
  companyId?: number | null;
  company?: { id: number; name: string } | null;
  companies?: { id: number; name: string }[];
}

// =============================================================================
// COMPANY PAGE - FRESH REBUILD v6.0
// Dashboard-style vibrant design with backend integration
// =============================================================================

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'branches', label: 'Branches', icon: MapPin },
  { id: 'departments', label: 'Departments', icon: Briefcase },
  { id: 'designations', label: 'Designations', icon: Users }
];

const INITIAL_FORM_DATA: EntityForm = { name: '', title: '', grade: '', code: '', description: '', email: '', phone: '', status: 'active', registrationNumber: '', taxId: '', cin: '', panNo: '', tanNo: '', gstNo: '', industry: '', companySize: '', country: '', address: '', state: '', pincode: '', website: '', logo: '', location: '', latitude: '', longitude: '', geofenceRadius: '', companyId: '', managerId: '' };

const getSingularName = (tab: string) => tab === 'companies' ? 'Company' : tab === 'branches' ? 'Branch' : tab === 'departments' ? 'Department' : 'Designation';

const Company = () => {
  const { country: orgCountry, dialCode } = useAppConfig();
  const [activeTab, setActiveTab] = useState<TabId>('companies');
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingItem, setEditingItem] = useState<EntityItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Additional filters
  const [companyFilter, setCompanyFilter] = useState<string | number>('all');
  const [branchFilter, setBranchFilter] = useState<string | number>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string | number>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [formData, setFormData] = useState<EntityForm>({});
  const companyCountry = (orgCountry || 'India');
  const isCompanyIndia = companyCountry.toLowerCase() === 'india';
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  const [employeeSearch, setEmployeeSearch] = useState<string>('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState<boolean>(false);
  const [showBulkUpload, setShowBulkUpload] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, name: string } | null>(null);
  const [bulkDeleteConfirmItems, setBulkDeleteConfirmItems] = useState<EntityItem[] | null>(null);

  const queryClient = useQueryClient();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const employeeSearchRef = useRef<HTMLDivElement>(null);
  const [isSearchingEmployees, setIsSearchingEmployees] = useState(false);
  const [employeeSearchResults, setEmployeeSearchResults] = useState<EmployeeListItem[]>([]);
  const stableEmptyRef = useRef<EmployeeListItem[]>([]);

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];
  
  // Use React Query to fetch the list data based on active tab
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: items = [], isLoading: loadingItems, isFetching, refetch } = useQuery({
    queryKey: [activeTab],
    queryFn: async (): Promise<EntityItem[]> => {
      const response = await api.get(`/${activeTab}`);
                  return (response.data || []) as EntityItem[];
                  },
                  staleTime: 0,
                  refetchOnMount: true,
  });

  // Fetch employees for department head dropdown - only when needed
  
  const { data: companies = [] } = useQuery({
    queryKey: ['companies-dropdown'],
    queryFn: async (): Promise<CompanyType[]> => {
      const res = await api.get('/companies', { params: { active_only: true } });
      return (res.data?.items || res.data || []) as CompanyType[];
    }
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches-dropdown'],
    queryFn: async (): Promise<Branch[]> => {
      const res = await api.get('/branches', { params: { active_only: true } });
      return (res.data?.items || res.data || []) as Branch[];
    }
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-dropdown'],
    queryFn: async (): Promise<Department[]> => {
      const res = await api.get('/departments', { params: { active_only: true } });
      return (res.data?.items || res.data || []) as Department[];
    }
  });

  const { data: employeesData } = useQuery({
    queryKey: ['department-head-candidates'],
    queryFn: async (): Promise<EmployeeListItem[]> => {
      const response = await api.get('/department-head-candidates');
      const payload = Array.isArray(response.data) ? response.data : (response.data?.data ?? []);
      return payload as EmployeeListItem[];
    },
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === 'departments' || showModal
  });
  const employees = employeesData ?? stableEmptyRef.current;


  // Fetch stats data
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['companyStats'],
    queryFn: async () => {
      try {
        const [companiesRes, branchesRes, deptsRes, desigsRes] = await Promise.all([
          api.get('/companies'),
          api.get('/branches'),
          api.get('/departments'),
          api.get('/designations')
        ]);

        // Compute real growth trend: % created within the last 30 days.
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        const computeTrend = (rows: EntityItem[]): number => {
          const total = rows.length;
          if (total === 0) return 0;
          const recent = rows.filter((r) => {
            if (!r.createdAt) return false;
            const d = new Date(r.createdAt);
            return !isNaN(d.getTime()) && d >= monthAgo;
          }).length;
          return Math.round((recent / total) * 100);
        };

        const companies = companiesRes.data?.items || companiesRes.data || [];
        const branches = branchesRes.data?.items || branchesRes.data || [];
        const depts = deptsRes.data?.items || deptsRes.data || [];
        const desigs = desigsRes.data?.items || desigsRes.data || [];

        return {
          totalCompanies: companies.length,
          totalBranches: branches.length,
          totalDepartments: depts.length,
          totalDesignations: desigs.length,
          trendCompanies: computeTrend(companies),
          trendBranches: computeTrend(branches),
          trendDepartments: computeTrend(depts),
          trendDesignations: computeTrend(desigs),
        };
      } catch (error) {
        return { totalCompanies: 0, totalBranches: 0, totalDepartments: 0, totalDesignations: 0, trendCompanies: 0, trendBranches: 0, trendDepartments: 0, trendDesignations: 0 };
      }
    },
    staleTime: 5 * 60 * 1000
  });

  const filteredItems = useMemo(() => {
    return items.filter((item: EntityItem) => {
      const searchTarget = activeTab === 'designations' ? item.title : item.name;
        const matchSearch = (searchTarget || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCompany = companyFilter === 'all' || item.companyId?.toString() === companyFilter.toString();
      const matchBranch = branchFilter === 'all' || item.branchId?.toString() === branchFilter.toString();
      const matchDepartment = departmentFilter === 'all' || item.departmentId?.toString() === departmentFilter.toString();
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchCompany && matchBranch && matchDepartment && matchStatus;
    });
  }, [items, searchTerm, companyFilter, branchFilter, departmentFilter, statusFilter]);

  const pagination = usePagination({ totalItems: filteredItems.length, itemsPerPage: 10 });
  const paginatedItems = useMemo(() => filteredItems.slice(pagination.startIndex, pagination.endIndex), [filteredItems, pagination.startIndex, pagination.endIndex]);

  const handleEdit = (item: EntityItem) => {
    setEditingItem(item);
    setFormData({ ...INITIAL_FORM_DATA, ...item });
    setEmployeeSearch(item.managerName ? `${item.managerName}` : '');
    setEmployeeSearchResults([]);
    setShowEmployeeDropdown(false);
    setShowModal(true);
    setIsClosing(false);
  };

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
      setEditingItem(null);
      setFormData(INITIAL_FORM_DATA);
      setEmployeeSearch('');
      setEmployeeSearchResults([]);
      setShowEmployeeDropdown(false);
    }, 300);
  };

  // Handle employee search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (employeeSearch.length >= 2) {
      setIsSearchingEmployees(true);
      searchTimeoutRef.current = setTimeout(() => {
        // Filter employees by the selected company (formData.companyId) first,
        // then by name/code search.
        const selectedCompanyId = formData.companyId ? Number(formData.companyId) : null;
        const filtered = employees.filter((employee: EmployeeListItem) => {
          if (selectedCompanyId) {
            const empCompanyIds = [
              employee.companyId,
              ...(employee.companies || []).map((c) => c.id),
              employee.company?.id,
            ].filter((v) => v != null);
            if (!empCompanyIds.includes(selectedCompanyId)) return false;
          }
          const matchesSearch = `${personDisplayName(employee)} ${employee.employeeCode || ''}`.toLowerCase().includes(employeeSearch.toLowerCase());
          return matchesSearch;
        }).slice(0, 20);
        setEmployeeSearchResults(filtered);
        setIsSearchingEmployees(false);
        setShowEmployeeDropdown(true);
      }, 300);
    } else {
      setEmployeeSearchResults([]);
      setShowEmployeeDropdown(false);
    }
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [employeeSearch, employees, formData.companyId]);

  // Handle employee selection
  const handleEmployeeSelect = (employee: EmployeeListItem) => {
    setFormData({ ...formData, managerId: employee.id });
    setEmployeeSearch(`${personDisplayName(employee)} (${employee.employeeCode || ''})`);
    setShowEmployeeDropdown(false);
    setEmployeeSearchResults([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeSearchRef.current && !employeeSearchRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Master data for dropdowns
  const { data: companyStatusOptions = [] } = useMasterData('COMPANY_STATUS');
  const { data: branchStatusOptions = [] } = useMasterData('BRANCH_STATUS');
  const { data: departmentStatusOptions = [] } = useMasterData('DEPARTMENT_STATUS');
  const { data: designationStatusOptions = [] } = useMasterData('DESIGNATION_STATUS');
  const { data: designationGradeOptions = [] } = useMasterData('DESIGNATION_GRADE');
  const { data: industryOptions = [] } = useMasterData('INDUSTRY');
  const { data: companySizeOptions = [] } = useMasterData('COMPANY_SIZE');

  const industryArray = Array.isArray(industryOptions) ? industryOptions : [];
  const companySizeArray = Array.isArray(companySizeOptions) ? companySizeOptions : [];
  const gradeValues = Array.isArray(designationGradeOptions) ? designationGradeOptions : [];

  const getStatusArray = () => {
    const options = (() => {
      switch (activeTab) {
        case 'companies': return companyStatusOptions;
        case 'branches': return branchStatusOptions;
        case 'departments': return departmentStatusOptions;
        case 'designations': return designationStatusOptions;
        default: return [];
      }
    })();
    return Array.isArray(options) ? options : [];
  };
  const statusArray = getStatusArray();

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return api.post(`/${activeTab}`, data);
    },
    onSuccess: () => {
      toast.success(`${getSingularName(activeTab)} created successfully`);
      queryClient.invalidateQueries({ queryKey: [activeTab] });
      queryClient.invalidateQueries({ queryKey: ['companyStats'] });
      queryClient.invalidateQueries({ queryKey: ['companies-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['branches-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['departments-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      handleCloseDrawer();
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Failed to create ${getSingularName(activeTab)}: ${apiError.response?.data?.message || apiError.message}`);
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      return api.put(`/${activeTab}/${id}`, data);
    },
    onSuccess: () => {
      toast.success(`${getSingularName(activeTab)} updated successfully`);
      queryClient.invalidateQueries({ queryKey: [activeTab] });
      queryClient.invalidateQueries({ queryKey: ['companyStats'] });
      queryClient.invalidateQueries({ queryKey: ['companies-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['branches-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['departments-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      handleCloseDrawer();
    },
    onError: () => {
      toast.error(`Failed to update ${getSingularName(activeTab)}`);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/${activeTab}/${id}`);
    },
    onSuccess: () => {
      toast.success(`${getSingularName(activeTab)} deleted successfully`);
      queryClient.invalidateQueries({ queryKey: [activeTab] });
      queryClient.invalidateQueries({ queryKey: ['companyStats'] });
      queryClient.invalidateQueries({ queryKey: ['companies-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['branches-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['departments-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: () => {
      toast.error(`Failed to delete ${getSingularName(activeTab)}`);
    }
  });

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(`/${activeTab}/bulk-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: (data: { data?: { created?: number; updated?: number } }) => {
      const created = data.data?.created || 0;
      const updated = data.data?.updated || 0;
      toast.success(`Bulk upload completed: ${created} created, ${updated} updated`);
      queryClient.invalidateQueries({ queryKey: [activeTab] });
      queryClient.invalidateQueries({ queryKey: ['companyStats'] });
      queryClient.invalidateQueries({ queryKey: ['companies-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['branches-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['departments-dropdown'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message || 'Bulk upload failed');
    }
  });

  const downloadTemplate = async () => {
    try {
      const response = await api.get(`/${activeTab}/template`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${getSingularName(activeTab)}_bulk_upload_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  // Process form data before submission - converts empty strings to null for integer fields
  const getProcessedData = (): Record<string, unknown> | null => {
    let dataToSubmit: Record<string, unknown> = { code: formData.code, description: formData.description, status: formData.status };
    if (activeTab !== 'designations') dataToSubmit.name = formData.name;
    
    if (activeTab === 'companies') {
      dataToSubmit = { ...dataToSubmit, registrationNumber: formData.registrationNumber, taxId: formData.taxId, cin: formData.cin, panNo: formData.panNo, tanNo: formData.tanNo, gstNo: formData.gstNo, industry: formData.industry, companySize: formData.companySize, country: formData.country, address: formData.address, website: formData.website, email: formData.email, phone: formData.phone, logo: formData.logo };
    } else if (activeTab === 'branches') {
      // Convert empty strings to null for float fields (latitude, longitude, geofenceRadius)
      dataToSubmit = { ...dataToSubmit, location: formData.location || null, latitude: formData.latitude || null, longitude: formData.longitude || null, geofenceRadius: formData.geofenceRadius || null, companyId: formData.companyId || null };
    } else if (activeTab === 'departments') {
      // Convert empty strings to null for integer fields (managerId, companyId)
      dataToSubmit = { ...dataToSubmit, companyId: formData.companyId || null, managerId: formData.managerId || null };
    } else if (activeTab === 'designations') {
      dataToSubmit = { ...dataToSubmit, companyId: formData.companyId || null, title: formData.title, grade: formData.grade };
    }
    return dataToSubmit;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = getProcessedData();
    if (!dataToSubmit) return;
    
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: dataToSubmit });
    else createMutation.mutate(dataToSubmit);
  };

  const handleSave = () => {
    const dataToSubmit = getProcessedData();
    if (!dataToSubmit) return;
    
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: dataToSubmit });
    else createMutation.mutate(dataToSubmit);
  };

  const handleToggleStatus = async (item: EntityItem) => {
    try {
      const newStatus = item.status === 'active' ? 'inactive' : 'active';
      await updateMutation.mutateAsync({ id: item.id, data: { ...item, status: newStatus } });
      toast.success(`${newStatus === 'active' ? 'Operational' : 'Non-Operational'} successfully`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const isInitialLoading = !hasLoaded && isFetching;

  useEffect(() => {
    if (items.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [items, hasLoaded]);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header */}
        <PageHero
          title="Company Structure"
          subtitle="Manage companies, branches, departments and designations"
          icon={Building2}
          accent="indigo"
          breadcrumbs={['HRMS.Pro!', 'Company']}
          actions={
            <>
              <ExportButton
                rows={filteredItems}
                filename="company_structure_export"
                label="Export"
              />
              <button onClick={() => setShowBulkUpload(true)} title="Upload .csv file" className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <button onClick={() => {
                setEditingItem(null);
                setFormData({ ...INITIAL_FORM_DATA });
                setEmployeeSearch('');
                setEmployeeSearchResults([]);
                setShowEmployeeDropdown(false);
                setShowModal(true);
                setIsClosing(false);
              }} className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add New</span>
              </button>
            </>
          }
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0ms' }}>
            <StatsCard
              icon={Building2}
              label="Total Companies"
              value={statsData?.totalCompanies || 0}
              trend={statsData?.trendCompanies ?? 0}
              isLoading={isLoadingStats}
              iconBg="bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5"
              iconColor="text-[#3B82F6]"
              onClick={() => setActiveTab('companies')}
            />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '100ms' }}>
            <StatsCard
              icon={MapPin}
              label="Total Branches"
              value={statsData?.totalBranches || 0}
              trend={statsData?.trendBranches ?? 0}
              isLoading={isLoadingStats}
              iconBg="bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5"
              iconColor="text-[#10B981]"
              onClick={() => setActiveTab('branches')}
            />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '200ms' }}>
            <StatsCard
              icon={Briefcase}
              label="Total Departments"
              value={statsData?.totalDepartments || 0}
              trend={statsData?.trendDepartments ?? 0}
              isLoading={isLoadingStats}
              iconBg="bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5"
              iconColor="text-[#F59E0B]"
              onClick={() => setActiveTab('departments')}
            />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '300ms' }}>
            <StatsCard
              icon={Users}
              label="Total Designations"
              value={statsData?.totalDesignations || 0}
              trend={statsData?.trendDesignations ?? 0}
              isLoading={isLoadingStats}
              iconBg="bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5"
              iconColor="text-[#8B5CF6]"
              onClick={() => setActiveTab('designations')}
            />
          </div>
        </div>

        {/* TABS - Pill Style */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-[var(--primary-blue)] text-white shadow-md shadow-[#1C64F2]/20' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
                    {/* Filter Row */}
          <div className="p-4 border-b border-[var(--border-color)] bg-white">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {activeTab !== 'companies' && (
                  <SearchableSelect
                    options={[
                      { id: 'all', name: 'All Companies' },
                      ...(companies?.map((c: CompanyType) => ({ id: c.id, name: c.name })) || [])
                    ]}
                    value={companyFilter}
                    onChange={(val) => setCompanyFilter(val.toString())}
                    placeholder="All Companies"
                    className="w-40"
                  />
                )}
                <SearchableSelect
                  options={[
                    { id: 'all', name: 'All Status' },
                    ...statusArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))
                  ]}
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  placeholder="All Status"
                  className="w-32"
                />
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onDateChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  placeholder="Filter by Date"
                />
                {Boolean(searchTerm || companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCompanyFilter('all');
                    setBranchFilter('all');
                    setDepartmentFilter('all');
                    setStatusFilter('all');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors"
                  title="Clear Filters"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                )}
              </div>
            </div>
          </div>
                    {filteredItems.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No records found"
              description="Try adjusting your search or filters"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <DataTable
                  data={filteredItems}
                  rowKey={(item: EntityItem) => item.id}
                  searchable
                  searchKeys={(item: EntityItem) => `${item.name || ''} ${item.title || ''} ${item.code || ''} ${item.description || ''}`}
                  searchPlaceholder={`Search ${activeTab}...`}
                emptyMessage={`No ${activeTab} found`}
                logEntityType={activeTab === 'companies' ? 'company' : activeTab === 'branches' ? 'branch' : activeTab === 'departments' ? 'department' : 'designation'}
                logFor={(item: EntityItem) => ({ id: item.id, label: item.name || item.title || '' })}
                onEdit={(item) => handleEdit(item)}
                bulkActions={[
                  {
                    label: 'Activate',
                    icon: CheckCircle,
                    variant: 'success',
                    onAction: (items) => {
                      if (!items.length) return;
                      items.forEach((it: EntityItem) => updateMutation.mutate({ id: it.id, data: { ...it, status: 'active' } }));
                    },
                  },
                  {
                    label: 'Deactivate',
                    icon: XCircle, RotateCcw,
                    variant: 'amber',
                    onAction: (items) => {
                      if (!items.length) return;
                      items.forEach((it: EntityItem) => updateMutation.mutate({ id: it.id, data: { ...it, status: 'inactive' } }));
                    },
                  },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    variant: 'danger',
                    onAction: (items) => {
                      setBulkDeleteConfirmItems(items);
                    },
                  },
                ]}
                columns={[
                      {
                        key: 'name', header: activeTab === 'companies' ? 'Company Name' : activeTab === 'branches' ? 'Branch Name' : activeTab === 'departments' ? 'Department Name' : 'Designation Title', sortable: true,
                        render: (item: EntityItem) => {
                          const TabIcon = currentTab.icon;
                          return (
                            <div className="flex items-center gap-3 min-w-0">
                              {item.logo ? (
                                <img src={item.logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-[#F8FAFC] border border-[#E2E8F0] shrink-0" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                                  <TabIcon className="w-4 h-4 text-white" />
                                </div>
                              )}
                              <span className="font-medium text-[#0F172A] whitespace-nowrap truncate">
                                {activeTab === 'designations' ? item.title : item.name}
                                {activeTab === 'companies' && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1C64F2] text-[11px] font-semibold align-middle">ID: {item.id}</span>
                                )}
                              </span>
                            </div>
                          );
                        },
                        sortValue: (item: EntityItem) => (activeTab === 'designations' ? item.title : item.name) || '',
                      },
                    { key: 'code', header: 'Code', render: (item: EntityItem) => <span className="inline-flex px-2.5 py-1 bg-[#F1F5F9] text-[#64748B] text-sm font-medium rounded-lg whitespace-nowrap truncate max-w-[160px]">{item.code}</span> },
                    ...(activeTab === 'companies' ? [
                      { key: 'registrationNumber', header: 'Reg. No.', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.registrationNumber || '-'}</span> },
                      { key: 'taxId', header: 'GST/Tax ID', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.taxId || '-'}</span> },
                      { key: 'address', header: 'Address', render: (item: EntityItem) => <span className="text-sm text-[#64748B] truncate max-w-xs block">{item.address || '-'}</span> },
                    ] as DataTableColumn<EntityItem>[] : []),
                    ...(activeTab === 'branches' ? [
                      { key: 'companyId', header: 'Company', render: (item: EntityItem) => <span className="text-sm text-[#64748B] whitespace-nowrap truncate max-w-[200px] inline-block align-middle">{companies.find((c: CompanyType) => c.id === item.companyId)?.name || '-'}</span> },
                      { key: 'location', header: 'Address', render: (item: EntityItem) => <span className="text-sm text-[#64748B] whitespace-nowrap truncate max-w-[220px] inline-block align-middle">{item.location || '-'}</span> },
                      { key: 'latitude', header: 'Latitude', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.latitude || '-'}</span> },
                      { key: 'longitude', header: 'Longitude', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.longitude || '-'}</span> },
                      { key: 'geofenceRadius', header: 'Geofence (m)', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.geofenceRadius || '-'}</span> },
                    ] as DataTableColumn<EntityItem>[] : []),
                    ...(activeTab === 'departments' || activeTab === 'designations' ? [
                      { key: 'companyId', header: 'Company', render: (item: EntityItem) => <span className="text-sm text-[#64748B] whitespace-nowrap truncate max-w-[200px] inline-block align-middle">{companies.find((c: CompanyType) => c.id === item.companyId)?.name || '-'}</span> },
                    ] as DataTableColumn<EntityItem>[] : []),
                    ...(activeTab === 'departments' ? [
                      { key: 'managerName', header: 'Department Head', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.managerName || '-'}</span> },
                    ] as DataTableColumn<EntityItem>[] : []),
                    ...(activeTab === 'designations' ? [
                      { key: 'grade', header: 'Grade', render: (item: EntityItem) => <span className="text-sm text-[#64748B]">{item.grade || '-'}</span> },
                    ] as DataTableColumn<EntityItem>[] : []),
                    { key: 'description', header: 'Description', render: (item: EntityItem) => <span className="text-sm text-[#64748B] truncate max-w-xs block">{item.description || '-'}</span> },
                    {
                      key: 'status', header: activeTab === 'companies' ? 'Company Status' : activeTab === 'branches' ? 'Branch Status' : activeTab === 'departments' ? 'Department Status' : 'Designation Status', align: 'center',
                      render: (item: EntityItem) => <ToggleSwitch checked={item.status === 'active'} onChange={() => handleToggleStatus(item)} />,
                    },
                  ]}
                  actions={(item: EntityItem) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <Tooltip id={`edit-company-${item.id}`} content="Edit">
                        <button onClick={() => handleEdit(item)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      </Tooltip>
                      <Tooltip id={`delete-company-${item.id}`} content="Delete">
                        <button onClick={() => setDeleteTarget({ id: item.id, name: item.name || item.title || 'this item' })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </Tooltip>
                    </div>
                  )}
                />
              </div>
              </>
            )}
          </div>
        </div>

{/* Full Page Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={handleCloseDrawer}
          />
          <div
            className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2bb] flex items-center justify-center text-white shadow-sm">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                      {editingItem ? (
                        activeTab === 'companies' ? 'Edit Company' :
                        activeTab === 'branches' ? 'Edit Branch' :
                        activeTab === 'departments' ? 'Edit Department' : 'Edit Designation'
                      ) : (
                        activeTab === 'companies' ? 'Add Company' :
                        activeTab === 'branches' ? 'Add Branch' :
                        activeTab === 'departments' ? 'Add Department' : 'Add Designation'
                      )}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      {editingItem ? 'Update the record details' : 'Fill in the details to create a new record'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                  </button>
                  <button
                    onClick={handleCloseDrawer}
                    className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

{/* Help Text */}
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-4 h-4 inline mr-1" />
                  {activeTab === 'companies'
                    ? 'All fields on one page. TAN & PAN are required to issue Form 16 — fill them from the employer\u2019s TRACES registration.'
                    : activeTab === 'branches'
                      ? 'All fields on one page. Fill in the branch details and click Create/Update to save.'
                      : 'All fields on one page. Fill in the details below and click Create/Update to save.'}
                </p>
              </div>

              {/* Scrollable Form Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form onSubmit={handleSubmit} className={formGridClass}>
                  
                  {/* COMPANY TABS */}
                  {activeTab === 'companies' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={formInputClass}
                          placeholder="Enter company name"
                        />
                        <p className="mt-1 text-xs text-gray-400">Legal or registered company name</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                        <input
                          type="text"
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          className={formInputClass}
                          placeholder="Enter code (e.g., CMP001)"
                        />
                        <p className="mt-1 text-xs text-gray-400">Unique company code, e.g. CMP001</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <SearchableSelect
                          value={formData.status || ''}
                          onChange={(val) => setFormData({ ...formData, status: val.toString() })}
                          options={statusArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))}
                          placeholder="Select status"
                          showAllOption={false}
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400">Whether company is operational/non-operational</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <div className={formReadonlyClass}>
                          {orgCountry || 'India'}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">Country is set globally in Settings → General. It controls payroll, tax &amp; compliance.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                        <SearchableSelect
                          value={formData.industry || ''}
                          onChange={(val) => setFormData({ ...formData, industry: val.toString() })}
                          options={industryArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))}
                          placeholder="Select industry"
                          showAllOption={false}
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400">Primary industry sector</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                        <SearchableSelect
                          value={formData.companySize || ''}
                          onChange={(val) => setFormData({ ...formData, companySize: val.toString() })}
                          options={companySizeArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))}
                          placeholder="Select company size"
                          showAllOption={false}
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400">Employee count range</p>
                      </div>

                      {isCompanyIndia && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GST No.</label>
                        <input
                          type="text"
                          value={formData.gstNo}
                          onChange={(e) => setFormData({ ...formData, gstNo: e.target.value.toUpperCase() })}
                          className={formInputClass}
                          placeholder="e.g., 27AAACM1234F1Z5"
                        />
                        <p className="mt-1 text-xs text-gray-400">Goods &amp; Services Tax number of this legal entity</p>
                      </div>
                      )}
                      {isCompanyIndia && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">PAN No.</label>
                        <input
                          type="text"
                          value={formData.panNo}
                          onChange={(e) => setFormData({ ...formData, panNo: e.target.value.toUpperCase() })}
                          className={formInputClass}
                          placeholder="e.g., AAACM1234F"
                        />
                        <p className="mt-1 text-xs text-gray-400">Permanent Account Number of this legal entity (used on Form 16)</p>
                      </div>
                      )}
                      {isCompanyIndia && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">TAN No.</label>
                        <input
                          type="text"
                          value={formData.tanNo}
                          onChange={(e) => setFormData({ ...formData, tanNo: e.target.value.toUpperCase() })}
                          className={formInputClass}
                          placeholder="e.g., BLRZ12345A"
                        />
                        <p className="mt-1 text-xs text-gray-400">Tax Deduction Account Number - required to file TDS (Form 24Q) &amp; issue Form 16</p>
                      </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                        <input
                          type="text"
                          value={formData.registrationNumber}
                          onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                          className={formInputClass}
                          placeholder="Enter registration number"
                        />
                        <p className="mt-1 text-xs text-gray-400">Company registration / CIN number</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CIN</label>
                        <input
                          type="text"
                          value={formData.cin}
                          onChange={(e) => setFormData({ ...formData, cin: e.target.value.toUpperCase() })}
                          className={formInputClass}
                          placeholder="e.g., U72200KA2020PTC123456"
                        />
                        <p className="mt-1 text-xs text-gray-400">Corporate Identification Number (CIN)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                        <input
                          type="text"
                          value={formData.taxId}
                          onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                          className={formInputClass}
                          placeholder="Enter tax ID"
                        />
                        <p className="mt-1 text-xs text-gray-400">Tax identification number</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <PhoneInput
                          value={String(formData.phone || '')}
                          onChange={(v) => setFormData({ ...formData, phone: v })}
                          defaultDial={dialCode}
                          placeholder="Phone number"
                          inputClassName="w-full px-4 py-2.5 border border-gray-200 rounded-r-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                        <p className="mt-1 text-xs text-gray-400">Contact phone number</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className={formInputClass}
                          placeholder="company@example.com"
                        />
                        <p className="mt-1 text-xs text-gray-400">Official contact email</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                        <input
                          type="url"
                          value={formData.website}
                          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                          className={formInputClass}
                          placeholder="https://example.com"
                        />
                        <p className="mt-1 text-xs text-gray-400">Company website URL</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className={formTextareaClass}
                          placeholder="Enter company address"
                        />
                        <p className="mt-1 text-xs text-gray-400">Registered office address</p>
                      </div>
                      <FormField label="State" help="State where the company is registered">
                        <StateSelect value={formData.state || ''} onChange={(v) => setFormData({ ...formData, state: v })} />
                      </FormField>
                      <FormField label="Pincode" help="6-digit postal pincode">
                        <PincodeInput value={formData.pincode || ''} onChange={(v) => setFormData({ ...formData, pincode: v })} />
                      </FormField>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className={formTextareaClass}
                          placeholder="Enter company description"
                        />
                        <p className="mt-1 text-xs text-gray-400">Short description of the company</p>
                      </div>
                      <FormField label="Logo" help="JPG, PNG, WebP (recommended square)">
                        <CompactImageUpload
                          value={formData.logo || ''}
                          onChange={(url) => setFormData({ ...formData, logo: url })}
                          onClear={() => {
                            if (logoInputRef.current) logoInputRef.current.value = '';
                          }}
                        />
                      </FormField>
                    </>
                  )}

                  {/* BRANCH */}
                  {activeTab === 'branches' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                        <SearchableSelect
                          value={formData.companyId || ''}
                          onChange={(val) => setFormData({ ...formData, companyId: val })}
                          options={companies.map((company: CompanyType) => ({ id: company.id, name: company.name }))}
                          placeholder="Select company"
                          showAllOption={false}
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400">Parent company for this branch</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={formInputClass}
                          placeholder="Enter branch name"
                        />
                        <p className="mt-1 text-xs text-gray-400">Name of the branch</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                        <input
                          type="text"
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          className={formInputClass}
                          placeholder="Enter code (e.g., BR001)"
                        />
                        <p className="mt-1 text-xs text-gray-400">Unique branch code, e.g. BR001</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formData.latitude}
                          onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                          className={formInputClass}
                          placeholder="e.g., 22.5726"
                        />
                        <p className="mt-1 text-xs text-gray-400">Latitude coordinate, e.g. 22.5726</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formData.longitude}
                          onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                          className={formInputClass}
                          placeholder="e.g., 88.3639"
                        />
                        <p className="mt-1 text-xs text-gray-400">Longitude coordinate, e.g. 88.3639</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Geofence Radius (meters)</label>
                        <input
                          type="number"
                          value={formData.geofenceRadius}
                          onChange={(e) => setFormData({ ...formData, geofenceRadius: parseInt(e.target.value) || 100 })}
                          className={formInputClass}
                          placeholder="Default: 100m"
                        />
                        <p className="mt-1 text-xs text-gray-400">Radius in meters, default 100</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <SearchableSelect
                          value={formData.status || ''}
                          onChange={(val) => setFormData({ ...formData, status: val.toString() })}
                          options={statusArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))}
                          placeholder="Select status"
                          showAllOption={false}
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400">Whether branch is operational/non-operational</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location / Address</label>
                        <textarea
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          className={formTextareaClass}
                          placeholder="Enter branch location / address"
                        />
                        <p className="mt-1 text-xs text-gray-400">Office location / city address</p>
                      </div>
                      <FormField label="State" help="State where the branch is located">
                        <StateSelect value={formData.state || ''} onChange={(v) => setFormData({ ...formData, state: v })} />
                      </FormField>
                      <FormField label="Pincode" help="6-digit postal pincode">
                        <PincodeInput value={formData.pincode || ''} onChange={(v) => setFormData({ ...formData, pincode: v })} />
                      </FormField>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className={formTextareaClass}
                          placeholder="Enter branch description"
                        />
                        <p className="mt-1 text-xs text-gray-400">Short description of the branch</p>
                      </div>
                    </>
                  )}

                  {/* DEPARTMENT TABS */}
                  {activeTab === 'departments' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                        <SearchableSelect
                          value={formData.companyId || ''}
                          onChange={(val) => setFormData({ ...formData, companyId: val })}
                          options={companies.map((company: CompanyType) => ({ id: company.id, name: company.name }))}
                          placeholder="Select company"
                          showAllOption={false}
                          className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Parent company for this department</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
                            <input
                              type="text"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              className={formInputClass}
                              placeholder="Enter department name"
                            />
                            <p className="mt-1 text-xs text-gray-400">Name of the department</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                            <input
                              type="text"
                              value={formData.code}
                              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                              className={formInputClass}
                              placeholder="Enter code (e.g., DEPT001)"
                            />
                            <p className="mt-1 text-xs text-gray-400">Unique department code, e.g. DEPT001</p>
                          </div>
                          <div className="relative">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department Head</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={employeeSearch}
                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                onFocus={() => employeeSearch.length >= 2 && setShowEmployeeDropdown(true)}
                                placeholder="Search by name or code..."
                                readOnly={!!formData.managerId}
                                className={`flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${formData.managerId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              />
                              {formData.managerId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, managerId: '' });
                                    setEmployeeSearch('');
                                  }}
                                  className="px-3 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors"
                                >
                                  Change
                                </button>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-400">Search and select the department head</p>
                            {showEmployeeDropdown && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                {isSearchingEmployees ? (
                                  <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
                                ) : employeeSearchResults.length > 0 ? (
                                  employeeSearchResults.map((employee: EmployeeListItem) => (
                                    <div
                                      key={employee.id}
                                      onClick={() => handleEmployeeSelect(employee)}
                                      className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-sm"
                                    >
                                      <div className="font-medium text-gray-900">{personDisplayName(employee)}</div>
                                      <div className="text-xs text-gray-500">{employee.employeeCode || 'No code'}</div>
                                    </div>
                                  ))
                                ) : employeeSearch.length >= 2 && !formData.managerId ? (
                                  <div className="px-4 py-3 text-sm text-gray-500">No employees found</div>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <SearchableSelect
                              value={formData.status || ''}
                              onChange={(val) => setFormData({ ...formData, status: val.toString() })}
                              options={statusArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))}
                              placeholder="Select status"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Whether department is operational/non-operational</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              className={formTextareaClass}
                              placeholder="Enter department description"
                            />
                            <p className="mt-1 text-xs text-gray-400">Short description of the department</p>
                          </div>
                    </>
                  )}

                  {/* DESIGNATION TABS */}
                  {activeTab === 'designations' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                            <SearchableSelect
                              value={formData.companyId || ''}
                              onChange={(val) => setFormData({ ...formData, companyId: val })}
                              options={companies.map((company: CompanyType) => ({ id: company.id, name: company.name }))}
                              placeholder="Select company"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Company this designation belongs to</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                            <input
                              type="text"
                              value={formData.title || ''}
                              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                              className={formInputClass}
                              placeholder="e.g., Software Engineer"
                            />
                            <p className="mt-1 text-xs text-gray-400">Job title, e.g. Software Engineer</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                            <input
                              type="text"
                              value={formData.code}
                              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                              className={formInputClass}
                              placeholder="Enter code (e.g., DESG001)"
                            />
                            <p className="mt-1 text-xs text-gray-400">Unique designation code, e.g. DESG001</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                            <SearchableSelect
                              value={formData.grade || ''}
                              onChange={(val) => setFormData({ ...formData, grade: val.toString() })}
                              options={gradeValues.map((g: GradeOption) => ({ id: g.name as string, name: g.name }))}
                              placeholder="Select grade"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Pay grade for this designation</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <SearchableSelect
                              value={formData.status || ''}
                              onChange={(val) => setFormData({ ...formData, status: val.toString() })}
                              options={statusArray.map((opt: StatusOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) }))}
                              placeholder="Select status"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Whether designation is operational/non-operational</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              className={formTextareaClass}
                              placeholder="Enter designation description"
                            />
                            <p className="mt-1 text-xs text-gray-400">Short description of the role</p>
                          </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        title={`Bulk Upload ${currentTab.label}`}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Instructions:</strong>
              <br />1. Download the template first
              <br />2. Fill in your data in the CSV/Excel file
              {currentTab.id !== 'companies' && <><br />3. Use the Company ID shown in the Company table for the <code>company_id</code> column</>}
              <br />{currentTab.id === 'companies' ? 3 : 4}. Upload the filled file
              <br />{currentTab.id === 'companies' ? 4 : 5}. Existing items will be updated, new items will be created
              <br />
              <strong>Required columns:</strong>
              {currentTab.id === 'companies' && ' company_name, code, status'}
              {currentTab.id === 'branches' && ' branch_name, code, company_id, status'}
              {currentTab.id === 'departments' && ' department_name, code, company_id, status'}
              {currentTab.id === 'designations' && ' designation_title, code, grade, company_id, status'}
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl hover:bg-[#059669] transition-all duration-200"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV or Excel File</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className={formInputClass}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowBulkUpload(false)}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => uploadFile && bulkUploadMutation.mutate(uploadFile)}
              disabled={!uploadFile || bulkUploadMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
            >
              {bulkUploadMutation.isPending ? (
                null
              ) : (
                'Upload'
              )}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        itemName={deleteTarget?.name || `this ${getSingularName(activeTab)}`}
        isDeleting={deleteMutation.isPending}
      />
      <ConfirmActionModal
        isOpen={!!bulkDeleteConfirmItems}
        title={`Delete ${bulkDeleteConfirmItems?.length || 0} ${getSingularName(activeTab)}(s)?`}
        message={`You are about to delete ${bulkDeleteConfirmItems?.length || 0} selected ${getSingularName(activeTab).toLowerCase()}(s).`}
        consequence="This action cannot be undone. All data associated with these items will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (bulkDeleteConfirmItems) {
            bulkDeleteConfirmItems.forEach((it: EntityItem) => deleteMutation.mutate(it.id));
            setBulkDeleteConfirmItems(null);
          }
        }}
        onCancel={() => setBulkDeleteConfirmItems(null)}
      />
    </div>
  );
};

export default Company;

