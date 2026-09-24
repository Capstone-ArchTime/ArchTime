import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'motion/react';
import { App } from 'antd';
import { Logo } from '@/components/Logo';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fontFamily = {
  sans: '"Space Grotesk", sans-serif',
  mono: '"JetBrains Mono", monospace',
};

type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword', string>>;

const AuthPage: React.FC = () => {
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const { message } = App.useApp();

  // Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Reset states when switching mode
  useEffect(() => {
    setFieldErrors({});
    setIsLoading(false);
  }, [isRegister]);

  const calculatePasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length > 8) score += 1;
    if (pass.match(/[A-Z]/)) score += 1;
    if (pass.match(/[0-9]/)) score += 1;
    if (pass.match(/[^A-Za-z0-9]/)) score += 1;
    return score; // 0 to 4
  };

  const strength = calculatePasswordStrength(password);
  const strengthColors = ['bg-[#5f636b]', 'bg-red-500', 'bg-[#ffb03a]', 'bg-[#38bdf8]', 'bg-[#00f0ff]'];
  const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (isRegister && !name.trim()) {
      errors.name = 'Full name is required.';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (isRegister && strength < 3) {
      errors.password = 'Password is too weak. Add uppercase, a number, or a symbol.';
    }

    if (isRegister) {
      if (!confirmPassword) {
        errors.confirmPassword = 'Please confirm your password.';
      } else if (password !== confirmPassword) {
        errors.confirmPassword = 'Passwords do not match.';
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      message.error(Object.values(errors)[0]);
      return;
    }

    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      message.success(isRegister ? 'Account created successfully.' : 'Signed in successfully.');
    }, 1500);
  };

  return (
    <div
      className="min-h-screen md:h-screen bg-[#080b0e] text-slate-200 flex flex-col md:flex-row md:overflow-hidden selection:bg-[#f59e0b] selection:text-[#080b0e]"
      style={{ fontFamily: fontFamily.sans }}
    >

      {/* Left Panel - Authentication */}
      <div className="w-full md:w-[40%] flex flex-col relative z-10 bg-[#080b0e] border-b md:border-b-0 md:border-r border-[#222c37] shadow-2xl md:h-screen md:overflow-hidden">

        <div className="flex-1 flex flex-col p-6 lg:p-10 xl:px-12 xl:py-8 max-w-xl w-full mx-auto justify-between">

          {/* Header & Logo */}
          <Logo tagline="Architecture Evolution Observatory" className="mb-8 shrink-0" />

          {/* Mobile-only compact value prop (Right Panel's content is md:flex only) */}
          <div className="md:hidden mb-8 shrink-0 border border-[#222c37] bg-[#11161b]/60 p-4">
            <p className="text-lg font-bold tracking-tight text-white leading-snug">
              Understand how your architecture{" "}
              <span
                className="bg-gradient-to-r from-[#38bdf8] via-[#ffb03a] to-[#f59e0b] bg-clip-text text-transparent"
                style={{ fontFamily: fontFamily.mono }}
              >
                evolves.
              </span>
            </p>
            <p className="mt-1.5 text-xs text-slate-400 font-light leading-relaxed">
              Reconstruct architectural changes from Git history and dependency graphs, backed by concrete repository evidence.
            </p>
          </div>

          {/* Form Area */}
          <div className="flex-1 flex flex-col justify-center">
            
            <AnimatePresence mode="wait">
              <motion.div
                key={isRegister ? 'register' : 'login'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="mb-8">
                  <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
                    {isRegister ? 'Create your ArchTime account' : 'Welcome back'}
                  </h2>
                  <p className="text-slate-400 text-sm font-light">
                    {isRegister
                      ? 'Start reconstructing and understanding your architecture history.'
                      : 'Trace how your software architecture evolves.'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-4">

                  {isRegister && (
                    <div className="space-y-1.5">
                      <label htmlFor="auth-name" className="text-[11px] text-slate-400 uppercase tracking-widest block" style={{ fontFamily: fontFamily.mono }}>Full name</label>
                      <div className="relative group">
                        <input
                          id="auth-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          disabled={isLoading}
                          placeholder="Jane Doe"
                          aria-invalid={!!fieldErrors.name}
                          aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
                          className={`w-full h-11 bg-[#11161b] border pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors disabled:opacity-50 ${
                            fieldErrors.name ? 'border-red-500/60 focus:border-red-500' : 'border-[#222c37] focus:border-[#38bdf8]'
                          }`}
                        />
                        <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#38bdf8] transition-colors" />
                      </div>
                      {fieldErrors.name && (
                        <p id="auth-name-error" role="alert" className="text-xs text-red-400">{fieldErrors.name}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="auth-email" className="text-[11px] text-slate-400 uppercase tracking-widest block" style={{ fontFamily: fontFamily.mono }}>Email address</label>
                    <div className="relative group">
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        placeholder="developer@archtime.io"
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                        className={`w-full h-11 bg-[#11161b] border pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors disabled:opacity-50 ${
                          fieldErrors.email ? 'border-red-500/60 focus:border-red-500' : 'border-[#222c37] focus:border-[#38bdf8]'
                        }`}
                      />
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#38bdf8] transition-colors" />
                    </div>
                    {fieldErrors.email && (
                      <p id="auth-email-error" role="alert" className="text-xs text-red-400">{fieldErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="auth-password" className="text-[11px] text-slate-400 uppercase tracking-widest block" style={{ fontFamily: fontFamily.mono }}>Password</label>
                      {!isRegister && (
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Coming soon"
                          className="text-xs text-slate-600 cursor-not-allowed"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <input
                        id="auth-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        placeholder="••••••••••••••••"
                        aria-invalid={!!fieldErrors.password}
                        aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                        className={`w-full h-11 bg-[#11161b] border pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors tracking-wide disabled:opacity-50 ${
                          fieldErrors.password ? 'border-red-500/60 focus:border-red-500' : 'border-[#222c37] focus:border-[#38bdf8]'
                        }`}
                      />
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#38bdf8] transition-colors" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none focus-visible:text-[#38bdf8]"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {fieldErrors.password && (
                      <p id="auth-password-error" role="alert" className="text-xs text-red-400">{fieldErrors.password}</p>
                    )}

                    {/* Password Strength Indicator */}
                    {isRegister && password.length > 0 && (
                      <div className="mt-2">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map((level) => (
                            <div
                              key={level}
                              className={`h-1 flex-1 transition-colors duration-300 ${strength >= level ? strengthColors[strength] : 'bg-[#222c37]'}`}
                            ></div>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{strengthLabels[strength]}</p>
                      </div>
                    )}
                  </div>

                  {isRegister && (
                    <div className="space-y-1.5">
                      <label htmlFor="auth-confirm-password" className="text-[11px] text-slate-400 uppercase tracking-widest block" style={{ fontFamily: fontFamily.mono }}>Confirm password</label>
                      <div className="relative group">
                        <input
                          id="auth-confirm-password"
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={isLoading}
                          placeholder="••••••••••••••••"
                          aria-invalid={!!fieldErrors.confirmPassword}
                          aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-password-error' : undefined}
                          className={`w-full h-11 bg-[#11161b] border pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors tracking-wide disabled:opacity-50 ${
                            fieldErrors.confirmPassword ? 'border-red-500/60 focus:border-red-500' : 'border-[#222c37] focus:border-[#38bdf8]'
                          }`}
                        />
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#38bdf8] transition-colors" />
                      </div>
                      {fieldErrors.confirmPassword && (
                        <p id="auth-confirm-password-error" role="alert" className="text-xs text-red-400">{fieldErrors.confirmPassword}</p>
                      )}
                    </div>
                  )}

                  {!isRegister && (
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <input
                        type="checkbox"
                        id="remember"
                        className="w-3.5 h-3.5 border-[#222c37] bg-[#11161b] text-[#38bdf8] focus:ring-[#38bdf8] focus:ring-offset-0 focus:ring-offset-[#080b0e] cursor-pointer"
                      />
                      <label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer select-none">Remember this browser session</label>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 bg-[#38bdf8] hover:bg-[#00f0ff] text-[#080b0e] font-bold uppercase tracking-widest text-xs mt-6 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none"
                    style={{ fontFamily: fontFamily.mono }}
                  >
                    {isLoading ? (
                      <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
                    ) : (
                      isRegister ? 'Create account' : 'Sign in'
                    )}
                  </button>
                </form>

                <div className="flex items-center gap-4 my-6 opacity-70">
                  <div className="h-[1px] flex-1 bg-[#222c37]"></div>
                  <span className="text-xs text-slate-500 uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>or</span>
                  <div className="h-[1px] flex-1 bg-[#222c37]"></div>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  className="w-full h-11 flex items-center justify-center gap-3 px-4 bg-[#11161b] hover:bg-[#161d24] border border-[#222c37] transition-colors text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-[#38bdf8]"
                >
                  <Icon icon="mdi:github" width="18" height="18" />
                  Continue with GitHub
                </button>

                {/* Account Toggle */}
                <div className="mt-8 text-center text-sm text-slate-500">
                  {isRegister ? (
                    <>
                      Already have an account?{' '}
                      <Link to="/login" className="text-[#38bdf8] hover:text-[#00f0ff] transition-colors font-medium">
                        Sign in &rarr;
                      </Link>
                    </>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <Link to="/register" className="text-[#38bdf8] hover:text-[#00f0ff] transition-colors font-medium">
                        Create account &rarr;
                      </Link>
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer (SOC-2) */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 shrink-0 mt-auto pt-6" style={{ fontFamily: fontFamily.mono }}>
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <Lock size={12} className="text-[#38bdf8]" />
              <span>SOC-2 & Git AST Grounded</span>
            </div>
            <div className="flex gap-4" aria-label="Coming soon">
              <span className="cursor-not-allowed opacity-60" aria-disabled="true" title="Coming soon">Docs</span>
              <span>•</span>
              <span className="cursor-not-allowed opacity-60" aria-disabled="true" title="Coming soon">API Keys</span>
              <span>•</span>
              <span className="cursor-not-allowed opacity-60" aria-disabled="true" title="Coming soon">Security</span>
            </div>
          </div>

        </div>
      </div>

      {/* Right Panel - Product Visual */}
      <div className="flex-1 hidden md:flex flex-col relative z-0 p-6 lg:p-10 xl:px-12 xl:py-8 h-screen overflow-hidden">
        
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        
        <div className="relative z-10 h-full flex flex-col justify-between max-w-4xl mx-auto w-full">
          
          {/* Header Content */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#11161b]/80 border border-[#222c37] backdrop-blur-sm mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]"></div>
              <span className="text-[10px] text-[#38bdf8] tracking-wider font-semibold" style={{ fontFamily: fontFamily.mono }}>ARCHTIME OBSERVATORY</span>
            </div>

            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4 leading-[1.1]">
              Understand how your<br />architecture{" "}
              <span
                className="bg-gradient-to-r from-[#38bdf8] via-[#ffb03a] to-[#f59e0b] bg-clip-text text-transparent"
                style={{ fontFamily: fontFamily.mono }}
              >
                evolves.
              </span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-xl font-light">
              Reconstruct architectural changes from Git history, dependency graphs and concrete repository evidence.
            </p>
          </div>

          {/* Architectural Visualization */}
          <div className="flex-1 my-4 relative flex flex-col w-full min-h-0">
            <div className="w-full h-full relative border border-[#222c37] bg-[#080b0e] overflow-hidden flex flex-col p-6 shadow-2xl">

              {/* Top Header of Diagram */}
              <div className="flex justify-between items-center z-20 mb-8" style={{ fontFamily: fontFamily.mono }}>
                <div className="flex items-center gap-2">
                  <div className="text-[#38bdf8] flex items-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </div>
                  <span className="text-sm text-slate-500 font-medium tracking-widest">REVISION RANGE:</span>
                  <span className="text-sm text-white font-bold">rev-8e41..HEAD</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1.5 bg-[#38bdf8]/10 border border-[#38bdf8]/20 text-[#38bdf8] text-xs font-bold">
                    Java AST Analyzed
                  </div>
                  <span className="text-sm text-slate-500">4 Architectural Eras</span>
                </div>
              </div>

              {/* Eras Header */}
              <div className="grid grid-cols-4 w-full mb-6 z-20 px-4" style={{ fontFamily: fontFamily.mono }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#5f636b]"></div>
                  <span className="text-xs text-slate-500">01 Monolith</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ffb03a]"></div>
                  <span className="text-xs text-slate-500">02 Modular Core</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#38bdf8] opacity-50"></div>
                  <span className="text-xs text-slate-500">03 Service Extract</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00f0ff] shadow-[0_0_8px_#00f0ff]"></div>
                  <span className="text-xs text-[#00f0ff] font-bold">04 Distributed</span>
                </div>
              </div>

              {/* Main Graph Area */}
              <div className="flex-1 relative w-full h-full">

                {/* Pure SVG Graph for Perfect Alignment */}
                <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="grad-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ffb03a" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#00f0ff" />
                    </linearGradient>
                    <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glow-box" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glow-dot" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Grid Lines */}
                  <g stroke="#222c37" strokeWidth="1" strokeDasharray="4 4" opacity="0.4">
                    <line x1="225" y1="0" x2="225" y2="400" />
                    <line x1="475" y1="0" x2="475" y2="400" />
                    <line x1="725" y1="0" x2="725" y2="400" />
                  </g>

                  {/* Connection Lines (Bezier Curves) */}
                  <g fill="none" strokeWidth="2">
                    {/* Monolith to Modular */}
                    <path d="M 150 200 C 220 200, 220 121, 300 121" stroke="#222c37" />
                    <path d="M 150 200 C 220 200, 220 281, 300 281" stroke="#222c37" />
                    <path d="M 150 200 L 300 200" stroke="#222c37" strokeDasharray="4 4" opacity="0.5" />

                    {/* Modular to Extract */}
                    <path d="M 420 121 C 480 121, 490 101, 550 101" stroke="#ffb03a" opacity="0.6" />
                    <path d="M 420 121 C 480 121, 490 201, 550 201" stroke="#ffb03a" opacity="0.6" />
                    <path d="M 420 281 C 480 281, 490 201, 550 201" stroke="#ffb03a" opacity="0.6" />
                    <path d="M 420 281 C 480 281, 490 301, 550 301" stroke="#ffb03a" opacity="0.6" />

                    {/* Dotted cross connection */}
                    <path d="M 420 121 L 550 201" stroke="#38bdf8" strokeDasharray="4 4" opacity="0.8" />

                    {/* Extract to Distributed */}
                    <path d="M 680 101 C 740 101, 740 71, 800 71" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.9" />
                    <path d="M 680 101 C 740 101, 740 151, 800 151" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.9" />

                    <path d="M 680 201 C 740 201, 740 71, 800 71" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.4" />

                    <path d="M 680 301 C 740 301, 740 251, 800 251" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.9" />
                    <path d="M 680 301 C 740 301, 740 331, 800 331" stroke="#ffb03a" opacity="0.6" />

                    {/* End lines on far right (Connections to dots) */}
                    <path d="M 940 71 C 960 71, 960 111, 980 111" stroke="#00f0ff" filter="url(#glow-line)" opacity="0.6" />
                    <path d="M 940 151 C 960 151, 960 111, 980 111" stroke="#00f0ff" filter="url(#glow-line)" opacity="0.6" />

                    <path d="M 940 251 C 960 251, 960 291, 980 291" stroke="#00f0ff" filter="url(#glow-line)" opacity="0.6" />
                    <path d="M 940 331 C 960 331, 960 291, 980 291" stroke="#ffb03a" opacity="0.6" />

                    <circle cx="980" cy="111" r="6" fill="#080b0e" stroke="#00f0ff" strokeWidth="2" />
                    <circle cx="980" cy="111" r="2" fill="#00f0ff" filter="url(#glow-dot)" />
                    <circle cx="980" cy="291" r="6" fill="#080b0e" stroke="#ffb03a" strokeWidth="2" />
                    <circle cx="980" cy="291" r="2" fill="#ffb03a" />
                  </g>

                  {/* Floating Badges (AST, Commit) */}
                  <g transform="translate(550, 20)">
                    <rect x="0" y="0" width="130" height="24" fill="#38bdf8" fillOpacity="0.05" stroke="#38bdf8" strokeOpacity="0.3" />
                    <circle cx="12" cy="12" r="3.5" fill="#38bdf8" />
                    <text x="22" y="16" fill="#38bdf8" fontSize="10" fontFamily="monospace">AST Dependency Graph</text>
                  </g>
                  <g transform="translate(810, 20)">
                    <rect x="0" y="0" width="120" height="24" fill="#11161b" stroke="#222c37" />
                    <circle cx="12" cy="12" r="3.5" fill="#ffb03a" />
                    <text x="22" y="16" fill="#94a3b8" fontSize="10" fontFamily="monospace">commit #4f82a9d</text>
                  </g>

                  {/* Nodes */}

                  {/* Monolith */}
                  <g transform="translate(40, 175)">
                    <rect width="110" height="50" fill="#080b0e" stroke="#222c37" strokeWidth="1.5" />
                    <text x="55" y="20" fill="#5f636b" fontSize="10" fontFamily="monospace" textAnchor="middle">v1.0-mono</text>
                    <circle cx="55" cy="30" r="3.5" fill="#5f636b" />
                    <text x="55" y="44" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">app-core</text>
                  </g>

                  {/* Modular */}
                  <g transform="translate(300, 105)">
                    <rect width="120" height="32" fill="#080b0e" stroke="#222c37" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#ffb03a" />
                    <text x="28" y="20" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">domain-lib</text>
                  </g>
                  <g transform="translate(300, 265)">
                    <rect width="120" height="32" fill="#080b0e" stroke="#222c37" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#5f636b" />
                    <text x="28" y="20" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">persistence</text>
                  </g>

                  {/* Extract */}
                  <g transform="translate(550, 85)">
                    <rect width="130" height="32" fill="#080b0e" stroke="#ffb03a" strokeOpacity="0.4" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#38bdf8" />
                    <text x="28" y="20" fill="#f4f4f6" fontSize="11" fontFamily="monospace" fontWeight="bold">auth-service</text>
                  </g>
                  <g transform="translate(550, 185)">
                    <rect width="130" height="32" fill="#080b0e" stroke="#ffb03a" strokeOpacity="0.4" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#ffb03a" />
                    <text x="28" y="20" fill="#f4f4f6" fontSize="11" fontFamily="monospace" fontWeight="bold">gateway-api</text>
                  </g>
                  <g transform="translate(550, 285)">
                    <rect width="130" height="32" fill="#080b0e" stroke="#222c37" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#5f636b" />
                    <text x="28" y="20" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">data-store</text>
                  </g>

                  {/* Distributed (Glowing) */}
                  <g transform="translate(800, 55)">
                    <rect width="140" height="32" fill="#080b0e" stroke="#00f0ff" strokeWidth="1.5" filter="url(#glow-box)" opacity="0.5" />
                    <rect width="140" height="32" fill="#080b0e" stroke="#00f0ff" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00f0ff" filter="url(#glow-dot)" />
                    <text x="28" y="20" fill="#00f0ff" fontSize="11" fontFamily="monospace" fontWeight="bold">order-service</text>
                  </g>
                  <g transform="translate(800, 135)">
                    <rect width="140" height="32" fill="#080b0e" stroke="#00f0ff" strokeWidth="1.5" filter="url(#glow-box)" opacity="0.5" />
                    <rect width="140" height="32" fill="#080b0e" stroke="#00f0ff" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00f0ff" filter="url(#glow-dot)" />
                    <text x="28" y="20" fill="#00f0ff" fontSize="11" fontFamily="monospace" fontWeight="bold">payment-service</text>
                  </g>
                  <g transform="translate(800, 235)">
                    <rect width="140" height="32" fill="#080b0e" stroke="#00f0ff" strokeWidth="1.5" filter="url(#glow-box)" opacity="0.5" />
                    <rect width="140" height="32" fill="#080b0e" stroke="#00f0ff" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00f0ff" filter="url(#glow-dot)" />
                    <text x="28" y="20" fill="#00f0ff" fontSize="11" fontFamily="monospace" fontWeight="bold">inventory-service</text>
                  </g>
                  <g transform="translate(800, 315)">
                    <rect width="140" height="32" fill="#080b0e" stroke="#222c37" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#5f636b" />
                    <text x="28" y="20" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">event-bus</text>
                  </g>

                </svg>
              </div>

              {/* Bottom Info Bar */}
              <div className="flex items-center gap-4 mt-6 z-20" style={{ fontFamily: fontFamily.mono }}>
                <div className="px-4 py-2 bg-[#11161b] border border-[#222c37] text-sm text-slate-400">
                  Delta: +18 modular edges
                </div>
                <div className="px-4 py-2 bg-[#38bdf8]/20 border border-[#38bdf8]/30 text-sm text-[#38bdf8] font-bold">
                  architecture change detected
                </div>
              </div>
            </div>
          </div>

          {/* Feature Indicators */}
          <div className="grid grid-cols-3 gap-6 shrink-0 border-t border-[#222c37] pt-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-[#38bdf8] font-semibold" style={{ fontFamily: fontFamily.mono }}>01</span>
              <h4 className="text-white text-sm font-medium">Repository Mining</h4>
              <p className="text-slate-400 text-xs leading-relaxed font-light">Deep commit mining and structural analysis.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-[#ffb03a] font-semibold" style={{ fontFamily: fontFamily.mono }}>02</span>
              <h4 className="text-white text-sm font-medium">Architecture Evolution</h4>
              <p className="text-slate-400 text-xs leading-relaxed font-light">Automated visual dependency reconstruction.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-[#00f0ff] font-semibold" style={{ fontFamily: fontFamily.mono }}>03</span>
              <h4 className="text-white text-sm font-medium">Evidence-Based AI</h4>
              <p className="text-slate-400 text-xs leading-relaxed font-light">Grounded architectural explanations linked to PRs.</p>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #080b0e;
        }
        ::-webkit-scrollbar-thumb {
          background: #222c37;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #5f636b;
        }
      `}</style>
    </div>
  );
};

export default AuthPage;
