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

  const isHealthy = (status?: string) => status === 'healthy' || status === 'connected';

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>System Health</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Real-time system monitoring</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Database */}
        <div className="card card-body">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: isHealthy(health?.database?.status) ? 'var(--success-bg)' : 'var(--danger-bg)' }}>
                <Database className="w-5 h-5" style={{ color: isHealthy(health?.database?.status) ? 'var(--success-text)' : 'var(--danger-text)' }} />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>Database</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>PostgreSQL / SQLite</p>
              </div>
            </div>
            <span className="status-badge" style={{
              background: isHealthy(health?.database?.status) ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: isHealthy(health?.database?.status) ? 'var(--success-text)' : 'var(--danger-text)',
              borderColor: isHealthy(health?.database?.status) ? 'var(--success-border)' : 'var(--danger-border)',
            }}>
              {health?.database?.status || 'checking...'}
            </span>
          </div>
          {health?.database && (
            <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{health.database.latency_ms ?? '-'}ms</span>
              </div>
              <div className="flex justify-between">
                <span>Pool Size:</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{health.database.pool_size ?? '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Redis */}
        <div className="card card-body">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: isHealthy(health?.redis?.status) ? 'var(--success-bg)' : 'var(--muted-bg)' }}>
                <HardDrive className="w-5 h-5" style={{ color: isHealthy(health?.redis?.status) ? 'var(--success-text)' : 'var(--text-tertiary)' }} />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>Redis Cache</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>In-memory cache</p>
              </div>
            </div>
            <span className="status-badge" style={{
              background: isHealthy(health?.redis?.status) ? 'var(--success-bg)' : 'var(--muted-bg)',
              color: isHealthy(health?.redis?.status) ? 'var(--success-text)' : 'var(--text-tertiary)',
              borderColor: isHealthy(health?.redis?.status) ? 'var(--success-border)' : 'var(--border-color)',
            }}>
              {health?.redis?.status || 'Not configured'}
            </span>
          </div>
          {health?.redis && (
            <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{health.redis.latency_ms ?? '-'}ms</span>
              </div>
              <div className="flex justify-between">
                <span>Memory:</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{health.redis.used_memory_human ?? '-'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Metrics */}
      <div className="card card-body">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>System Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl text-center transition-all duration-200 hover:-translate-y-0.5" style={{ background: 'rgba(59,130,246,0.06)' }}>
            <Activity className="w-6 h-6 mx-auto mb-2 text-blue-600" />
            <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{health?.api_calls_today || 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>API Calls (24h)</p>
          </div>
          <div className="p-4 rounded-xl text-center transition-all duration-200 hover:-translate-y-0.5" style={{ background: 'rgba(16,185,129,0.06)' }}>
            <Users className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
            <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{health?.active_users || 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Active Users (24h)</p>
          </div>
          <div className="p-4 rounded-xl text-center transition-all duration-200 hover:-translate-y-0.5" style={{ background: 'rgba(139,92,246,0.06)' }}>
            <Server className="w-6 h-6 mx-auto mb-2 text-purple-600" />
            <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{health?.total_tenants || 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Tenants</p>
          </div>
          <div className="p-4 rounded-xl text-center transition-all duration-200 hover:-translate-y-0.5" style={{ background: 'rgba(245,158,11,0.06)' }}>
            <Clock className="w-6 h-6 mx-auto mb-2 text-amber-600" />
            <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{new Date().toLocaleTimeString()}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Last Updated</p>
          </div>
        </div>
      </div>
    </div>
  );
}
