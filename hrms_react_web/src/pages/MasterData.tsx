import { useState, useEffect } from 'react';
import {
  Database, Plus, Edit2, X, Search, CheckCircle2,
  Users, Building2, Calendar, Clock, Receipt, Briefcase, Heart, Droplet, GraduationCap,
  Tag, Settings, Filter, TrendingUp, Star, Info,
  Loader2, Sun, CloudRain, CloudLightning, CloudFog, CloudSun, Cloud, RefreshCw,
  Download, Upload, Globe, DollarSign, CalendarDays, CalendarRange, CalendarCheck, BarChart3,
  UserCheck, Laptop, Activity, Coins, Percent, Building, CreditCard, LogOut, Lock, AlertTriangle, Trash2, GripVertical, ChevronUp, ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useMasterData } from '../hooks/useMasterData';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmActionModal from '../components/ConfirmActionModal';
import toast from 'react-hot-toast';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import PageSkeleton from '../components/skeleton/PageSkeleton';

// =============================================================================
// TYPES
// =============================================================================

interface MasterDataCategory {
  id: number;
  code?: string;
  name: string;
  icon?: string;
  values_count?: number;
  is_system?: boolean;
}

interface MasterDataValue {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  sort_order?: number;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

interface MasterDataCategoryWithValues extends MasterDataCategory {
  values: MasterDataValue[];
  is_system?: boolean;
}

type GroupedCategories = Record<string, { categories: MasterDataCategory[] }>;

// =============================================================================
// SUB-COMPONENTS: Real-time Clock, Date & Weather
// =============================================================================

const iconMap: Record<string, LucideIcon> = {
  'Users': Users,
  'Building2': Building2,
  'Calendar': Calendar,
  'Clock': Clock,
  'Receipt': Receipt,
  'Briefcase': Briefcase,
  'Heart': Heart,
  'Droplet': Droplet,
  'GraduationCap': GraduationCap,
  'Tag': Tag,
  'Settings': Settings,
  'Database': Database,
  'Globe': Globe,
  'DollarSign': DollarSign,
  'CalendarDays': CalendarDays,
  'CalendarRange': CalendarRange,
  'CalendarCheck': CalendarCheck,
  'BarChart3': BarChart3,
  'RefreshCw': RefreshCw,
  'Star': Star,
  'TrendingUp': TrendingUp,
  'UserCheck': UserCheck,
  'Laptop': Laptop,
  'Activity': Activity,
  'Coins': Coins,
  'Percent': Percent,
  'Building': Building,
  'CreditCard': CreditCard,
  'Info': Info,
  'Sun': Sun
};

const pageTabs = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'employee', label: 'Employees', icon: Users },
  { key: 'recruitment', label: 'Recruitment', icon: Briefcase },
  { key: 'holiday', label: 'Holidays', icon: Sun },
  { key: 'attendance', label: 'Attendance', icon: Clock },
  { key: 'leave', label: 'Leaves', icon: Calendar },
  { key: 'payroll', label: 'Payroll', icon: TrendingUp },
  { key: 'anomaly', label: 'Anomalies', icon: AlertTriangle },
  { key: 'expense', label: 'Expenses', icon: Receipt },
  { key: 'exit', label: 'Exits', icon: LogOut },
  { key: 'asset', label: 'Assets', icon: Laptop },
  { key: 'performance', label: 'Performance', icon: Star },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const MasterData = () => {
  const queryClient = useQueryClient();
  const [activePage, setActivePage] = useState(() => pageTabs[0].key);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showValueModal, setShowValueModal] = useState(false);
  const [editingValue, setEditingValue] = useState<MasterDataValue | null>(null);
  const [confirm, setConfirm] = useState<{
    action: 'add' | 'edit' | 'delete' | 'toggle';
    value: MasterDataValue | null;
    message: string;
    consequence: string;
    pending?: boolean;
  } | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [valueForm, setValueForm] = useState({ code: '', name: '', description: '', is_active: true, sort_order: 0 });
  const { data: statusValues = [] } = useMasterData('ORG_STATUS');

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowValueModal(false);
      setIsClosing(false);
      setEditingValue(null);
      setValueForm({ code: '', name: '', description: '', is_active: true, sort_order: 0 });
    }, 300);
  };

  // Fetch categories grouped by page
  const { data: groupedCategories = {}, isLoading: loadingCategories, isFetching } = useQuery<GroupedCategories, Error>({
    queryKey: ['master-data-categories'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/master-data/categories/grouped');
        return response.data || {};
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
  });

  // Fetch values for selected category
  const { data: categoryWithValues = null, isLoading: loadingValues } = useQuery<MasterDataCategoryWithValues | null, Error>({
    queryKey: ['master-data-category', activeCategory],
    queryFn: async () => {
      if (!activeCategory) return null;
      try {
        const response = await api.get(`/api/master-data/categories/${activeCategory}`);
        return response.data || null;
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!activeCategory,
  });

  // Set first category as active on load or when page changes
  useEffect(() => {
    if (groupedCategories && Object.keys(groupedCategories).length > 0) {
      const pageCategories = groupedCategories[activePage]?.categories || [];
      if (pageCategories.length > 0) {
        setActiveCategory(pageCategories[0].id);
      }
    }
  }, [groupedCategories, activePage]);

  // Value mutations
  const addValueMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post(`/api/master-data/categories/${activeCategory}/values`, payload),
    meta: { disableGlobalToast: true },
    onSuccess: () => {
      toast.success('Value added successfully');
      queryClient.invalidateQueries({ queryKey: ['master-data-category'] });
      queryClient.invalidateQueries({ queryKey: ['master-data-categories'] });
      queryClient.invalidateQueries({ queryKey: ['master-data'] });
      setShowValueModal(false);
      setValueForm({ code: '', name: '', description: '', is_active: true, sort_order: 0 });
    },
    onError: () => toast.error('Failed to add value')
  });

  const updateValueMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => api.patch(`/api/master-data/values/${id}`, payload),
    meta: { disableGlobalToast: true },
    onSuccess: () => {
      toast.success('Value updated successfully');
      queryClient.invalidateQueries({ queryKey: ['master-data-category'] });
      queryClient.invalidateQueries({ queryKey: ['master-data-categories'] });
      queryClient.invalidateQueries({ queryKey: ['master-data'] });
      setShowValueModal(false);
      setEditingValue(null);
      setValueForm({ code: '', name: '', description: '', is_active: true, sort_order: 0 });
    },
    onError: () => toast.error('Failed to update value')
  });

  const toggleValueStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => 
      api.patch(`/api/master-data/values/${id}`, { is_active }),
    meta: { disableGlobalToast: true },
    onSuccess: (_, variables) => {
      toast.success(variables.is_active ? 'Value made Operational' : 'Value made Non-Operational');
      queryClient.invalidateQueries({ queryKey: ['master-data-category'] });
      queryClient.invalidateQueries({ queryKey: ['master-data-categories'] });
      queryClient.invalidateQueries({ queryKey: ['master-data'] });
    },
    onError: () => {
      toast.error('Failed to update value status');
    }
  });

  const deleteValueMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/master-data/values/${id}`),
    onSuccess: () => {
      toast.success('Value deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['master-data-category'] });
      queryClient.invalidateQueries({ queryKey: ['master-data-categories'] });
      queryClient.invalidateQueries({ queryKey: ['master-data'] });
    },
    onError: () => {
      toast.error('Failed to delete value');
    }
  });

  const reorderValuesMutation = useMutation({
    mutationFn: async (orderedIds: number[]) =>
      api.post('/api/master-data/values/reorder', {
        category_id: activeCategory,
        ordered_ids: orderedIds,
      }),
    meta: { disableGlobalToast: true },
    onSuccess: () => {
      toast.success('Order updated successfully');
      queryClient.invalidateQueries({ queryKey: ['master-data-category'] });
      queryClient.invalidateQueries({ queryKey: ['master-data-categories'] });
      queryClient.invalidateQueries({ queryKey: ['master-data'] });
    },
    onError: () => {
      toast.error('Failed to update order');
    }
  });

  // Drag & drop reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    const reordered = [...filteredValues];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    if (activeCategory) {
      reorderValuesMutation.mutate(reordered.map((v) => v.id));
    }
  };

  const moveValue = (value: MasterDataValue, direction: 'up' | 'down') => {
    const idx = filteredValues.findIndex((v) => v.id === value.id);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || target < 0 || target >= filteredValues.length) return;
    const reordered = [...filteredValues];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    if (activeCategory) {
      reorderValuesMutation.mutate(reordered.map((v) => v.id));
    }
  };

  const handleDeleteValue = (value: MasterDataValue) => {
    setConfirm({
      action: 'delete',
      value,
      message: `You are about to delete "${value.name}". This value will be removed permanently from all dropdowns across the app.`,
      consequence: 'This action CANNOT be undone. Any record currently using this value will lose it.',
    });
  };

  const activeCategoryMeta = (groupedCategories[activePage]?.categories || []).find(
    (cat: MasterDataCategory) => cat.id === activeCategory
  );
  const isSystemCategory = Boolean(categoryWithValues?.is_system ?? activeCategoryMeta?.is_system);

  const handleSubmitValue = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = isSystemCategory && editingValue
      ? { name: valueForm.name }
      : {
          code: valueForm.code,
          name: valueForm.name,
          description: valueForm.description,
          is_active: valueForm.is_active,
          sort_order: valueForm.sort_order,
        };
    const name = valueForm.name?.trim() || valueForm.code?.trim() || 'value';
    setConfirm({
      action: editingValue ? 'edit' : 'add',
      value: editingValue,
      message: editingValue
        ? `You are about to update "${editingValue.name}" to "${name}".`
        : `You are about to add a new value "${name}".`,
      consequence: editingValue
        ? 'The change will be applied everywhere this value is used in dropdowns.'
        : 'The new value will appear immediately in all dropdowns across the app.',
    });
    setPendingPayload(payload);
  };

  const handleConfirmCommit = () => {
    if (!confirm) return;
    setConfirm({ ...confirm, pending: true });
    if (confirm.action === 'delete' && confirm.value) {
      deleteValueMutation.mutate(confirm.value.id);
      setConfirm(null);
    } else if (confirm.action === 'toggle' && confirm.value) {
      const newStatus = confirm.value.is_active === false ? true : false;
      toggleValueStatusMutation.mutate({ id: confirm.value.id, is_active: newStatus });
      setConfirm(null);
    } else if ((confirm.action === 'add' || confirm.action === 'edit') && pendingPayload) {
      if (editingValue) {
        updateValueMutation.mutate({ id: editingValue.id, payload: pendingPayload });
      } else {
        addValueMutation.mutate(pendingPayload);
      }
      setConfirm(null);
      setPendingPayload(null);
    } else {
      setConfirm(null);
    }
  };

  const handleEditValue = (value: MasterDataValue) => {
    setEditingValue(value);
    setValueForm({ 
      code: value.code, 
      name: value.name, 
      description: value.description || '', 
      is_active: value.is_active !== false,
      sort_order: value.sort_order || 0
    });
    setShowValueModal(true);
  };

  const handleToggleValueStatus = (value: MasterDataValue) => {
    const newStatus = value.is_active === false ? true : false;
    setConfirm({
      action: 'toggle',
      value,
      message: `You are about to make "${value.name}" ${newStatus ? 'Operational' : 'Non-Operational'}.`,
      consequence: newStatus
        ? 'This value will start appearing again in all dropdowns across the app.'
        : 'This value will be hidden from all dropdowns across the app. Records already using it will keep their current value.',
    });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.post('/api/master-data/import', data);
      toast.success('Master data imported successfully');
      queryClient.invalidateQueries({ queryKey: ['master-data-categories'] });
      queryClient.invalidateQueries({ queryKey: ['master-data-category'] });
      queryClient.invalidateQueries({ queryKey: ['master-data'] });
    } catch (error) {
      toast.error('Failed to import master data');
    }
    event.target.value = '';
  };

  const values = categoryWithValues?.values || [];
  const uniqueValues = Array.from(new Map(values.map((v: MasterDataValue) => [v.id, v] as const)).values());
  const filteredValues = uniqueValues.filter((v: MasterDataValue) =>
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.code?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a: MasterDataValue, b: MasterDataValue) => {
    const aIsActive = a.is_active !== false;
    const bIsActive = b.is_active !== false;
    if (aIsActive === bIsActive) return 0;
    return aIsActive ? -1 : 1;
  });

  // Stats for current page
  const pageCategories = groupedCategories[activePage]?.categories || [];
  const totalCategories = pageCategories.length;
  const totalValues = pageCategories.reduce((acc: number, cat: MasterDataCategory) => acc + (cat.values_count || 0), 0);
  const activeValues = uniqueValues.filter((v: MasterDataValue) => v.is_active !== false).length;
  const inactiveValues = uniqueValues.filter((v: MasterDataValue) => v.is_active === false).length;

  const stats = [
    { label: 'Total Values', value: totalValues, icon: Database, iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5', iconColor: 'text-[var(--primary-blue)]', onClick: () => setActiveCategory(null) },
    { label: 'Active', value: activeValues, icon: CheckCircle2, iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5', iconColor: 'text-[#059669]', onClick: () => setActiveCategory(null) },
    { label: 'Inactive', value: inactiveValues, icon: X, iconBg: 'bg-gradient-to-br from-[#EF4444]/20 via-[#F87171]/10 to-[#FCA5A5]/5', iconColor: 'text-[#DC2626]', onClick: () => setActiveCategory(null) },
    { label: 'Categories', value: totalCategories, icon: Tag, iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5', iconColor: 'text-[#7C3AED]', onClick: () => setActiveCategory(null) },
  ];

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (Object.keys(groupedCategories).length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [groupedCategories, hasLoaded]);

  if (!hasLoaded && isFetching) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header Section */}
        <PageHero
          title="Master Data"
          subtitle="Manage lookup values, reference data"
          icon={Database}
          accent="purple"
          breadcrumbs={['HRMS.Pro!', 'Master Data']}
          actions={
            <>
              <ExportButton
                rows={filteredValues}
                filename="master_data_export"
                label="Export"
              />
              <button
                onClick={() => document.getElementById('file-upload')?.click()} title="Upload .csv file"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <input
                id="file-upload"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
              {!isSystemCategory && (
                <button
                  onClick={() => {
                    setShowValueModal(true);
                    setEditingValue(null);
                    setValueForm({ code: '', name: '', description: '', is_active: true, sort_order: 0 });
                  }}
                  title="Add Value"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  Add Value
                </button>
              )}
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => (
            <div key={stat.label} className="transition-all duration-300" style={{ transitionDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} iconBg={stat.iconBg} iconColor={stat.iconColor} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* TABS - Pill Style like Company Page */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {pageTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActivePage(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                    activePage === tab.key
                      ? 'bg-[var(--primary-blue)] text-white shadow-md'
                      : 'bg-[var(--background)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* CATEGORY SIDEBAR */}
          <div className="bg-white rounded-xl border border-[var(--border-color)] p-4 h-fit">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Categories</h3>
            </div>
            <div className="space-y-2">
              {Array.from(new Map((groupedCategories[activePage]?.categories || []).map((cat: MasterDataCategory) => [cat.name, cat] as const)).values()).map((cat: MasterDataCategory) => {
                const Icon = iconMap[cat.icon || ''] || Database;
                return (
                  <div
                    key={cat.id}
                    className="group"
                  >
                    <button
                      onClick={() => setActiveCategory(cat.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeCategory === cat.id
                          ? 'bg-[var(--primary-blue)] text-white'
                          : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1 text-left">{cat.name}</span>
                      <span className="text-xs opacity-60">{cat.values_count || 0}</span>
                    </button>
                    <div className="flex items-center justify-end gap-1 px-3 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    </div>
                  </div>
                );
              })}
              {(groupedCategories[activePage]?.categories || []).length === 0 && (
                <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                  No categories in this page
                </div>
              )}
            </div>
          </div>

          {/* VALUES TABLE */}
          <div className="lg:col-span-3 space-y-4">
            {/* TABLE */}
            <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
              {/* FILTERS */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    placeholder={`Search values...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-xl text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
              </div>

              {isSystemCategory && (
                <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <Lock className="w-4 h-4 text-[#94A3B8] shrink-0" />
                  <p className="text-sm text-[#64748B]">
                    System values — you can only rename labels or change the order. Codes, status, and add/delete are fixed.
                  </p>
                </div>
              )}
              {loadingValues ? (
                null
              ) : (
                <div className="overflow-x-auto">
                  <DataTable
                    data={filteredValues}
                    rowKey={(value: MasterDataValue, index) => `${value.id}-${index}`}
                    searchable
                    searchKeys={(value: MasterDataValue) => `${value.code} ${value.name} ${value.description || ''}`}
                    searchPlaceholder="Search values..."
                    emptyMessage="No values found in this category"
                    logEntityType="lookup_value"
                    logFor={(value: MasterDataValue) => ({ id: value.id, label: value.name })}
                    columns={[
                      {
                        key: 'drag', header: '', align: 'center', width: '44px',
                        render: (value: MasterDataValue) => (
                          <div
                            draggable
                            onDragStart={() => handleDragStart(filteredValues.findIndex((v) => v.id === value.id))}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(filteredValues.findIndex((v) => v.id === value.id))}
                            className="flex items-center justify-center cursor-grab active:cursor-grabbing"
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4 text-[#94A3B8]" />
                          </div>
                        ),
                      },
                      {
                        key: 'code', header: 'Code', sortable: true,
                        render: (value: MasterDataValue) => (
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shrink-0">
                              <Tag className="w-4 h-4 text-white" />
                            </div>
                            <div className="font-semibold text-[#0F172A] text-sm">{value.code}</div>
                          </div>
                        ),
                        sortValue: (value: MasterDataValue) => value.code,
                      },
                      { key: 'name', header: 'Name', sortable: true, render: (value: MasterDataValue) => <span className="text-sm text-[#334155]">{value.name}</span>, sortValue: (value: MasterDataValue) => value.name },
                      { key: 'description', header: 'Description', render: (value: MasterDataValue) => <span className="text-sm text-[#64748B]">{value.description || '-'}</span> },
                      {
                        key: 'status', header: 'Status', align: 'center',
                        render: (value: MasterDataValue) => (
                          <div className="flex items-center justify-center">
                            {isSystemCategory ? (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${value.is_active !== false ? 'bg-[#D1FAE5] text-[#047857]' : 'bg-[#FEE2E2] text-[#C81E1E]'}`}>
                                {value.is_active !== false ? 'Operational' : 'Non-Operational'}
                              </span>
                            ) : (
                              <ToggleSwitch checked={value.is_active !== false} onChange={() => handleToggleValueStatus(value)} />
                            )}
                          </div>
                        ),
                      },
                    ]}
                    actions={(value: MasterDataValue) => (
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="flex flex-col gap-0.5 mr-1">
                          <button onClick={() => moveValue(value, 'up')} className="p-1 text-[#64748B] hover:text-[#1C64F2] hover:bg-[#EFF6FF] rounded transition-colors" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveValue(value, 'down')} className="p-1 text-[#64748B] hover:text-[#1C64F2] hover:bg-[#EFF6FF] rounded transition-colors" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
                        </div>
                        <button
                          onClick={() => handleEditValue(value)}
                          className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                          title={isSystemCategory ? 'Rename' : 'Edit'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!isSystemCategory && (
                          <button onClick={() => handleDeleteValue(value)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ADD/EDIT VALUE MODAL */}
      {showValueModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div
            className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={handleCloseDrawer}
          />
          <div
            className={`relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl transform transition-all duration-300 ease-in-out flex flex-col ${
              isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2bb] flex items-center justify-center text-white shadow-sm">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                    {isSystemCategory && editingValue ? 'Rename Value' : editingValue ? 'Edit Value' : 'Add Value'}
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    {isSystemCategory && editingValue
                      ? 'Change the display label shown in dropdowns'
                      : editingValue
                        ? 'Update existing reference data'
                        : 'Add new reference data to this category'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCloseDrawer}
                  className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="valueForm"
                  disabled={addValueMutation.isPending || updateValueMutation.isPending}
                  className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                >
                  {(addValueMutation.isPending || updateValueMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {(addValueMutation.isPending || updateValueMutation.isPending) ? 'Saving...' : (editingValue ? 'Update' : 'Add')}
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
                <Info className="w-3.5 h-3.5 inline mr-1" />
                {isSystemCategory && editingValue
                  ? 'System values — you can only rename labels or change the order. Code and status cannot be changed.'
                  : `You are ${editingValue ? 'updating an existing item' : 'adding a new item'} inside the currently selected category. Modifying categories from here is restricted for consistency.`}
              </p>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <form id="valueForm" onSubmit={handleSubmitValue} className="space-y-4 max-w-4xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Page</label>
                      <select
                        value={activePage}
                        onChange={(e) => setActivePage(e.target.value)}
                        className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2] bg-gray-50 cursor-not-allowed opacity-70"
                        disabled={true}
                      >
                        <option value="">Select a page...</option>
                        {pageTabs.map((tab) => (
                          <option key={tab.key} value={tab.key}>{tab.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Category <span className="text-xs text-gray-500 font-normal ml-1">(Type of reference data)</span></label>
                      <select
                        value={activeCategory || ''}
                        onChange={(e) => setActiveCategory(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2] bg-gray-50 cursor-not-allowed opacity-70"
                        disabled={true}
                      >
                        {(groupedCategories[activePage]?.categories || []).map((cat: MasterDataCategory) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={`grid ${isSystemCategory && editingValue ? 'grid-cols-1' : 'grid-cols-2'} gap-4 ${!activePage || !activeCategory ? 'opacity-50 pointer-events-none' : ''}`}>
                    {!(isSystemCategory && editingValue) && (
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Code <span className="text-xs text-gray-500 font-normal ml-1">(Must be unique)</span></label>
                        <input
                          className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                          value={valueForm.code}
                          onChange={e => setValueForm({ ...valueForm, code: e.target.value })}
                          placeholder="e.g. DESG-001"
                        />
                      </div>
                    )}
                    {isSystemCategory && editingValue && (
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Code</label>
                        <input
                          className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg bg-gray-50 text-[var(--text-tertiary)] cursor-not-allowed"
                          value={valueForm.code}
                          readOnly
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Name</label>
                      <input className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={valueForm.name} onChange={e => setValueForm({ ...valueForm, name: e.target.value })} placeholder="e.g. Senior Developer" />
                    </div>
                  </div>
                  {!(isSystemCategory && editingValue) && (
                  <div className={!activePage || !activeCategory ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Description</label>
                    <textarea className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2] h-20" value={valueForm.description} onChange={e => setValueForm({ ...valueForm, description: e.target.value })} placeholder="Optional description..." />
                  </div>
                  )}
                  {!(isSystemCategory && editingValue) && (
                  <div className={`grid grid-cols-2 gap-4 ${!activePage || !activeCategory ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Status</label>
                      <select
                        value={valueForm.is_active ? 'active' : 'inactive'}
                        onChange={e => setValueForm({ ...valueForm, is_active: e.target.value === 'active' })}
                        className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                      >
                        {statusValues.map((opt: MasterDataValue) => (
                          <option key={opt.code} value={opt.code}>{opt.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  )}
                  {(!activePage || !activeCategory) && (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      Please select a Page and Category above to enable these fields.
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
      )}

      {/* Action Confirmation Modal */}
      <ConfirmActionModal
        isOpen={!!confirm}
        title={confirm?.action === 'delete' ? 'Delete Value' : confirm?.action === 'toggle' ? 'Change Status' : confirm?.action === 'add' ? 'Add Value' : 'Update Value'}
        message={confirm?.message || ''}
        consequence={confirm?.consequence || ''}
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : confirm?.action === 'toggle' ? 'Confirm' : 'Save'}
        variant={confirm?.action === 'delete' ? 'danger' : 'default'}
        isPending={confirm?.pending}
        onConfirm={handleConfirmCommit}
        onCancel={() => { setConfirm(null); setPendingPayload(null); }}
      />
      </div>
    </>
  );
};

export default MasterData;

