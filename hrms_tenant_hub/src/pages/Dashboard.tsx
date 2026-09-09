import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Users,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight
} from 'lucide-react'
import api from '../services/api'

interface DashboardStats {
  totalTenants: number
  activeTenants: number
  totalOrganizations: number
  totalUsers: number
  monthlyRevenue: number
  pendingIssues: number
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalTenants: 0,
    activeTenants: 0,
    totalOrganizations: 0,
    totalUsers: 0,
    monthlyRevenue: 0,
    pendingIssues: 0
  })
  
  useEffect(() => {
    fetch('/api/superadmin/dashboard')
      .then(r => r.json())
      .then(data => setStats(data))
  }, [])
  
  const statCards = [
    {
      title: 'Total Tenants',
      value: stats.totalTenants,
      icon: Building2,
      color: 'blue',
      change: '+12%'
    },
    {
      title: 'Active Tenants',
      value: stats.activeTenants,
      icon: CheckCircle2,
      color: 'green',
      change: '+8%'
    },
    {
      title: 'Organizations',
      value: stats.totalOrganizations,
      icon: Users,
      color: 'purple',
      change: '+5%'
    },
    {
      title: 'Monthly Revenue',
      value: `₹${stats.monthlyRevenue.toLocaleString()}`,
      icon: CreditCard,
      color: 'emerald',
      change: '+23%'
    }
  ]
  
  const colorClasses: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-700', iconBg: 'bg-green-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', iconBg: 'bg-purple-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconBg: 'bg-emerald-100' },
  }
  
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Superadmin overview</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map(card => {
          const colors = colorClasses[card.color]
          return (
            <div key={card.title} className={`${colors.bg} rounded-lg p-6`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className={`text-2xl font-bold ${colors.text} mt-2`}>{card.value}</p>
                  <div className="flex items-center gap-1 mt-2 text-sm text-green-600">
                    <ArrowUpRight className="w-4 h-4" />
                    {card.change}
                  </div>
                </div>
                <div className={`${colors.iconBg} p-3 rounded-lg`}>
                  <card.icon className={`w-6 h-6 ${colors.text}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      
      {stats.pendingIssues > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Pending Issues</p>
            <p className="text-sm text-yellow-700 mt-1">
              You have {stats.pendingIssues} pending issue{stats.pendingIssues > 1 ? 's' : ''} that need attention.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
