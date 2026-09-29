import { useState, useEffect } from 'react'
import { Save, Search, ChevronDown, ChevronRight, Edit2, Check, X, Info, Shield } from 'lucide-react'
import api from '../services/api'

interface StatutoryRule {
  id?: number
  category: string
  rule_key: string
  label: string
  standard_value?: string
  current_value?: number
  unit?: string
  notification_ref?: string
  legal_basis?: string
  effective_date?: string
  description?: string
  status?: string
}

const CATEGORIES = [
  { id: 'pf', label: 'Provident Fund (PF/EPS/EDLI)', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'esi', label: 'Employee State Insurance (ESI)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'pt', label: 'Professional Tax (PT)', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'lwf', label: 'Labour Welfare Fund (LWF)', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'nps', label: 'National Pension System (NPS)', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'gratuity', label: 'Gratuity', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'bonus', label: 'Statutory Bonus', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'general', label: 'General Payroll Constants', color: 'bg-gray-50 text-gray-700 border-gray-200' },
]

const StatutoryRules = () => {
  const [rules, setRules] = useState<StatutoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('pf')
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<StatutoryRule>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchRules() }, [])

  const fetchRules = async () => {
    try {
      const r = await api.get('/statutory-rules')
      setRules(Array.isArray(r.data) ? r.data : [])
    } catch { /* */ } finally { setLoading(false) }
  }

  const handleSave = async (rule: StatutoryRule) => {
    setSaving(true)
    try {
      await api.put('/statutory-rules', { rules: [rule] })
      setEditingRule(null)
      fetchRules()
    } catch { alert('Failed to save rule') } finally { setSaving(false) }
  }

  const filtered = rules.filter(r => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return r.label.toLowerCase().includes(term) || r.rule_key.toLowerCase().includes(term) ||
        (r.description || '').toLowerCase().includes(term) || (r.notification_ref || '').toLowerCase().includes(term)
    }
    return true
  })

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    rules: filtered.filter(r => r.category === cat.id),
  })).filter(cat => cat.rules.length > 0)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" /> Statutory Rules Configuration
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            When the government changes a rule, update the value here — the entire HRMS adapts automatically. No code changes needed.
          </p>
        </div>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search rules by name, key, description, or notification..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading rules...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No rules found. Run the seed script first.</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(cat => (
            <div key={cat.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${expandedCategory === cat.id ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cat.color}`}>{cat.rules.length}</span>
                  <span className="font-medium text-sm text-gray-900">{cat.label}</span>
                </div>
                {expandedCategory === cat.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </button>
              {expandedCategory === cat.id && (
                <div className="border-t border-gray-200">
                  {cat.rules.map(rule => (
                    <div key={rule.rule_key} className="px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                      {editingRule === rule.rule_key ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-500">Standard Value</label>
                              <input value={editForm.standard_value || ''} onChange={e => setEditForm({ ...editForm, standard_value: e.target.value })}
                                className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Current Value</label>
                              <input type="number" step="any" value={editForm.current_value ?? ''} onChange={e => setEditForm({ ...editForm, current_value: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Effective Date</label>
                              <input type="date" value={editForm.effective_date || ''} onChange={e => setEditForm({ ...editForm, effective_date: e.target.value })}
                                className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-500">Notification Reference</label>
                              <input value={editForm.notification_ref || ''} onChange={e => setEditForm({ ...editForm, notification_ref: e.target.value })}
                                className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. S.O. 5109(E) dated 17 Sep 2026" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Legal Basis</label>
                              <input value={editForm.legal_basis || ''} onChange={e => setEditForm({ ...editForm, legal_basis: e.target.value })}
                                className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Section 15 COSS 2020" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSave({ ...rule, ...editForm })} disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                              <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingRule(null)}
                              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">{rule.label}</span>
                              <span className="text-xs text-gray-400 font-mono">{rule.rule_key}</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-1.5">{rule.description}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              {rule.standard_value && <span className="text-blue-600 font-medium">Standard: {rule.standard_value}</span>}
                              {rule.current_value != null && <span className="text-gray-600">Current: {rule.current_value}</span>}
                              {rule.unit && <span className="text-gray-400">Unit: {rule.unit}</span>}
                              {rule.effective_date && <span className="text-gray-400">Effective: {rule.effective_date}</span>}
                            </div>
                            {rule.notification_ref && (
                              <div className="mt-1 flex items-start gap-1 text-[11px] text-blue-500">
                                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{rule.notification_ref}</span>
                              </div>
                            )}
                            {rule.legal_basis && (
                              <div className="mt-0.5 text-[11px] text-gray-400">Legal: {rule.legal_basis}</div>
                            )}
                          </div>
                          <button onClick={() => { setEditingRule(rule.rule_key); setEditForm(rule); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0" title="Edit">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default StatutoryRules
