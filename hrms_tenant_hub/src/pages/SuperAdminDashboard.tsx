import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2, Users, Activity, DollarSign, AlertCircle, CheckCircle,
  Clock, TrendingUp, ArrowUpRight, RefreshCw, Server, Database, HardDrive
} from 'lucide-react';
import api from '../services/api';

export default function SuperAdminDashboard() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['superadmin-dashboard'] }),
        queryClient.refetchQueries({ queryKey: ['pending-tenants-count'] }),
        queryClient.refetchQueries({ queryKey: ['system-health'] }),
      ]);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: () => api.get('/superadmin/legacy/dashboard/stats').then(r => r.data),
  });

  const { data: pendingTenants } = useQuery({
    queryKey: ['pending-tenants-count'],
    queryFn: () => api.get('/superadmin/legacy/pending-tenants').then(r => r.data),
  });

  const { data: health } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get('/superadmin/legacy/health').then(r => r.data),
    refetchInterval: 30000,
  });

  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value ?? '...'}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
                <h1 className="text-2xl font-bold text-gray-900">HRMS.Pro! Control Hub</h1>
          <p className="text-sm text-gray-500 mt-1">System-wide management and monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
              health.database?.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {health.database?.status === 'healthy' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              DB {health.database?.latency_ms ? `${health.database.latency_ms}ms` : health.database?.status}
            </div>
          )}
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 hover:text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Total Tenants" value={stats?.total_tenants} color="bg-blue-600" sub={`${stats?.active_tenants ?? 0} active`} />
        <StatCard icon={Users} label="Total Users" value={stats?.total_users} color="bg-blue-600" sub={`${stats?.active_users_today ?? 0} active today`} />
        <StatCard icon={Activity} label="Suspended" value={stats?.suspended_tenants} color="bg-red-600" sub={`${stats?.trial_tenants ?? 0} on trial`} />
        <StatCard icon={DollarSign} label="Monthly Revenue" value={stats?.revenue_this_month ? `Rs.${(stats.revenue_this_month).toLocaleString()}` : 'Rs.0'} color="bg-green-600" sub="From active subscriptions" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
            <Link to="/superadmin/tenants" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all</Link>
          </div>
          {pendingTenants?.length > 0 ? (
            <div className="space-y-3">
              {pendingTenants.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.company_name}</p>
                      <p className="text-xs text-gray-500">{t.admin_email} &middot; {t.industry || 'N/A'}</p>
                    </div>
                  </div>
                  <Link to={`/superadmin/tenants`} className="text-xs text-amber-600 font-medium hover:text-amber-700">Review &rarr;</Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No pending approvals</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Server className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Database</span></div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${health?.database?.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {health?.database?.status ?? 'checking...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Redis</span></div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${health?.redis?.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>{health?.redis?.status ?? 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">API Calls (24h)</span></div>
              <span className="text-sm font-semibold text-gray-900">{health?.api_calls_today ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Active Users (24h)</span></div>
              <span className="text-sm font-semibold text-gray-900">{health?.active_users ?? 0}</span>
            </div>
          </div>
          <Link to="/superadmin/health" className="mt-4 block text-center text-sm text-blue-600 hover:text-blue-700 font-medium">Full health dashboard &rarr;</Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/superadmin/tenants" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><Building2 className="w-5 h-5 text-blue-600" /><span className="text-sm font-medium text-gray-700">Manage Tenants</span></Link>
          <Link to="/superadmin/billing" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><DollarSign className="w-5 h-5 text-green-600" /><span className="text-sm font-medium text-gray-700">Billing & Plans</span></Link>
          <Link to="/superadmin/audit-logs" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><Activity className="w-5 h-5 text-blue-600" /><span className="text-sm font-medium text-gray-700">Audit Logs</span></Link>
          <Link to="/superadmin/feature-flags" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><TrendingUp className="w-5 h-5 text-amber-600" /><span className="text-sm font-medium text-gray-700">Feature Flags</span></Link>
        </div>
      </div>
    </div>
  );
}
