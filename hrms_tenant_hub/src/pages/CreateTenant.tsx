import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, Mail, Lock, User, Globe, Users, Loader2, CheckCircle2,
  Copy, ArrowLeft, Briefcase, Wallet, CalendarCheck, Clock, FileText,
  BarChart3, Settings, ShieldCheck, Wand2, RotateCcw, Eye, EyeOff, KeyRound,
  Building, Palmtree, CreditCard, Monitor, TrendingUp, ShieldAlert, FileBarChart, Database, LogOut, Tag
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const MODULE_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'company', label: 'Company', icon: Building },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'holidays', label: 'Holidays', icon: Palmtree },
  { id: 'recruitment', label: 'Recruitment', icon: Briefcase },
  { id: 'leaves', label: 'Leaves', icon: CalendarCheck },
  { id: 'payroll', label: 'Payroll', icon: Wallet },
  { id: 'expenses', label: 'Expenses', icon: CreditCard },
  { id: 'assets', label: 'Assets', icon: Monitor },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'master_data', label: 'Master Data', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'exit', label: 'Exits', icon: LogOut },
  { id: 'anomalies', label: 'Anomalies', icon: ShieldAlert },
];

const initialForm = {
  company_name: '',
  company_code: '',
  admin_name: '',
  admin_email: '',
  admin_phone: '',
  password: '',
  passcode: '',
  industry: '',
  company_size: '10-50',
  default_currency: 'INR',
  timezone: 'Asia/Kolkata',
  country: 'India',
  pan_no: '',
  tan_no: '',
  gst_no: '',
  plan_id: '',
};

