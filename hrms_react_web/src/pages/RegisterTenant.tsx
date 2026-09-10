import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, User, Mail, Lock, Phone, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const RegisterTenant = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: '',
    adminName: '',
    adminEmail: '',
    password: '',
    phone: '',
    industry: '',
    companySize: '',
  });
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/register-tenant', form);
      toast.success('Organisation registered successfully. Your account is pending approval.');
      navigate('/login');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      toast.error(e.response?.data?.detail || e.response?.data?.message || e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-4 py-2.5 bg-white border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-transparent transition-all";
  const labelCls = "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider";

  return (
    <div className="w-full max-w-lg">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-200/40 mb-3">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Register your Organisation</h1>
        <p className="text-sm text-slate-500 mt-1">Create a new workspace for your company</p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Company Name *</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input className={`${inputCls} pl-10`} value={form.companyName} onChange={update('companyName')} placeholder="Acme Corporation" />
            </div>
            <p className="mt-1 text-xs text-gray-400">Official company / organisation legal name</p>
          </div>

          <div>
            <label className={labelCls}>Admin Name *</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input className={`${inputCls} pl-10`} value={form.adminName} onChange={update('adminName')} placeholder="John Doe" />
            </div>
            <p className="mt-1 text-xs text-gray-400">Full name of the administrator account</p>
          </div>

          <div>
            <label className={labelCls}>Admin Email *</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input type="email" className={`${inputCls} pl-10`} value={form.adminEmail} onChange={update('adminEmail')} placeholder="admin@company.com" />
            </div>
            <p className="mt-1 text-xs text-gray-400">Work email used to sign in — must be valid</p>
          </div>

          <div>
            <label className={labelCls}>Password *</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input type="password" className={`${inputCls} pl-10`} value={form.password} onChange={update('password')} placeholder="Min 8 characters" />
            </div>
            <p className="mt-1 text-xs text-gray-400">Min 8 characters with letters and numbers</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                <input className={`${inputCls} pl-10`} value={form.phone} onChange={update('phone')} placeholder="+91 98765 43210" />
              </div>
              <p className="mt-1 text-xs text-gray-400">10-digit mobile with country code</p>
            </div>
            <div>
              <label className={labelCls}>Company Size</label>
              <select className={inputCls} value={form.companySize} onChange={update('companySize')}>
                <option value="">Select size</option>
                <option value="1-50">1-50 employees</option>
                <option value="50-200">50-200 employees</option>
                <option value="200-1000">200-1000 employees</option>
                <option value="1000+">1000+ employees</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">Approximate number of employees</p>
            </div>
          </div>

          <div>
            <label className={labelCls}>Industry</label>
            <input className={inputCls} value={form.industry} onChange={update('industry')} placeholder="e.g. IT Services, Manufacturing, Healthcare" />
            <p className="mt-1 text-xs text-gray-400">Sector or industry of the company</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold text-sm hover:from-blue-500 hover:to-blue-400 transition-all duration-200 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loading ? 'Registering...' : 'Register Organisation'}
          </button>
        </form>

        <Link to="/login" className="flex items-center justify-center gap-2 mt-5 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to Login
        </Link>
      </div>
    </div>
  );
};

export default RegisterTenant;
