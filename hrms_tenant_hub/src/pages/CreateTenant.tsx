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

const inputCls = "w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all";
const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text-primary)',
  borderRadius: '0.75rem',
  padding: '0.625rem 1rem',
  fontSize: '0.875rem',
  width: '100%',
};

const labelCls = "block text-xs font-semibold mb-1.5 uppercase tracking-wider";

export default function CreateTenant() {
  const [form, setForm] = useState(initialForm);
  const [modules, setModules] = useState<string[]>(MODULE_OPTIONS.map(m => m.id));
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
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
    if (!submitted) {
      setSubmitted(true);
    }
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
      const payload: Record<string, unknown> = {
        ...form,
        code: form.company_code,
        modules,
      };
      const numericPlanId = Number(form.plan_id);
      if (numericPlanId > 0) {
        payload.plan_id = numericPlanId;
      }
      const res = await api.post('/superadmin/tenants', payload);
      setCreated(res.data);
      toast.success('Tenant created successfully');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail) {
        toast.error(Array.isArray(detail) ? detail.map((x: any) => x.msg || JSON.stringify(x)).join(', ') : detail);
      } else {
        toast.error('Failed to create tenant');
      }
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  if (created) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6 animate-page-enter">
        <button onClick={() => navigate('/superadmin/tenants')} className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary-blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
          <ArrowLeft className="w-4 h-4" /> Back to Tenants
        </button>

        <div className="card card-body p-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--success-bg)' }}>
            <CheckCircle2 className="w-9 h-9" style={{ color: 'var(--success-text)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Tenant Created!</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            Organisation and admin account are ready. Share these credentials with the tenant admin so they can sign in to the HRMS app.
          </p>

          <div className="mt-8 text-left rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-color)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: 'var(--border-color)' }}>
              {[
                { label: 'Organisation', value: form.company_name },
                { label: 'Tenant ID', value: created.tenant_id },
                { label: 'Admin Email', value: created.admin_email || form.admin_email },
                { label: 'Password', value: form.password },
                { label: 'Passkey (Passcode)', value: form.passcode },
              ].map((row, i) => (
                <div key={i} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{row.label}</p>
                    <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{row.value}</p>
                  </div>
                  {typeof row.value === 'string' && (
                    <button onClick={() => copy(row.value)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} title="Copy">
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <a
            href={import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'}
            className="mt-6 inline-flex items-center gap-2 btn-primary px-6 py-3 font-semibold"
          >
            <ShieldCheck className="w-4 h-4" /> Open HRMS App & Sign In
          </a>
          <button
            onClick={() => { setCreated(null); setForm(initialForm); }}
            className="mt-3 block w-full text-sm font-medium transition-colors"
            style={{ color: 'var(--primary-blue)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary-blue)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--primary-blue)')}
          >
            + Create Another Tenant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Create Tenant</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Provision a new organisation and its admin account</p>
        </div>
        <button onClick={() => navigate('/superadmin/tenants')} className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary-blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
        <div className="card card-body">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Building2 className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Organisation Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Company Name *</label>
              <input value={form.company_name} onChange={update('company_name')} placeholder="e.g. Acme Tech India" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Created On *</label>
              <input value={fmtDate(clock)} readOnly className={`${inputCls} cursor-not-allowed`} title="Live system date (read-only)"
                style={{ ...inputStyle, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Created At *</label>
              <input value={fmtTime(clock)} readOnly className={`${inputCls} cursor-not-allowed`} title="Live system time (read-only)"
                style={{ ...inputStyle, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Company Code</label>
              <input value={form.company_code} onChange={update('company_code')} placeholder="e.g. ACME (optional)" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Industry</label>
              <input value={form.industry} onChange={update('industry')} placeholder="e.g. Technology" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Company Size</label>
              <select value={form.company_size} onChange={update('company_size')} className={inputCls} style={inputStyle}>
                <option>1-10</option><option>10-50</option><option>50-200</option>
                <option>200-500</option><option>500-1000</option><option>1000+</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Country *</label>
              <select value={form.country} onChange={update('country')} className={inputCls} style={inputStyle}>
                <option>India</option><option>United States</option><option>United Kingdom</option>
                <option>United Arab Emirates</option><option>Singapore</option><option>Canada</option>
                <option>Australia</option><option>Germany</option><option>Japan</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Plan *</label>
              <select value={form.plan_id} onChange={update('plan_id')} className={inputCls} style={inputStyle}>
                <option value="">Select a plan</option>
                {plans.map((plan: any) => (
                  <option key={plan.id} value={plan.id}>{plan.display_name} - Rs.{plan.price_monthly?.toLocaleString()}/mo</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={{ color: 'var(--text-label)' }}>Currency</label>
                <select value={form.default_currency} onChange={update('default_currency')} className={inputCls} style={inputStyle}>
                  <option value="INR">INR</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--text-label)' }}>Timezone</label>
                <select value={form.timezone} onChange={update('timezone')} className={inputCls} style={inputStyle}>
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>PAN No.</label>
              <input value={form.pan_no} onChange={update('pan_no')} placeholder="e.g. AAACM1234F" className={inputCls} style={inputStyle} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>PAN of this organisation (required for Form 16)</p>
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>TAN No.</label>
              <input value={form.tan_no} onChange={update('tan_no')} placeholder="e.g. BLRZ12345A" className={inputCls} style={inputStyle} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Tax Deduction Account No. (required to file TDS &amp; issue Form 16)</p>
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>GST No.</label>
              <input value={form.gst_no} onChange={update('gst_no')} placeholder="e.g. 27AAACM1234F1Z5" className={inputCls} style={inputStyle} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>GST registration number of this organisation</p>
            </div>
          </div>
        </div>

        <div className="card card-body">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <User className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Tenant Admin Account
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>This admin signs into the HRMS app and manages this organisation's workforce.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls} style={{ color: 'var(--text-label)' }}>Admin Name *</label>
                <input value={form.admin_name} onChange={update('admin_name')} placeholder="e.g. Rahul Sharma" className={inputCls} style={inputStyle} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--text-label)' }}>Admin Email *</label>
                <input type="email" value={form.admin_email} onChange={update('admin_email')} placeholder="admin@company.com" className={inputCls} style={inputStyle} autoComplete="off" readOnly onFocus={(e) => e.target.removeAttribute('readonly')} />
              </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Phone</label>
              <input value={form.admin_phone} onChange={update('admin_phone')} placeholder="+91 98765 43210" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Temporary Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder="Min 8 chars"
                  className={`${inputCls} pr-28`}
                  style={inputStyle}
                  autoComplete="new-password"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-0.5">
                  {form.password ? (
                    <button type="button" onClick={resetPassword} className="p-1.5 rounded-lg transition-colors"
                      style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }} title="Reset password">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={generatePassword} className="p-1.5 rounded-lg transition-colors"
                      style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)' }} title="Generate strong password">
                      <Wand2 className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} title={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={copyPassword} className="p-1.5 rounded-lg transition-colors"
                    style={{ color: copiedPw ? 'var(--success-text)' : 'var(--text-tertiary)' }}
                    onMouseEnter={e => { if (!copiedPw) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { if (!copiedPw) e.currentTarget.style.background = 'transparent'; }} title="Copy password">
                    {copiedPw ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Admin Passcode (Passkey) *</label>
              <div className="relative">
                <input
                  type={showPasscode ? 'text' : 'password'}
                  value={form.passcode}
                  onChange={update('passcode')}
                  placeholder="Passkey for secure login"
                  className={`${inputCls} pr-28`}
                  style={inputStyle}
                  autoComplete="new-password"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-0.5">
                  {form.passcode ? (
                    <button type="button" onClick={resetPasscode} className="p-1.5 rounded-lg transition-colors"
                      style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }} title="Reset passkey">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={generatePasscode} className="p-1.5 rounded-lg transition-colors"
                      style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)' }} title="Generate passkey">
                      <Wand2 className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => setShowPasscode(!showPasscode)} className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} title={showPasscode ? 'Hide passkey' : 'Show passkey'}>
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={copyPasscode} className="p-1.5 rounded-lg transition-colors"
                    style={{ color: copiedPasscode ? 'var(--success-text)' : 'var(--text-tertiary)' }}
                    onMouseEnter={e => { if (!copiedPasscode) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { if (!copiedPasscode) e.currentTarget.style.background = 'transparent'; }} title="Copy passkey">
                    {copiedPasscode ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card card-body">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Enabled Modules
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
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    borderColor: active ? 'var(--primary-blue)' : 'var(--border-color)',
                    background: active ? 'var(--active-blue-bg)' : 'transparent',
                    color: active ? 'var(--primary-blue)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--primary-blue)' : 'var(--border-color)'}`,
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                  {active && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" style={{ color: 'var(--primary-blue)' }} />}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed py-3.5 font-semibold"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Building2 className="w-5 h-5" />}
          {loading ? 'Creating tenant...' : 'Create Tenant & Admin Account'}
        </button>
      </form>
    </div>
  );
}
