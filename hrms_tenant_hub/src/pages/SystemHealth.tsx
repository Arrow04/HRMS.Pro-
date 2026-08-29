import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, Server, Database, HardDrive, Activity, Clock, Users, RefreshCw } from 'lucide-react';
import api from '../services/api';

export default function SystemHealth() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['system-health-full'],
    queryFn: () => api.get('/superadmin/legacy/health').then(r => r.data),
    refetchInterval: 15000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time system monitoring</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`bg-white rounded-xl border p-5 ${health?.database?.status === 'healthy' ? 'border-green-200' : 'border-red-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${health?.database?.status === 'healthy' ? 'bg-green-100' : 'bg-red-100'}`}>
                <Database className={`w-5 h-5 ${health?.database?.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div><h3 className="font-semibold text-gray-900">Database</h3><p className="text-xs text-gray-500">PostgreSQL / SQLite</p></div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${health?.database?.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {health?.database?.status || 'checking...'}
            </span>
          </div>
        </div>

        <div className={`bg-white rounded-xl border p-5 ${health?.redis?.status === 'healthy' ? 'border-green-200' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${health?.redis?.status === 'healthy' ? 'bg-green-100' : 'bg-gray-100'}`}>
                <HardDrive className={`w-5 h-5 ${health?.redis?.status === 'healthy' ? 'text-green-600' : 'text-gray-500'}`} />
              </div>
              <div><h3 className="font-semibold text-gray-900">Redis Cache</h3><p className="text-xs text-gray-500">In-memory cache</p></div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${health?.redis?.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
              {health?.redis?.status || 'Not configured'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Activity className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{health?.api_calls_today || 0}</p>
            <p className="text-xs text-gray-500">API Calls (24h)</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Users className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{health?.active_users || 0}</p>
            <p className="text-xs text-gray-500">Active Users (24h)</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Server className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{health?.total_tenants || 0}</p>
            <p className="text-xs text-gray-500">Total Tenants</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Clock className="w-6 h-6 text-amber-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{new Date().toLocaleTimeString()}</p>
            <p className="text-xs text-gray-500">Last Updated</p>
          </div>
        </div>
      </div>
    </div>
  );
}
