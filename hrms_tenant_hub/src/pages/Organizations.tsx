import { useState, useEffect } from 'react'
import { Search, Plus, Download, Filter } from 'lucide-react'
import DataTable from '../components/DataTable'
import type { Column } from '../components/DataTable'

interface Organization {
  id: number
  name: string
  industry: string
  country: string
  tenant_name: string
  employee_count: number
  status: string
  created_at: string
}

const Organizations = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/superadmin/organizations')
      .then(r => r.json())
      .then(data => {
        setOrganizations(data.organizations || [])
        setLoading(false)
      })
  }, [])
  
  const columns: Column<Organization>[] = [
    {
      key: 'name',
      label: 'Organization',
      render: (org) => (
        <div>
          <div className="font-medium text-gray-900">{org.name}</div>
          <div className="text-sm text-gray-500">{org.tenant_name}</div>
        </div>
      )
    },
    {
      key: 'industry',
      label: 'Industry',
      render: (org) => <span className="text-gray-600">{org.industry || 'N/A'}</span>
    },
    {
      key: 'country',
      label: 'Country',
      render: (org) => <span className="text-gray-600">{org.country || 'N/A'}</span>
    },
    {
      key: 'employee_count',
      label: 'Employees',
      render: (org) => <span className="text-gray-900 font-medium">{org.employee_count}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (org) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          org.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {org.status}
        </span>
      )
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (org) => (
        <span className="text-gray-600">{new Date(org.created_at).toLocaleDateString()}</span>
      )
    }
  ]
  
  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(search.toLowerCase()) ||
    org.tenant_name.toLowerCase().includes(search.toLowerCase())
  )
  
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-600 mt-1">All organizations across tenants</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50">
            <Download className="w-5 h-5" />
            Export
          </button>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            <Plus className="w-5 h-5" />
            Add Organization
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search organizations..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50">
              <Filter className="w-5 h-5" />
              Filters
            </button>
          </div>
        </div>
        
        <DataTable
          columns={columns}
          data={filteredOrgs}
          loading={loading}
        />
      </div>
    </div>
  )
}

export default Organizations