const buildSecureCode = (len: number) => {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '@#$%&*!?+=';
  const all = upper + lower + digits + special;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = chars.length; i < len; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

export default function CreateTenant() {
  const [form, setForm] = useState(initialForm);
  const [modules, setModules] = useState<string[]>(MODULE_OPTIONS.map(m => m.id));
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const navigate = useNavigate();

  const [clock, setClock] = useState(new Date());
  const [showPassword, setShowPassword] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  const [copiedPasscode, setCopiedPasscode] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/superadmin/legacy/plans').then(r => r.data),
  });

  const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const generatePassword = () => {
    const pw = buildSecureCode(10);
    setForm({ ...form, password: pw });
    setShowPassword(true);
    toast.success('Strong password generated');
  };

  const resetPassword = () => { setForm({ ...form, password: '' }); setShowPassword(false); };

  const copyPassword = () => {
    if (!form.password) return;
    navigator.clipboard?.writeText(form.password).then(() => {
      setCopiedPw(true);
      setTimeout(() => setCopiedPw(false), 2000);
    });
  };

  const generatePasscode = () => {
    const code = buildSecureCode(7);
    setForm({ ...form, passcode: code });
    setShowPasscode(true);
    toast.success('Passkey generated');
  };

  const resetPasscode = () => { setForm({ ...form, passcode: '' }); setShowPasscode(false); };

  const copyPasscode = () => {
    if (!form.passcode) return;
    navigator.clipboard?.writeText(form.passcode).then(() => {
      setCopiedPasscode(true);
      setTimeout(() => setCopiedPasscode(false), 2000);
    });
  };

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const toggleModule = (id: string) =>
    setModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name || !form.admin_name || !form.admin_email || !form.password || !form.passcode) {
      toast.error('Fill company name, admin details, password and passcode');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (form.passcode.length < 6) {
      toast.error('Passcode must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/superadmin/tenants', {
        ...form,
        code: form.company_code,
        modules,
      });
      setCreated(res.data);
      toast.success('Tenant created successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const inputCls = "w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider";

  // ── Success screen: show credentials so the tenant admin can log into HRMS ──
  if (created) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <button onClick={() => navigate('/superadmin/tenants')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Back to Tenants
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Created!</h1>
          <p className="text-sm text-gray-500 mt-2">
            Organisation and admin account are ready. Share these credentials with the tenant admin so they can sign in to the HRMS app.
          </p>

          <div className="mt-8 text-left bg-slate-50 border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
              {[
                { label: 'Organisation', value: form.company_name },
                { label: 'Tenant ID', value: created.tenant_id },
                { label: 'Admin Email', value: created.admin_email || form.admin_email },
                { label: 'Password', value: form.password },
                { label: 'Passkey (Passcode)', value: form.passcode },
              ].map((row, i) => (
                <div key={i} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{row.label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{row.value}</p>
                  </div>
                  {typeof row.value === 'string' && (
                    <button onClick={() => copy(row.value)} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500" title="Copy">
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <a
            href={import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <ShieldCheck className="w-4 h-4" /> Open HRMS App & Sign In
          </a>
          <button
            onClick={() => { setCreated(null); setForm(initialForm); }}
            className="mt-3 block w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Create Another Tenant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Tenant</h1>
          <p className="text-sm text-gray-500 mt-1">Provision a new organisation and its admin account</p>
        </div>
        <button onClick={() => navigate('/superadmin/tenants')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
        {/* Organisation Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" /> Organisation Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Company Name *</label>
              <input value={form.company_name} onChange={update('company_name')} placeholder="e.g. Acme Tech India" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Created On *</label>
              <input value={fmtDate(clock)} readOnly className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`} title="Live system date (read-only)" />
            </div>
            <div>
              <label className={labelCls}>Created At *</label>
              <input value={fmtTime(clock)} readOnly className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`} title="Live system time (read-only)" />
            </div>
            <div>
              <label className={labelCls}>Company Code</label>
              <input value={form.company_code} onChange={update('company_code')} placeholder="e.g. ACME (optional)" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Industry</label>
              <input value={form.industry} onChange={update('industry')} placeholder="e.g. Technology" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Company Size</label>
              <select value={form.company_size} onChange={update('company_size')} className={inputCls}>
                <option>1-10</option><option>10-50</option><option>50-200</option>
                <option>200-500</option><option>500-1000</option><option>1000+</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Country *</label>
              <select value={form.country} onChange={update('country')} className={inputCls}>
                <option>India</option><option>United States</option><option>United Kingdom</option>
                <option>United Arab Emirates</option><option>Singapore</option><option>Canada</option>
                <option>Australia</option><option>Germany</option><option>Japan</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Plan *</label>
              <select value={form.plan_id} onChange={update('plan_id')} className={inputCls}>
                <option value="">Select a plan</option>
                {plans.map((plan: any) => (
                  <option key={plan.id} value={plan.id}>{plan.display_name} — Rs.{plan.price_monthly?.toLocaleString()}/mo</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Currency</label>
                <select value={form.default_currency} onChange={update('default_currency')} className={inputCls}>
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Timezone</label>
                <select value={form.timezone} onChange={update('timezone')} className={inputCls}>
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>PAN No.</label>
              <input value={form.pan_no} onChange={update('pan_no')} placeholder="e.g. AAACM1234F" className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">PAN of this organisation (required for Form 16)</p>
            </div>
            <div>
              <label className={labelCls}>TAN No.</label>
              <input value={form.tan_no} onChange={update('tan_no')} placeholder="e.g. BLRZ12345A" className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">Tax Deduction Account No. (required to file TDS &amp; issue Form 16)</p>
            </div>
            <div>
              <label className={labelCls}>GST No.</label>
              <input value={form.gst_no} onChange={update('gst_no')} placeholder="e.g. 27AAACM1234F1Z5" className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">GST registration number of this organisation</p>
            </div>
          </div>
        </div>

        {/* Admin Account */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" /> Tenant Admin Account
          </h2>
          <p className="text-xs text-gray-500 mb-4">This admin signs into the HRMS app and manages this organisation's workforce.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Admin Name *</label>
                <input value={form.admin_name} onChange={update('admin_name')} placeholder="e.g. Rahul Sharma" className={inputCls} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls}>Admin Email *</label>
                <input type="email" value={form.admin_email} onChange={update('admin_email')} placeholder="admin@company.com" className={inputCls} autoComplete="off" readOnly onFocus={(e) => e.target.removeAttribute('readonly')} />
              </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.admin_phone} onChange={update('admin_phone')} placeholder="+91 98765 43210" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Temporary Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder="Min 8 chars"
                  className={`${inputCls} pr-28`}
                  autoComplete="new-password"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-0.5">
                  {form.password ? (
                    <button type="button" onClick={resetPassword} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="Reset password">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={generatePassword} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Generate strong password">
                      <Wand2 className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={copyPassword} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Copy password">
                    {copiedPw ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Admin Passcode (Passkey) *</label>
              <div className="relative">
                <input
                  type={showPasscode ? 'text' : 'password'}
                  value={form.passcode}
                  onChange={update('passcode')}
                  placeholder="Passkey for secure login"
                  className={`${inputCls} pr-28`}
                  autoComplete="new-password"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-0.5">
                  {form.passcode ? (
                    <button type="button" onClick={resetPasscode} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="Reset passkey">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={generatePasscode} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Generate passkey">
                      <Wand2 className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => setShowPasscode(!showPasscode)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title={showPasscode ? 'Hide passkey' : 'Show passkey'}>
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={copyPasscode} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Copy passkey">
                    {copiedPasscode ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-500" /> Enabled Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MODULE_OPTIONS.map(m => {
              const active = modules.includes(m.id);
              const Icon = m.icon;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggleModule(m.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                  {active && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-blue-500" />}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-900/20"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Building2 className="w-5 h-5" />}
          {loading ? 'Creating tenant...' : 'Create Tenant & Admin Account'}
        </button>
      </form>
    </div>
  );
}
