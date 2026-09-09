import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Eye, Edit2, Trash2, Building2, Users, Calendar, CreditCard } from 'lucide-react'
import DataTable from '../components/DataTable'

interface Tenant {
  id: number
  name: string
  domain: string
  organization_count: number
  user_count: number
  status: string
  plan: string
  monthly_price: number
  created_at: string
}

const Tenants = () => {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  
  useEffect(() => {
    fetch('/api/superadmin/tenants')
      .then(r => r.json())
      .then(data => {
        setTenants(data.tenants || [])
        setLoading(false)
      })
  }, [])
  
  const columns = [
    { key: 'name', label: 'Tenant Name', render: (t: Tenant) => (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Building2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <div className="font-medium text-gray-900">{t.name}</div>
          <div className="text-sm text-gray-500">{t.domain}</div>
        </div>
      </div>
    )},
    { key: 'organizations', label: 'Organizations', render: (t: Tenant) => (
      <div className="flex items-center gap-1 text-gray-600">
        <Users className="w-4 h-4" />
        {t.organization_count}
      </div>
    )},
    { key: 'users', label: 'Users', render: (t: Tenant) => (
      <div className="flex items-center gap-1 text-gray-600">
        <Users className="w-4 h-4" />
        {t.user_count}
      </div>
    )},
    { key: 'plan', label: 'Plan', render: (t: Tenant) => (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
        t.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
        t.plan === 'professional' ? 'bg-blue-100 text-blue-700' :
        'bg-gray-100 text-gray-700'
      }`}>
        {t.plan}
      </span>
    )},
    { key: 'monthly_price', label: 'Monthly Price', render: (t: Tenant) => (
      <span className="text-gray-900 font-medium">₹{t.monthly_price.toLocaleString()}</span>
    )},
    { key: 'status', label: 'Status', render: (t: Tenant) => (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
        t.status === 'active' ? 'bg-green-100 text-green-700' :
        t.status === 'suspended' ? 'bg-red-100 text-red-700' :
        'bg-yellow-100 text-yellow-700'
      }`}>
        {t.status}
      </span>
    )},
    { key: 'created_at', label: 'Created', render: (t: Tenant) => (
      <div className="flex items-center gap-1 text-gray-600">
        <Calendar className="w-4 h-4" />
        {new Date(t.created_at).toLocaleDateString()}
      </div>
    )},
  ]
  
  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.domain.toLowerCase().includes(search.toLowerCase())
  )
  
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-600 mt-1">Manage all tenant organizations</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus className="w-5 h-5" />
          Add Tenant
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <DataTable
          columns={columns}
          data={filteredTenants}
          loading={loading}
          onRowClick={(tenant) => navigate(`/tenants/${tenant.id}`)}
          actions={(tenant) => (
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/tenants/${tenant.id}`); }}
                className="p-1 text-gray-600 hover:text-blue-600"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); }}
                className="p-1 text-gray-600 hover:text-blue-600"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); }}
                className="p-1 text-gray-600 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        />
      </div>
    </div>
  )
}

export default Tenants
