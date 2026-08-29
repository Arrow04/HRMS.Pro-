import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Mail, Lock, Loader2, Eye, EyeOff, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Forgot password state
  const [showFp, setShowFp] = useState(false);
  const [fpStep, setFpStep] = useState<'verify' | 'code' | 'newpass'>('verify');
  const [fpEmail, setFpEmail] = useState('');
  const [fpPhone, setFpPhone] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');
  const [showFpNewPassword, setShowFpNewPassword] = useState(false);
  const [showFpConfirm, setShowFpConfirm] = useState(false);
  const [fpError, setFpError] = useState('');
  const [fpLoading, setFpLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Enter email and password'); return; }
    setLoading(true);
    try {
      await login(email, password);
      const stored = localStorage.getItem('user');
      const u = stored ? JSON.parse(stored) : user;
      if (u?.role === 'superadmin') {
        navigate('/superadmin');
      } else {
        toast.error('Access denied. Superadmin credentials required.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const openForgot = () => {
    setFpEmail('');
    setFpPhone('');
    setFpCode('');
    setFpStep('verify');
    setFpNewPassword('');
    setFpConfirm('');
    setFpError('');
    setShowFp(true);
  };

  const handleVerify = async () => {
    if (!fpEmail || !fpEmail.includes('@')) { setFpError('Enter a valid email address'); return; }
    if (!fpPhone || fpPhone.replace(/\D/g, '').length < 10) { setFpError('Enter a valid phone number'); return; }
    setFpLoading(true);
    setFpError('');
    try {
      await api.post('/auth/forgot-password-verify', { email: fpEmail, phone: fpPhone });
      // Code is emailed to the inbox — the user enters it on the next step.
      setFpStep('code');
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Verification failed');
    } finally {
      setFpLoading(false);
    }
  };

  const handleReset = async () => {
    if (!fpCode || fpCode.replace(/\D/g, '').length !== 6) { setFpError('Enter the 6-digit code from your email'); return; }
    if (fpNewPassword.length < 8) { setFpError('New password must be at least 8 characters'); return; }
    if (fpNewPassword !== fpConfirm) { setFpError('Passwords do not match'); return; }
    setFpLoading(true);
    setFpError('');
    try {
      await api.post('/auth/reset-password-basic', {
        email: fpEmail, phone: fpPhone, reset_token: fpCode, new_password: fpNewPassword,
      });
      toast.success('Password reset successfully. Please sign in.');
      setShowFp(false);
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md login-form">
      {/* Premium Glassmorphism Card */}
      <div className="relative">
        {/* Gradient border glow */}
        <div className="absolute -inset-[1px] rounded-[26px] bg-gradient-to-br from-blue-400/50 via-white/10 to-blue-400/40 blur-[2px] opacity-70" />

        <div className="relative overflow-hidden rounded-[26px] bg-[#0B1020]/60 backdrop-blur-2xl border border-white/10 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.7)]">
          {/* Decorative glows */}
          <div className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-blue-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-24 w-80 h-80 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 -left-16 w-40 h-40 rounded-full bg-indigo-400/10 blur-3xl" />

          {/* Top accent line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />

          <div className="relative p-7 md:p-9">
            {/* Brand Header */}
            <div className="text-center mb-8">
              <div className="relative inline-flex mb-4">
                <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-500 to-indigo-500 opacity-60 blur-md animate-pulse" />
                <div className="relative w-24 h-24 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-blue-900/40 border border-white/20">
                  <img src="/logo.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain animate-logo-spin" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight animate-brand-text-login">
                HRMS.Pro!
              </h1>
              <p className="text-blue-200/80 text-sm mt-1.5 font-medium">HRMS.Pro! is here — ready to serve every human resource management need.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-blue-200/90 mb-1.5">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-blue-300" />
                    </div>
                  </div>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full pl-14 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/90 mb-1.5">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-blue-300" />
                    </div>
                  </div>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full pl-14 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-300/50 hover:text-blue-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="group w-full relative overflow-hidden flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-500 hover:via-blue-500 hover:to-indigo-500 active:scale-[0.98] disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-blue-900/50">
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
              <div className="text-center">
                <button type="button" onClick={openForgot} className="text-sm text-blue-300 hover:text-blue-200 font-medium transition-colors">
                  Forgot password?
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showFp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowFp(false)}>
          <div className="fp-modal bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Reset Password</h3>
              <button onClick={() => setShowFp(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {fpError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="font-medium">{fpError}</p>
              </div>
            )}

            {fpStep === 'verify' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Enter your registered email and phone number to verify your identity.</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <input type="email" value={fpEmail} onChange={e => setFpEmail(e.target.value)} placeholder="you@company.com"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                  <input type="tel" value={fpPhone} onChange={e => setFpPhone(e.target.value.replace(/[^\d+]/g, ''))} placeholder="+91 98765 43210"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <button onClick={handleVerify} disabled={fpLoading}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-slate-300">
                  {fpLoading ? 'Verifying...' : 'Verify & Continue'}
                </button>
              </div>
            )}

            {fpStep === 'code' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">We sent a 6-digit code to <span className="font-semibold text-blue-600">{fpEmail}</span>. Enter it below.</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reset Code</label>
                  <input type="text" value={fpCode} onChange={e => setFpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-center tracking-[0.4em] text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <button onClick={() => setFpStep('newpass')} disabled={fpLoading || fpCode.replace(/\D/g, '').length !== 6}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-slate-300">
                  Continue
                </button>
                <button onClick={() => setFpStep('verify')} className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Back
                </button>
              </div>
            )}

            {fpStep === 'newpass' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Choose a new password for <span className="font-semibold text-blue-600">{fpEmail}</span>.</p>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                  <input type={showFpNewPassword ? 'text' : 'password'} value={fpNewPassword} onChange={e => setFpNewPassword(e.target.value)} placeholder="Min 8 characters"
                    className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  <button type="button" onClick={() => setShowFpNewPassword(v => !v)}
                    className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600">
                    {showFpNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                  <input type={showFpConfirm ? 'text' : 'password'} value={fpConfirm} onChange={e => setFpConfirm(e.target.value)} placeholder="Re-enter new password"
                    className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  <button type="button" onClick={() => setShowFpConfirm(v => !v)}
                    className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600">
                    {showFpConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <button onClick={handleReset} disabled={fpLoading}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-slate-300">
                  {fpLoading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button onClick={() => setFpStep('verify')} className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
