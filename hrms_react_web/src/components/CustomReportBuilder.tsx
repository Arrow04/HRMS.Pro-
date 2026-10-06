import { useMemo, useState } from 'react';
import {
  BarChart3, CheckCircle2, ChevronDown, Download, Filter, Loader2,
  Plus, Save, Search, Trash2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../services/api';

type FieldType = 'string' | 'number' | 'date' | 'bool';
interface FieldDef { key: string; label: string; type: FieldType; from?: string }
interface SourceDef {
  id: string; label: string; fields: FieldDef[]; filters: string[];
  numeric: string[]; defaultFields: string[];
}
interface Schema { sources: SourceDef[]; aggregations: string[] }
interface Column { key: string; label: string; type: FieldType }
interface RunResult {
  columns: Column[]; rows: Record<string, unknown>[]; rowCount: number;
  truncated?: boolean; groupBy?: string; aggregation?: string;
}
interface SavedReport { name: string; config: BuilderConfig }
interface BuilderConfig {
  dataSource: string; fields: string[]; search: string; status: string;
  companyId: string; departmentId: string; dateFrom: string; dateTo: string;
  month: string; year: string; groupBy: string; aggregation: string; aggField: string;
  sort: string; order: 'asc' | 'desc';
}

const emptyConfig = (ds = ''): BuilderConfig => ({
  dataSource: ds, fields: [], search: '', status: '', companyId: '', departmentId: '',
  dateFrom: '', dateTo: '', month: '', year: '', groupBy: '', aggregation: '', aggField: '',
  sort: '', order: 'asc',
});

const STATUS_OPTIONS: Record<string, string[]> = {
  employees: ['active', 'inactive'],
  payroll: ['draft', 'pending_approval', 'approved', 'processed', 'paid', 'cancelled'],
  attendance: ['present', 'absent', 'half_day', 'on_leave', 'late'],
  leave_applications: ['pending', 'approved', 'rejected', 'cancelled'],
  expenses: ['pending', 'approved', 'rejected', 'reimbursed'],
  assets: ['available', 'assigned', 'returned', 'retired'],
  performance_reviews: ['draft', 'submitted', 'acknowledged', 'completed'],
  exit_records: [],
  leave_balances: [],
};

const fmtValue = (v: unknown, type?: FieldType): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'number' && typeof v === 'number') return v.toLocaleString('en-IN');
  if (type === 'bool') return v ? 'Yes' : 'No';
  return String(v);
};

const CSV_KEYS: Record<string, string> = {
  search: 'search', status: 'status', companyId: 'companyId', departmentId: 'departmentId',
  employeeId: 'employeeId', month: 'month', year: 'year', dateFrom: 'dateFrom',
  dateTo: 'dateTo', exitType: 'exitType', fnfStatus: 'fnfStatus',
};

/**
 * Comprehensive custom report builder.
 * Source -> fields -> filters -> optional group-by/aggregation -> preview
 * -> CSV/XLSX export + saved templates. Backed by /api/reports/custom/*.
 */
