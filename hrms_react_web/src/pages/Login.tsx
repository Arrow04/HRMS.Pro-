import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, AlertCircle, Shield, Eye, EyeOff, Phone, ArrowRight, RefreshCw, X, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import type { AxiosError } from 'axios';
import api from '../services/api';

const Login = () => {
  const navigate = useNavigate();
  const { login, loginPasskey, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [attemptCount, setAttemptCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  
  // OTP Login State
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone' | 'passkey'>('email');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);
  const [otpTimer, setOtpTimer] = useState(0);

  // Passkey Login State
  const [passkeyId, setPasskeyId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [fpStep, setFpStep] = useState<'verify' | 'code' | 'newpass'>('verify');
  const [fpEmail, setFpEmail] = useState('');
  const [fpPhone, setFpPhone] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirmPassword, setFpConfirmPassword] = useState('');
  const [showFpNewPassword, setShowFpNewPassword] = useState(false);
  const [showFpConfirmPassword, setShowFpConfirmPassword] = useState(false);
  const [fpError, setFpError] = useState<string | null>(null);
  const [fpLoading, setFpLoading] = useState(false);

  // Redirect authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Load remembered email
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
    }
  }, []);

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const validatePassword = (value: string): boolean => {
    return value.length >= 6;
  };

  const getEmailError = (): string | null => {
    if (touched.email && !email.trim()) return 'Email is required';
    if (touched.email && !validateEmail(email)) return 'Please enter a valid email address';
    return null;
  };

  const getPasswordError = (): string | null => {
    if (touched.password && !password) return 'Password is required';
    if (touched.password && password.length < 6) return 'Password must be at least 6 characters';
    return null;
  };

  const isFormValid = (): boolean => {
    return validateEmail(email) && validatePassword(password);
  };

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!isFormValid()) {
        setTouched({ email: true, password: true });
        return;
      }

      if (isLocked) return;

      setError(null);
      setAttemptCount((prev) => prev + 1);

      try {
        await login(email.trim(), password);
        // Save email if user wants to be remembered
        if (email.trim()) {
          localStorage.setItem('rememberedEmail', email.trim());
        }
        navigate('/', { replace: true });
      } catch (err: unknown) {
        // Error logged

        const detail = (err as AxiosError<{ detail?: string }>).response?.data?.detail || '';
        if (detail.includes('locked') || detail.includes('Locked')) {
          setIsLocked(true);
          setError('Your account has been locked due to multiple failed attempts. Please contact your administrator.');
        } else if (detail.includes('inactive') || detail.includes('Inactiv')) {
          toast.error('Your account has been deactivated. Please contact your administrator.');
        } else {
          toast.error('Invalid email or password. Please try again.');
        }
      }
    },
    [email, password, login, navigate, isLocked]
  );

  const handlePasskeyLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!passkeyId.trim()) {
        toast.error('Please enter your email or phone number');
        return;
      }
      if (passcode.length < 6) {
        toast.error('Please enter your passkey');
        return;
      }

      if (isLocked) return;

      setError(null);
      setAttemptCount((prev) => prev + 1);

      try {
        await loginPasskey(passkeyId.trim(), passcode);
        navigate('/', { replace: true });
      } catch (err: unknown) {
        // Error logged

        const detail = (err as AxiosError<{ detail?: string }>).response?.data?.detail || '';
        if (detail.includes('locked') || detail.includes('Locked')) {
          setIsLocked(true);
          setError('Your account has been locked due to multiple failed attempts. Please contact your administrator.');
        } else if (detail.includes('inactive') || detail.includes('Inactiv')) {
          toast.error('Your account has been deactivated. Please contact your administrator.');
        } else {
          toast.error('Invalid email/phone or passkey. Please try again.');
        }
      }
    },
    [passkeyId, passcode, loginPasskey, navigate, isLocked]
  );

  const handleForgotPassword = useCallback(() => {
    setFpEmail('');
    setFpPhone('');
    setFpResetToken('');
    setFpCode('');
    setFpStep('verify');
    setFpNewPassword('');
    setFpConfirmPassword('');
    setFpError(null);
    setShowForgotPassword(true);
  }, []);

  // Forgot Password Handlers (verify → emailed code → new password)
  const handleVerifyIdentity = async () => {
    if (!fpEmail || !fpEmail.includes('@')) {
      setFpError('Please enter a valid email address');
      return;
    }
    if (!fpPhone || fpPhone.replace(/\D/g, '').length < 10) {
      setFpError('Please enter a valid phone number');
      return;
    }
    setFpLoading(true);
    setFpError(null);
    try {
      await api.post('/auth/forgot-password-verify', {
        email: fpEmail,
        phone: fpPhone,
      });
      // Code is emailed to the inbox — the user enters it on the next step.
      setFpStep('code');
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>;
      setFpError(e.response?.data?.detail || 'Verification failed');
    } finally {
      setFpLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!fpCode || fpCode.replace(/\D/g, '').length !== 6) {
      setFpError('Please enter the 6-digit code from your email');
      return;
    }
    if (fpNewPassword.length < 8) {
      setFpError('New password must be at least 8 characters');
      return;
    }
    if (fpNewPassword !== fpConfirmPassword) {
      setFpError('Passwords do not match');
      return;
    }
    setFpLoading(true);
    setFpError(null);
    try {
      await api.post('/auth/reset-password-basic', {
        email: fpEmail,
        phone: fpPhone,
        reset_token: fpCode,
        new_password: fpNewPassword,
      });
      toast.success('Password reset successfully. Please sign in.');
      setShowForgotPassword(false);
      setFpStep('verify');
      setFpCode('');
      setFpNewPassword('');
      setFpConfirmPassword('');
    } catch (err: unknown) {
      const e = err as AxiosError<{ detail?: string }>;
      setFpError(e.response?.data?.detail || 'Failed to reset password');
    } finally {
      setFpLoading(false);
    }
  };

  // OTP Handlers
  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setOtpLoading(true);

    try {
      const response = await api.post('/auth/send-otp', { phone });
      setOtpSent(true);
      setOtpExpiry(new Date(response.data.otpExpiry));
      toast.success('OTP sent to your phone');
    } catch (err: unknown) {
      toast.error((err as AxiosError<{ detail?: string }>).response?.data?.detail || 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setOtpLoading(true);

    try {
      const response = await api.post('/auth/verify-otp', { phone, otp });
      // Store token and redirect
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/', { replace: true });
    } catch (err: unknown) {
      toast.error((err as AxiosError<{ detail?: string }>).response?.data?.detail || 'Invalid OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOTP = () => {
    setOtpSent(false);
    setOtp('');
    handleSendOTP();
  };

  // OTP Timer
  useEffect(() => {
    if (otpExpiry && otpSent) {
      const interval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((otpExpiry.getTime() - now.getTime()) / 1000);
        if (diff <= 0) {
          setOtpTimer(0);
          clearInterval(interval);
        } else {
          setOtpTimer(diff);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [otpExpiry, otpSent]);

  // Lock out after 5 failed attempts
  const maxAttempts = 5;
  const remainingAttempts = Math.max(0, maxAttempts - attemptCount);

  return (
    <div className="w-full max-w-md login-form">
      {/* Premium Glassmorphism Card */}
      <div className="relative">
        {/* Gradient border glow */}
        <div className="absolute -inset-[1px] rounded-[26px] bg-gradient-to-br from-blue-400/50 via-white/10 to-purple-400/40 blur-[2px] opacity-70" />

        <div className="relative overflow-hidden rounded-[26px] bg-[#0B1220]/60 backdrop-blur-2xl border border-white/10 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.7)]">
          {/* Decorative glows */}
          <div className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-blue-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-24 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 -left-16 w-40 h-40 rounded-full bg-cyan-400/10 blur-3xl" />

          {/* Top accent line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />

          <div className="relative p-6 md:p-8">
            {/* Brand Header */}
            <div className="text-center mb-7">
              <div className="relative inline-flex mb-4">
                <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 opacity-60 blur-md animate-pulse" />
                <div className="relative w-24 h-24 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-indigo-900/40 border border-white/20">
                  <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain animate-logo-spin" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight animate-brand-text-login">
                HRMS.Pro!
              </h1>
              <p className="text-sm text-slate-400 mt-1.5 font-medium tracking-wide">HRMS.Pro! is here — ready to serve every human resource management need.</p>
            </div>

          {/* Login Method Toggle */}
          <div className="relative flex gap-2 mb-6 bg-white/5 border border-white/10 p-1 rounded-xl">
            {/* Sliding indicator */}
            <span
              className="absolute top-1 bottom-1 rounded-lg bg-white/90 shadow-sm transition-all duration-500 ease-out"
              style={{
                width: 'calc((100% - 1.5rem) / 3)',
                left: loginMethod === 'email' ? '0.25rem' : loginMethod === 'phone' ? 'calc((100% - 1.5rem) / 3 + 0.75rem)' : 'calc(((100% - 1.5rem) / 3) * 2 + 1.25rem)',
              }}
            />
            <button
              onClick={() => { setLoginMethod('email'); setError(null); }}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                loginMethod === 'email' ? 'text-blue-700' : 'text-white/70 hover:text-white'
              }`}
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
            <button
              onClick={() => { setLoginMethod('phone'); setError(null); }}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                loginMethod === 'phone' ? 'text-blue-700' : 'text-white/70 hover:text-white'
              }`}
            >
              <Phone className="w-4 h-4" />
              Phone OTP
            </button>
            <button
              onClick={() => { setLoginMethod('passkey'); setError(null); }}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                loginMethod === 'passkey' ? 'text-blue-700' : 'text-white/70 hover:text-white'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Passkey
            </button>
          </div>

          {/* Account Locked Alert */}
          {isLocked && (
            <div className="mb-6 p-4 bg-red-500/15 border border-red-400/30 rounded-xl flex items-start gap-3 text-red-200 text-sm backdrop-blur">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

                    {/* Forms Area — all forms share one grid cell; the tallest (Email) sets the card height */}
          <div className="grid">
          <form onSubmit={handleLogin} className={`space-y-5 [grid-area:1/1] flex flex-col justify-center transition-all duration-500 ease-out ${loginMethod === 'email' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`} aria-hidden={loginMethod !== 'email'}>
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-white/80 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-blue-300" />
                    </div>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    onBlur={() => setTouched({ ...touched, email: true })}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={isLoading || isLocked}
                    className={`w-full pl-14 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur disabled:bg-white/5 disabled:cursor-not-allowed ${
                      touched.email && getEmailError() ? 'border-red-400/60' : ''
                    }`}
                  />
                </div>
                {touched.email && getEmailError() && (
                  <p className="mt-1 text-xs text-red-300">{getEmailError()}</p>
                )}
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-white/80 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-indigo-300" />
                    </div>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    onBlur={() => setTouched({ ...touched, password: true })}
                    placeholder="Enter your password"
                    minLength={6}
                    autoComplete="current-password"
                    disabled={isLoading || isLocked}
                    className={`w-full pl-14 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur disabled:bg-white/5 disabled:cursor-not-allowed ${
                      touched.password && getPasswordError() ? 'border-red-400/60' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading || isLocked}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white/80 disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {touched.password && getPasswordError() && (
                  <p className="mt-1 text-xs text-red-300">{getPasswordError()}</p>
                )}
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-white/30 bg-white/10 text-blue-500 focus:ring-blue-400 cursor-pointer accent-blue-500"
                    defaultChecked={!!localStorage.getItem('rememberedEmail')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        localStorage.setItem('rememberedEmail', email);
                      } else {
                        localStorage.removeItem('rememberedEmail');
                      }
                    }}
                    disabled={isLoading || isLocked}
                  />
                  <span className="text-sm text-white/80">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading || isLocked}
                  className="text-sm text-blue-300 hover:text-blue-200 font-medium disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>

              {/* Attempt Counter */}
              {attemptCount > 0 && attemptCount < maxAttempts && (
                <p className="text-xs text-white/50 text-center">
                  {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining
                </p>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || isLocked || !isFormValid()}
                className="group w-full relative overflow-hidden flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 active:scale-[0.98] disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:hover:from-white/10 disabled:hover:to-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/50"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span className="relative">Sign In</span>
                )}
              </button>
            </form>
          <form onSubmit={handlePasskeyLogin} className={`space-y-5 [grid-area:1/1] flex flex-col justify-center transition-all duration-500 ease-out ${loginMethod === 'passkey' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`} aria-hidden={loginMethod !== 'passkey'}>
              {/* Identifier Input */}
              <div>
                <label htmlFor="passkeyId" className="block text-sm font-semibold text-white/80 mb-1.5">
                  Email or Phone
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
                      <KeyRound className="w-4 h-4 text-blue-300" />
                    </div>
                  </div>
                  <input
                    id="passkeyId"
                    type="text"
                    value={passkeyId}
                    onChange={(e) => {
                      setPasskeyId(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@company.com or +91 98765 43210"
                    autoComplete="username"
                    disabled={isLoading || isLocked}
                    className="w-full pl-14 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur disabled:bg-white/5 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Passkey Input */}
              <div>
                <label htmlFor="passcode" className="block text-sm font-semibold text-white/80 mb-1.5">
                  Passkey
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-indigo-300" />
                    </div>
                  </div>
                  <input
                    id="passcode"
                    type={showPasscode ? 'text' : 'password'}
                    value={passcode}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter your 7-character passkey"
                    maxLength={7}
                    autoComplete="one-time-code"
                    disabled={isLoading || isLocked}
                    className="w-full pl-14 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur disabled:bg-white/5 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    disabled={isLoading || isLocked}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white/80 disabled:opacity-50"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-white/40">Use the passkey assigned to you by your administrator.</p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || isLocked || !passkeyId.trim() || passcode.length < 6}
                className="group w-full relative overflow-hidden flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 active:scale-[0.98] disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:hover:from-white/10 disabled:hover:to-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/50"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span className="relative flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    Sign In with Passkey
                  </span>
                )}
              </button>
            </form>
          <div className={`space-y-5 [grid-area:1/1] flex flex-col justify-center transition-all duration-500 ease-out ${loginMethod === 'phone' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`} aria-hidden={loginMethod !== 'phone'}>
{/* Phone Input */}
                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold text-white/80 mb-1.5">
                      Phone Number
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
                          <Phone className="w-4 h-4 text-blue-300" />
                        </div>
                      </div>
                      <input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          setError(null);
                        }}
                        placeholder="+91 98765 43210"
                        disabled={otpLoading}
                        className="w-full pl-14 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/60 focus:bg-white/[0.07] transition-all text-sm backdrop-blur disabled:bg-white/5 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Send OTP / Resend OTP (same slot so card height never changes) */}
                  <button
                    onClick={otpSent ? handleResendOTP : handleSendOTP}
                    disabled={otpLoading}
                    className="group w-full relative overflow-hidden flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 active:scale-[0.98] disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:hover:from-white/10 disabled:hover:to-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/50"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    {otpLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : otpSent ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Resend OTP</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        <span>Send OTP</span>
                      </>
                    )}
                  </button>

                  {/* OTP Input */}
                  <div>
                    <label htmlFor="otp" className="block text-sm font-semibold text-white/80 mb-1.5">
                      Enter OTP
                    </label>
                    <div className="relative">
                      <input
                        id="otp"
                        type="text"
                        value={otp}
                        onChange={(e) => {
                          setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setError(null);
                        }}
                        placeholder="123456"
                        maxLength={6}
                        disabled={otpLoading}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/60 focus:bg-white/[0.07] transition-all text-sm text-center text-2xl tracking-widest backdrop-blur disabled:bg-white/5 disabled:cursor-not-allowed"
                      />
                    </div>
                    {otpTimer > 0 && (
                      <p className="mt-2 text-xs text-white/50 text-center">
                        OTP expires in {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, '0')}
                      </p>
                    )}
                  </div>

                  {/* Verify OTP Button */}
                  <button
                    onClick={handleVerifyOTP}
                    disabled={otpLoading || otp.length !== 6}
                    className="group w-full relative overflow-hidden flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 active:scale-[0.98] disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:hover:from-white/10 disabled:hover:to-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/50"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    {otpLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        <span>Verify & Login</span>
                      </>
                    )}
                  </button>
            </div>
          </div>{/* end forms area */}
          </div>{/* end relative p-6 wrapper */}
        </div>{/* end glass card */}
      </div>{/* end outer relative wrapper */}

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForgotPassword(false)}>
            <div className="fp-modal bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Reset Password</h3>
                <button onClick={() => setShowForgotPassword(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
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
                    <input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={fpPhone}
                      onChange={(e) => setFpPhone(e.target.value.replace(/[^\d+]/g, ''))}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <button
                    onClick={handleVerifyIdentity}
                    disabled={fpLoading}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {fpLoading ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </div>
              )}

              {fpStep === 'code' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    We sent a 6-digit code to <span className="font-semibold text-blue-600">{fpEmail}</span>. Enter it below.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reset Code</label>
                    <input
                      type="text"
                      value={fpCode}
                      onChange={(e) => setFpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-center tracking-[0.4em] text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <button
                    onClick={() => setFpStep('newpass')}
                    disabled={fpLoading || fpCode.replace(/\D/g, '').length !== 6}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-slate-300"
                  >
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
                    <input
                      type={showFpNewPassword ? 'text' : 'password'}
                      value={fpNewPassword}
                      onChange={(e) => setFpNewPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFpNewPassword(v => !v)}
                      className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600"
                    >
                      {showFpNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type={showFpConfirmPassword ? 'text' : 'password'}
                      value={fpConfirmPassword}
                      onChange={(e) => setFpConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFpConfirmPassword(v => !v)}
                      className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600"
                    >
                      {showFpConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    onClick={handleResetPassword}
                    disabled={fpLoading}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-slate-300"
                  >
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
};

export default Login;