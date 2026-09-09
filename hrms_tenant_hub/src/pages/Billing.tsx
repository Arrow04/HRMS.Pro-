import { useState, useEffect } from 'react'
import { Download, Filter, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react'

interface BillingData {
  totalRevenue: number
  monthlyRecurring: number
  averageRevenuePerTenant: number
  pendingInvoices: number
  revenueByPlan: Array<{ plan: string; revenue: number; count: number }>
  recentInvoices: Array<{
    id: number
    tenant_name: string
    plan: string
    amount: number
    status: string
    created_at: string
  }>
}

const Billing = () => {
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/superadmin/billing')
      .then(r => r.json())
      .then(data => {
        setBilling(data)
        setLoading(false)
      })
  }, [])
  
  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }
  
  if (!billing) {
    return <div className="text-center py-12 text-gray-500">No billing data available</div>
  }
  
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-600 mt-1">Revenue and subscription management</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">₹{billing.totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Monthly Recurring</p>
              <p className="text-2xl font-bold text-gray-900">₹{billing.monthlyRecurring.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg Revenue/Tenant</p>
              <p className="text-2xl font-bold text-gray-900">₹{billing.averageRevenuePerTenant.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{billing.pendingInvoices}</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Revenue by Plan</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {billing.revenueByPlan.map(item => (
              <div key={item.plan} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 capitalize">{item.plan}</p>
                  <p className="text-sm text-gray-600">{item.count} tenants</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">₹{item.revenue.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">
                    {((item.revenue / billing.totalRevenue) * 100).toFixed(1)}% of total
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {billing.recentInvoices.map(invoice => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{invoice.tenant_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">{invoice.plan}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">₹{invoice.amount.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
                      invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(invoice.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Billing