export default function CustomReportBuilder() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [config, setConfig] = useState<BuilderConfig>(emptyConfig());
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [saved, setSaved] = useState<SavedReport[]>(() => {
    try { return JSON.parse(localStorage.getItem('hrms_saved_reports') || '[]'); } catch { return []; }
  });
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [openFilters, setOpenFilters] = useState(true);

  // Load schema + master data once
  useMemo(() => {
    api.get('/reports/custom/schema').then((r) => setSchema(r.data as Schema)).catch(() => toast.error('Failed to load report schema'));
    api.get('/companies').then((r) => setCompanies(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get('/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const source = useMemo(
    () => schema?.sources.find((s) => s.id === config.dataSource) || null,
    [schema, config.dataSource],
  );

  const set = <K extends keyof BuilderConfig>(key: K, value: BuilderConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const pickSource = (s: SourceDef) => {
    setConfig({ ...emptyConfig(s.id), fields: [...s.defaultFields] });
    setResult(null);
    setFieldSearch('');
  };

  const toggleField = (key: string) => {
    setConfig((c) => ({
      ...c,
      fields: c.fields.includes(key) ? c.fields.filter((f) => f !== key) : [...c.fields, key],
    }));
  };

  const persistSaved = (list: SavedReport[]) => {
    setSaved(list);
    localStorage.setItem('hrms_saved_reports', JSON.stringify(list));
  };

  const saveReport = () => {
    const name = saveName.trim();
    if (!name) return toast.error('Enter a template name');
    const next = [...saved.filter((s) => s.name !== name), { name, config }];
    persistSaved(next.slice(-20));
    setSaveName('');
    setShowSave(false);
    toast.success(`Saved template "${name}"`);
  };

  const runReport = async () => {
    if (!config.dataSource) return;
    if (config.groupBy && !config.aggregation) return toast.error('Pick an aggregation for group-by');
    setLoading(true);
    try {
      const params: Record<string, string | number> = { dataSource: config.dataSource, limit: 2000 };
      if (config.fields.length) params.fields = config.fields.join(',');
      if (config.groupBy && config.aggregation) {
        params.groupBy = config.groupBy;
        params.aggregation = config.aggregation;
        params.aggField = config.aggField || (source?.numeric[0] || '');
      }
      if (config.sort) { params.sort = config.sort; params.order = config.order; }
      (Object.keys(CSV_KEYS) as (keyof BuilderConfig)[]).forEach((k) => {
        const v = config[k];
        if (v !== '' && v !== undefined) params[CSV_KEYS[k]] = String(v);
      });
      const res = await api.get('/reports/custom/data', { params });
      setResult(res.data as RunResult);
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportFile = (format: 'csv' | 'xlsx') => {
    if (!result || !result.rows.length) return;
    const rows = result.rows;
    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows, { header: result.columns.map((c) => c.key) });
      // relabel header row with human labels
      result.columns.forEach((c, i) => { if (ws[XLSX.utils.encode_cell({ r: 0, c: i })]) ws[XLSX.utils.encode_cell({ r: 0, c: i })].v = c.label; });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `report_${config.dataSource}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const header = result.columns.map((c) => c.label).join(',');
      const lines = rows.map((r) => result.columns.map((c) => {
        const v = r[c.key];
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','));
      const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report_${config.dataSource}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  if (!schema) return <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading report builder…</div>;

  const visibleFields = (source?.fields || []).filter((f) =>
    !fieldSearch || f.label.toLowerCase().includes(fieldSearch.toLowerCase()) || f.key.includes(fieldSearch.toLowerCase()));

  return (
    <div className="space-y-5">
      {/* Header + saved templates */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Custom Report Builder</h3>
          <p className="text-sm text-[var(--text-tertiary)]">Pick a source, choose columns, filter, group and aggregate — then export.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSave((v) => !v)} className="px-3 py-2 border border-[var(--border-color)] rounded-xl text-sm font-medium hover:bg-[var(--hover-bg)] flex items-center gap-1.5">
            <Save className="w-4 h-4" /> Save template
          </button>
          {saved.length > 0 && (
            <select
              className="px-3 py-2 border border-[var(--border-color)] rounded-xl text-sm bg-white"
              value=""
              onChange={(e) => {
                const t = saved.find((s) => s.name === e.target.value);
                if (t) { setConfig(t.config); setResult(null); toast.success(`Loaded "${t.name}"`); }
              }}
            >
              <option value="">Load template…</option>
              {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {showSave && (
        <div className="flex items-center gap-2 bg-white border border-[var(--border-color)] rounded-xl p-3">
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Template name (e.g. Monthly PF report)"
            className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" onKeyDown={(e) => e.key === 'Enter' && saveReport()} />
          <button onClick={saveReport} className="px-4 py-2 bg-[#1C64F2] text-white rounded-lg text-sm font-medium">Save</button>
          <button onClick={() => setShowSave(false)} className="px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Saved templates management */}
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saved.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-700">
              {s.name}
              <button onClick={() => persistSaved(saved.filter((x) => x.name !== s.name))} title="Delete template">
                <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Step 1: sources */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">1. Data source</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {schema.sources.map((s) => (
            <button key={s.id} onClick={() => pickSource(s)}
              className={`px-3 py-2.5 rounded-xl border text-left text-sm font-medium transition-all ${
                config.dataSource === s.id
                  ? 'border-[#1C64F2] bg-[#1C64F2]/5 shadow-sm text-[#1C64F2]'
                  : 'border-[var(--border-color)] hover:border-gray-300 text-[var(--text-primary)]'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {source && (
        <>
          {/* Step 2: fields */}
          <div className="bg-white border border-[var(--border-color)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">2. Columns</label>
              <div className="flex items-center gap-2 text-xs">
                <button className="text-[#1C64F2] font-medium" onClick={() => set('fields', source.fields.map((f) => f.key))}>All</button>
                <button className="text-[var(--text-tertiary)]" onClick={() => set('fields', [])}>None</button>
              </div>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-tertiary)]" />
              <input value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder="Search columns…"
                className="w-full pl-9 pr-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
              {visibleFields.map((f) => {
                const on = config.fields.includes(f.key);
                return (
                  <label key={f.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${on ? 'border-[#1C64F2]/50 bg-[#1C64F2]/5' : 'border-[var(--border-color)]'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleField(f.key)} className="accent-[#1C64F2]" />
                    <span className="truncate">{f.label}</span>
                    {f.type === 'number' && <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">num</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Step 3: filters */}
          <div className="bg-white border border-[var(--border-color)] rounded-xl p-4">
            <button className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] mb-3" onClick={() => setOpenFilters((v) => !v)}>
              <Filter className="w-4 h-4" /> 3. Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${openFilters ? 'rotate-180' : ''}`} />
            </button>
            {openFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {source.filters.includes('search') && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">Search</label>
                    <input value={config.search} onChange={(e) => set('search', e.target.value)} placeholder="Name, code, email…"
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" />
                  </div>
                )}
                {source.filters.includes('status') && STATUS_OPTIONS[source.id]?.length > 0 && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">Status</label>
                    <select value={config.status} onChange={(e) => set('status', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                      <option value="">All</option>
                      {STATUS_OPTIONS[source.id].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {source.filters.includes('companyId') && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">Company</label>
                    <select value={config.companyId} onChange={(e) => set('companyId', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                      <option value="">All</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {source.filters.includes('departmentId') && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">Department</label>
                    <select value={config.departmentId} onChange={(e) => set('departmentId', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                      <option value="">All</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
                {source.filters.includes('dateFrom') && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">From date</label>
                    <input type="date" value={config.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" />
                  </div>
                )}
                {source.filters.includes('dateTo') && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">To date</label>
                    <input type="date" value={config.dateTo} onChange={(e) => set('dateTo', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" />
                  </div>
                )}
                {source.filters.includes('month') && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">Month</label>
                    <select value={config.month} onChange={(e) => set('month', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                      <option value="">All</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                {source.filters.includes('year') && (
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-1">Year</label>
                    <input type="number" value={config.year} onChange={(e) => set('year', e.target.value)} placeholder="e.g. 2026"
                      className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 4: group-by + aggregation + sort */}
          <div className="bg-white border border-[var(--border-color)] rounded-xl p-4">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">4. Group &amp; aggregate <span className="text-[var(--text-tertiary)] font-normal">(optional)</span></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-tertiary)] mb-1">Group by</label>
                <select value={config.groupBy} onChange={(e) => set('groupBy', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                  <option value="">No grouping</option>
                  {source.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-tertiary)] mb-1">Aggregation</label>
                <select value={config.aggregation} onChange={(e) => set('aggregation', e.target.value)} disabled={!config.groupBy}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white disabled:opacity-50">
                  <option value="">—</option>
                  {schema.aggregations.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-tertiary)] mb-1">Of column</label>
                <select value={config.aggField} onChange={(e) => set('aggField', e.target.value)} disabled={!config.aggregation}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white disabled:opacity-50">
                  <option value="">—</option>
                  {source.numeric.map((k) => {
                    const f = source.fields.find((x) => x.key === k);
                    return <option key={k} value={k}>{f?.label || k}</option>;
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[var(--text-tertiary)] mb-1">Sort by</label>
                  <select value={config.sort} onChange={(e) => set('sort', e.target.value)} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                    <option value="">—</option>
                    {source.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-tertiary)] mb-1">Order</label>
                  <select value={config.order} onChange={(e) => set('order', e.target.value as 'asc' | 'desc')} className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white">
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Run + export */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={runReport} disabled={loading || !config.dataSource}
              className="px-6 py-2.5 bg-[#1C64F2] text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              {config.groupBy && config.aggregation ? 'Run aggregated report' : 'Run report'}
            </button>
            {result && result.rows.length > 0 && (
              <>
                <button onClick={() => exportFile('csv')} className="px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm font-medium hover:bg-[var(--hover-bg)] flex items-center gap-2">
                  <Download className="w-4 h-4" /> CSV
                </button>
                <button onClick={() => exportFile('xlsx')} className="px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm font-medium hover:bg-[var(--hover-bg)] flex items-center gap-2">
                  <Download className="w-4 h-4" /> Excel
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Preview */}
      {result && (
        <div className="bg-white border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold text-[var(--text-primary)]">{result.rowCount}</span>
              <span className="text-[var(--text-tertiary)]"> row{result.rowCount === 1 ? '' : 's'}{result.truncated ? ' (truncated to 2000)' : ''}</span>
              {result.groupBy && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  grouped by {result.groupBy} · {result.aggregation}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> org-scoped data
            </div>
          </div>
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--background)] sticky top-0">
                <tr>
                  {result.columns.map((c) => (
                    <th key={c.key} className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-tertiary)] border-b border-[var(--border-color)] whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-[var(--border-color)] hover:bg-[var(--background)]">
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2 text-[var(--text-primary)] whitespace-nowrap ${c.type === 'number' ? 'text-right tabular-nums' : ''}`}>
                        {fmtValue(row[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!result && source && (
        <div className="border border-dashed border-[var(--border-color)] rounded-xl p-8 text-center text-sm text-[var(--text-tertiary)]">
          <Plus className="w-5 h-5 mx-auto mb-2 opacity-50" />
          Configure columns and filters, then run the report. Aggregated views (e.g. total net pay by department) are available in step 4.
        </div>
      )}
    </div>
  );
}
