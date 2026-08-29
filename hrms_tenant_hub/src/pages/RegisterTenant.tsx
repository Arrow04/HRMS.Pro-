import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Mail, Lock, User, Globe, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function RegisterTenant() {
  const [form, setForm] = useState({ company_name: '', admin_name: '', admin_email: '', password: '', industry: '', company_size: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name || !form.admin_name || !form.admin_email || !form.password) {
      toast.error('Fill all required fields');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register-tenant', form);
      toast.success('Registration submitted for approval');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Register Your Organisation</h1>
                <p className="text-blue-200 text-sm mt-1">Get started with HRMS.Pro!</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input value={form.company_name} onChange={e => setForm(f => ({...f, company_name: e.target.value}))}
              placeholder="Company Name *"
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.admin_name} onChange={e => setForm(f => ({...f, admin_name: e.target.value}))}
                placeholder="Admin Name *"
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.industry} onChange={e => setForm(f => ({...f, industry: e.target.value}))}
                placeholder="Industry"
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <input value={form.admin_email} onChange={e => setForm(f => ({...f, admin_email: e.target.value}))}
              type="email" placeholder="Admin Email *"
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))}
              type="password" placeholder="Password *"
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={form.company_size} onChange={e => setForm(f => ({...f, company_size: e.target.value}))}
              placeholder="Company Size (e.g. 10-50)"
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? 'Submitting...' : 'Register'}
            </button>
          </form>

          <p className="text-center text-blue-200 text-sm mt-6">
            Already have an account? <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
