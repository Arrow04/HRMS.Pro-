import { useState } from 'react';
import {
  History, Search, Building2, Users, Calendar, Briefcase, Database,
  Clock, DollarSign, Receipt, Settings, FileBarChart, Filter, ChevronDown,
  Monitor, Smartphone, Globe, MapPin, FileText
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useMasterData } from '../hooks/useMasterData';
import toast from 'react-hot-toast';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';

import SearchableSelect from '../components/SearchableSelect';

interface ActivityLogEntry {
  id: number;
  user_name?: string;
  module?: string;
  action: string;
  entity_name?: string;
  entity_type?: string;
  old_value?: string;
  new_value?: string;
  device_info?: string;
  ip_address?: string;
  created_at?: string;
}

const ActivityLog = () => {
  const [activeModule, setActiveModule] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const { data: actionOptions = [] } = useMasterData('AUDIT_ACTION');

  const MODULES = [
    { id: 'all', label: 'All Modules', icon: History },
    { id: 'Company', label: 'Company', icon: Building2 },
    { id: 'Employee', label: 'Employee', icon: Users },
    { id: 'Leave', label: 'Leave Management', icon: Calendar },
    { id: 'Recruitment', label: 'Recruitment', icon: Briefcase },
    { id: 'MasterData', label: 'Master Data', icon: Database },
    { id: 'Attendance', label: 'Attendance', icon: Clock },
    { id: 'Payroll', label: 'Payroll', icon: DollarSign },
    { id: 'Expenses', label: 'Expenses', icon: Receipt },
    { id: 'Settings', label: 'Settings', icon: Settings },
    { id: 'Reports', label: 'Reports', icon: FileBarChart },
  ];

  const { data: activityLogs, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ['activity-logs', activeModule, actionFilter],
    queryFn: async () => {
      try {
        const params: Record<string, string> = {};
        if (activeModule !== 'all') params.module = activeModule;
        if (actionFilter !== 'all') params.action = actionFilter;
        
        const response = await api.get('/activity-logs', { params });
        return response.data;
      } catch (error) {
        // Error logged
        toast.error('Failed to fetch activity logs');
        return [];
      }
    },
  });

  const filteredLogs = (activityLogs || []).filter((log) =>
    log.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.entity_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-[#F0FDF4] text-[var(--success-green)] border border-[#057A55]/20';
      case 'edit':
        return 'bg-[#EFF6FF] text-[var(--primary-blue)] border border-[#1C64F2]/20';
      case 'delete':
        return 'bg-[#FEF2F2] text-[var(--danger-red)] border border-[#C81E1E]/20';
      case 'toggle_active':
        return 'bg-[#F0FDF4] text-[var(--success-green)] border border-[#057A55]/20';
      case 'toggle_inactive':
        return 'bg-[#FEF2F2] text-[var(--danger-red)] border border-[#C81E1E]/20';
      default:
        return 'bg-[#F3F4F6] text-[#6B7280] border border-[#6B7280]/20';
    }
  };

  const getDeviceIcon = (deviceInfo?: string) => {
    switch (deviceInfo?.toLowerCase()) {
      case 'windows':
      case 'linux':
      case 'macos':
        return <Monitor className="w-4 h-4" />;
      case 'android':
      case 'ios':
        return <Smartphone className="w-4 h-4" />;
      default:
        return <Globe className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header */}
        <PageHero
          title="Activity Logs"
          subtitle="Track all user actions across the system"
          icon={FileText}
          accent="slate"
          breadcrumbs={['HRMS.Pro!', 'Activity Logs']}
          actions={
            <ExportButton
              rows={filteredLogs}
              filename="activity_logs"
              label="Export"
            />
          }
        />

        {/* Module Tabs */}
        <div className="bg-white rounded-xl border border-[var(--border-color)] p-2 flex flex-wrap gap-2">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => setActiveModule(module.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                  activeModule === module.id
                    ? 'bg-[var(--primary-blue)] text-white shadow-md'
                    : 'bg-[var(--background)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {module.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-[var(--border-color)] p-4 flex flex-col lg:flex-row gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search by user, entity, or action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--text-tertiary)]" />
            <SearchableSelect
              value={actionFilter}
              onChange={(val) => setActionFilter(val.toString())}
              options={actionOptions.map((a: { code: string; name: string }) => ({ id: a.code, name: a.name }))}
              placeholder="All Actions"
              allOption="All Actions"
              className="w-44"
            />
          </div>
        </div>

        {/* Activity Logs Table */}
        <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
          {isLoading ? (
            <div className="py-4 px-2">
              null
            </div>
          ) : (
            <DataTable
              data={filteredLogs}
              rowKey={(log) => log.id}
              logEntityType="audit_log"
              logFor={(log: ActivityLogEntry) => ({ id: log.id, label: log.entity_name || `#${log.id}` })}
              emptyMessage="No activity logs found"
              columns={[
                { key: 'user_name', header: 'User', sortable: true, render: (log) => <span className="font-medium text-[#0F172A]">{log.user_name}</span>, sortValue: (log) => log.user_name },
                { key: 'module', header: 'Module', render: (log) => <span className="text-sm text-[#64748B]">{log.module}</span> },
                {
                  key: 'action', header: 'Action', sortable: true,
                  render: (log) => <span className={`status-badge ${(log.action || '').toLowerCase()}`}>{log.action.replace('_', ' ').toUpperCase()}</span>,
                  sortValue: (log) => log.action,
                },
                {
                  key: 'entity_name', header: 'Entity',
                  render: (log) => (
                    <div>
                      <div className="font-medium text-[#0F172A]">{log.entity_name || '-'}</div>
                      <div className="text-xs text-[#94A3B8]">{log.entity_type || '-'}</div>
                    </div>
                  ),
                },
                {
                  key: 'changes', header: 'Changes',
                  render: (log) => (
                    log.old_value || log.new_value ? (
                      <div className="space-y-1">
                        {log.old_value && <div className="text-xs"><span className="text-red-500">Old:</span> {log.old_value}</div>}
                        {log.new_value && <div className="text-xs"><span className="text-green-500">New:</span> {log.new_value}</div>}
                      </div>
                    ) : <span className="text-sm text-[#64748B]">-</span>
                  ),
                },
                {
                  key: 'device_info', header: 'Device Info',
                  render: (log) => (
                    <div className="flex items-center gap-2 text-sm text-[#64748B]">
                      {getDeviceIcon(log.device_info)}
                      <span>{log.device_info || 'Unknown'}</span>
                    </div>
                  ),
                },
                { key: 'ip_address', header: 'IP Address', render: (log) => <span className="text-sm text-[#64748B]">{log.ip_address || '-'}</span> },
                { key: 'created_at', header: 'Timestamp', sortable: true, render: (log) => <span className="text-sm text-[#64748B]">{log.created_at}</span>, sortValue: (log) => log.created_at },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;

