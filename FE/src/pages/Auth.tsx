import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'motion/react';

const AuthPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isRegister = location.pathname === '/register';

  // Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset states when switching mode
  useEffect(() => {
    setError('');
    setIsLoading(false);
  }, [isRegister]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Basic validation
    if (!email || !password || (isRegister && (!name || !confirmPassword))) {
      setError('Please fill in all required fields.');
      return;
    }
    
    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      // In a real app, handle auth success here
    }, 1500);
  };

  const calculatePasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length > 8) score += 1;
    if (pass.match(/[A-Z]/)) score += 1;
    if (pass.match(/[0-9]/)) score += 1;
    if (pass.match(/[^A-Za-z0-9]/)) score += 1;
    return score; // 0 to 4
  };

  const strength = calculatePasswordStrength(password);
  const strengthColors = ['bg-[#526273]', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-[#00D9FF]'];

  return (
    <div className="h-screen bg-[#080C12] text-[#F5F7FA] font-sans flex flex-col md:flex-row overflow-hidden selection:bg-[#00D9FF]/20 selection:text-[#00D9FF]">
      
      {/* Left Panel - Authentication */}
      <div className="w-full md:w-[30%] flex flex-col relative z-10 bg-[#0B1017] border-b md:border-b-0 md:border-r border-[#1A2A38] shadow-2xl h-screen overflow-hidden">
        
        <div className="flex-1 flex flex-col p-6 lg:p-10 xl:px-12 xl:py-8 max-w-xl w-full mx-auto justify-between">
          
          {/* Header & Logo */}
          <div className="flex items-center gap-3 mb-8 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-[#101722] flex items-center justify-center border border-[#1A2A38] shadow-lg">
              <div className="w-[18px] h-[18px] relative">
                <div className="w-2 h-2 rounded-full bg-[#00D9FF] absolute top-0 left-0"></div>
                <div className="w-2 h-2 rounded-full bg-[#1687FF] absolute bottom-0 right-0"></div>
                <div className="w-[1px] h-3 bg-[#8A9AAA]/50 rotate-45 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#F5F7FA] leading-tight">ArchTime</h1>
              <p className="text-[10px] text-[#8A9AAA] font-mono tracking-wider uppercase">Architecture Evolution Observatory</p>
            </div>
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
                  <h2 className="text-3xl font-bold tracking-tight text-[#F5F7FA] mb-2">
                    {isRegister ? 'Create your ArchTime account' : 'Welcome back'}
                  </h2>
                  <p className="text-[#8A9AAA] text-sm">
                    {isRegister 
                      ? 'Start reconstructing and understanding your architecture history.' 
                      : 'Trace how your software architecture evolves.'}
                  </p>
                </div>

                {error && (
                  <div className="mb-6 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-red-500"></div>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  {isRegister && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-[#8A9AAA] font-medium block">Full name</label>
                      <div className="relative group">
                        <input 
                          type="text" 
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          disabled={isLoading}
                          placeholder="Jane Doe"
                          className="w-full h-11 bg-[#101722] border border-[#1A2A38] rounded-lg pl-10 pr-4 text-sm text-[#F5F7FA] placeholder:text-[#526273] focus:outline-none focus:border-[#00D9FF]/50 focus:ring-1 focus:ring-[#00D9FF]/20 transition-all disabled:opacity-50"
                        />
                        <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#526273] group-focus-within:text-[#00D9FF] transition-colors" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs text-[#8A9AAA] font-medium block">Email address</label>
                    <div className="relative group">
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        placeholder="developer@archtime.io"
                        className="w-full h-11 bg-[#101722] border border-[#1A2A38] rounded-lg pl-10 pr-4 text-sm text-[#F5F7FA] placeholder:text-[#526273] focus:outline-none focus:border-[#00D9FF]/50 focus:ring-1 focus:ring-[#00D9FF]/20 transition-all disabled:opacity-50"
                      />
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#526273] group-focus-within:text-[#00D9FF] transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[#8A9AAA] font-medium block">Password</label>
                      {!isRegister && (
                        <a href="#" className="text-xs text-[#00D9FF] hover:text-[#00D9FF]/80 transition-colors">Forgot password?</a>
                      )}
                    </div>
                    <div className="relative group">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        placeholder="••••••••••••••••"
                        className="w-full h-11 bg-[#101722] border border-[#1A2A38] rounded-lg pl-10 pr-10 text-sm text-[#F5F7FA] placeholder:text-[#526273] focus:outline-none focus:border-[#00D9FF]/50 focus:ring-1 focus:ring-[#00D9FF]/20 transition-all tracking-wide disabled:opacity-50"
                      />
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#526273] group-focus-within:text-[#00D9FF] transition-colors" />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#526273] hover:text-[#8A9AAA] transition-colors focus:outline-none"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    
                    {/* Subtle Password Strength Indicator */}
                    {isRegister && password.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3, 4].map((level) => (
                          <div 
                            key={level} 
                            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${strength >= level ? strengthColors[strength] : 'bg-[#1A2A38]'}`}
                          ></div>
                        ))}
                      </div>
                    )}
                  </div>

                  {isRegister && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-[#8A9AAA] font-medium block">Confirm password</label>
                      <div className="relative group">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={isLoading}
                          placeholder="••••••••••••••••"
                          className="w-full h-11 bg-[#101722] border border-[#1A2A38] rounded-lg pl-10 pr-4 text-sm text-[#F5F7FA] placeholder:text-[#526273] focus:outline-none focus:border-[#00D9FF]/50 focus:ring-1 focus:ring-[#00D9FF]/20 transition-all tracking-wide disabled:opacity-50"
                        />
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#526273] group-focus-within:text-[#00D9FF] transition-colors" />
                      </div>
                    </div>
                  )}

                  {!isRegister && (
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <input 
                        type="checkbox" 
                        id="remember" 
                        className="w-3.5 h-3.5 rounded border-[#1A2A38] bg-[#101722] text-[#00D9FF] focus:ring-[#00D9FF] focus:ring-offset-0 focus:ring-offset-[#0B1017] cursor-pointer"
                      />
                      <label htmlFor="remember" className="text-xs text-[#8A9AAA] cursor-pointer select-none">Remember this browser session</label>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full h-11 bg-[#00D9FF] hover:bg-[#00D9FF]/90 text-[#080C12] font-semibold text-sm rounded-lg mt-6 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,217,255,0.15)] focus:outline-none focus:ring-2 focus:ring-[#00D9FF]/40 focus:ring-offset-2 focus:ring-offset-[#0B1017]"
                  >
                    {isLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      isRegister ? 'Create account' : 'Sign in'
                    )}
                  </button>
                </form>

                <div className="flex items-center gap-4 my-6 opacity-70">
                  <div className="h-[1px] flex-1 bg-[#1A2A38]"></div>
                  <span className="text-[10px] text-[#526273] font-medium tracking-widest uppercase">OR</span>
                  <div className="h-[1px] flex-1 bg-[#1A2A38]"></div>
                </div>

                <button 
                  type="button"
                  disabled={isLoading}
                  className="w-full h-11 flex items-center justify-center gap-3 px-4 bg-[#101722] hover:bg-[#151f2e] border border-[#1A2A38] rounded-lg transition-colors text-[#F5F7FA] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-[#00D9FF]/50"
                >
                  <Icon icon="mdi:github" width="18" height="18" />
                  Continue with GitHub
                </button>
                
                {/* Account Toggle */}
                <div className="mt-8 text-center text-sm text-[#8A9AAA]">
                  {isRegister ? (
                    <>
                      Already have an account?{' '}
                      <Link to="/login" className="text-[#00D9FF] hover:text-[#00D9FF]/80 transition-colors font-medium">
                        Sign in &rarr;
                      </Link>
                    </>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <Link to="/register" className="text-[#00D9FF] hover:text-[#00D9FF]/80 transition-colors font-medium">
                        Create account &rarr;
                      </Link>
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          
          {/* Footer (SOC-2) */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#526273] shrink-0 mt-auto pt-6 font-mono">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <Lock size={12} className="text-[#00D9FF]" />
              <span>SOC-2 & Git AST Grounded</span>
            </div>
            <div className="flex gap-4">
              <a href="#" className="hover:text-[#8A9AAA] transition-colors">Docs</a>
              <span>•</span>
              <a href="#" className="hover:text-[#8A9AAA] transition-colors">API Keys</a>
              <span>•</span>
              <a href="#" className="hover:text-[#8A9AAA] transition-colors">Security</a>
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#101722]/80 border border-[#1A2A38] backdrop-blur-sm mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00D9FF] shadow-[0_0_5px_rgba(0,217,255,0.8)]"></div>
              <span className="text-[10px] font-mono text-[#00D9FF] tracking-wider font-semibold">ARCHTIME OBSERVATORY</span>
            </div>
            
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-[#F5F7FA] mb-4 leading-[1.1]">
              Understand how your<br />architecture <span className="text-[#00D9FF]">evolves.</span>
            </h2>
            <p className="text-[#8A9AAA] text-base leading-relaxed max-w-xl">
              Reconstruct architectural changes from Git history, dependency graphs and concrete repository evidence.
            </p>
          </div>

          {/* Architectural Visualization */}
          <div className="flex-1 my-4 relative flex flex-col w-full min-h-0">
            <div className="w-full h-full relative rounded-xl border border-[#1A2A38] bg-[#080C12] overflow-hidden flex flex-col p-6 shadow-2xl">
              
              {/* Top Header of Diagram */}
              <div className="flex justify-between items-center z-20 mb-8">
                <div className="flex items-center gap-2">
                  <div className="text-[#00D9FF] flex items-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </div>
                  <span className="text-sm font-mono text-[#526273] font-medium tracking-widest">REVISION RANGE:</span>
                  <span className="text-sm font-mono text-[#F5F7FA] font-bold">rev-8e41..HEAD</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1.5 rounded bg-[#00D9FF]/10 border border-[#00D9FF]/20 text-[#00D9FF] text-xs font-mono font-bold">
                    Java AST Analyzed
                  </div>
                  <span className="text-sm font-mono text-[#526273]">4 Architectural Eras</span>
                </div>
              </div>

              {/* Eras Header */}
              <div className="grid grid-cols-4 w-full mb-6 z-20 px-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#526273]"></div>
                  <span className="text-xs font-mono text-[#526273]">01 Monolith</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#1687FF]"></div>
                  <span className="text-xs font-mono text-[#526273]">02 Modular Core</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00D9FF] opacity-50"></div>
                  <span className="text-xs font-mono text-[#526273]">03 Service Extract</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00D9FF] shadow-[0_0_8px_#00D9FF]"></div>
                  <span className="text-xs font-mono text-[#00D9FF] font-bold">04 Distributed</span>
                </div>
              </div>

              {/* Main Graph Area */}
              <div className="flex-1 relative w-full h-full rounded-lg">
                
                {/* Pure SVG Graph for Perfect Alignment */}
                <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="grad-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#1687FF" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#00D9FF" />
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
                  <g stroke="#1A2A38" strokeWidth="1" strokeDasharray="4 4" opacity="0.4">
                    <line x1="225" y1="0" x2="225" y2="400" />
                    <line x1="475" y1="0" x2="475" y2="400" />
                    <line x1="725" y1="0" x2="725" y2="400" />
                  </g>

                  {/* Connection Lines (Bezier Curves) */}
                  <g fill="none" strokeWidth="2">
                    {/* Monolith to Modular */}
                    <path d="M 150 200 C 220 200, 220 121, 300 121" stroke="#1A2A38" />
                    <path d="M 150 200 C 220 200, 220 281, 300 281" stroke="#1A2A38" />
                    <path d="M 150 200 L 300 200" stroke="#1A2A38" strokeDasharray="4 4" opacity="0.5" />

                    {/* Modular to Extract */}
                    <path d="M 420 121 C 480 121, 490 101, 550 101" stroke="#1687FF" opacity="0.6" />
                    <path d="M 420 121 C 480 121, 490 201, 550 201" stroke="#1687FF" opacity="0.6" />
                    <path d="M 420 281 C 480 281, 490 201, 550 201" stroke="#1687FF" opacity="0.6" />
                    <path d="M 420 281 C 480 281, 490 301, 550 301" stroke="#1687FF" opacity="0.6" />
                    
                    {/* Dotted cross connection */}
                    <path d="M 420 121 L 550 201" stroke="#00D9FF" strokeDasharray="4 4" opacity="0.8" />

                    {/* Extract to Distributed */}
                    <path d="M 680 101 C 740 101, 740 71, 800 71" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.9" />
                    <path d="M 680 101 C 740 101, 740 151, 800 151" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.9" />
                    
                    <path d="M 680 201 C 740 201, 740 71, 800 71" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.4" />
                    
                    <path d="M 680 301 C 740 301, 740 251, 800 251" stroke="url(#grad-cyan)" filter="url(#glow-line)" opacity="0.9" />
                    <path d="M 680 301 C 740 301, 740 331, 800 331" stroke="#1687FF" opacity="0.6" />

                    {/* End lines on far right (Connections to dots) */}
                    <path d="M 940 71 C 960 71, 960 111, 980 111" stroke="#00D9FF" filter="url(#glow-line)" opacity="0.6" />
                    <path d="M 940 151 C 960 151, 960 111, 980 111" stroke="#00D9FF" filter="url(#glow-line)" opacity="0.6" />
                    
                    <path d="M 940 251 C 960 251, 960 291, 980 291" stroke="#00D9FF" filter="url(#glow-line)" opacity="0.6" />
                    <path d="M 940 331 C 960 331, 960 291, 980 291" stroke="#1687FF" opacity="0.6" />

                    <circle cx="980" cy="111" r="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="2" />
                    <circle cx="980" cy="111" r="2" fill="#00D9FF" filter="url(#glow-dot)" />
                    <circle cx="980" cy="291" r="6" fill="#0B1017" stroke="#1687FF" strokeWidth="2" />
                    <circle cx="980" cy="291" r="2" fill="#1687FF" />
                  </g>

                  {/* Floating Badges (AST, Commit) */}
                  <g transform="translate(600, 20)">
                    <rect x="0" y="0" width="130" height="24" rx="4" fill="#00D9FF" fillOpacity="0.05" stroke="#00D9FF" strokeOpacity="0.3" />
                    <circle cx="12" cy="12" r="3.5" fill="#00D9FF" />
                    <text x="22" y="16" fill="#00D9FF" fontSize="10" fontFamily="monospace">AST Dependency Graph</text>
                  </g>
                  <g transform="translate(760, 20)">
                    <rect x="0" y="0" width="120" height="24" rx="4" fill="#101722" stroke="#1A2A38" />
                    <circle cx="12" cy="12" r="3.5" fill="#1687FF" />
                    <text x="22" y="16" fill="#8A9AAA" fontSize="10" fontFamily="monospace">commit #4f82a9d</text>
                  </g>

                  {/* Nodes */}
                  
                  {/* Monolith */}
                  <g transform="translate(40, 175)">
                    <rect width="110" height="50" rx="6" fill="#0B1017" stroke="#1A2A38" strokeWidth="1.5" />
                    <text x="55" y="20" fill="#526273" fontSize="10" fontFamily="monospace" textAnchor="middle">v1.0-mono</text>
                    <circle cx="55" cy="30" r="3.5" fill="#526273" />
                    <text x="55" y="44" fill="#8A9AAA" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">app-core</text>
                  </g>

                  {/* Modular */}
                  <g transform="translate(300, 105)">
                    <rect width="120" height="32" rx="6" fill="#0B1017" stroke="#1A2A38" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#1687FF" />
                    <text x="28" y="20" fill="#8A9AAA" fontSize="11" fontFamily="monospace" fontWeight="bold">domain-lib</text>
                  </g>
                  <g transform="translate(300, 265)">
                    <rect width="120" height="32" rx="6" fill="#0B1017" stroke="#1A2A38" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#526273" />
                    <text x="28" y="20" fill="#8A9AAA" fontSize="11" fontFamily="monospace" fontWeight="bold">persistence</text>
                  </g>

                  {/* Extract */}
                  <g transform="translate(550, 85)">
                    <rect width="130" height="32" rx="6" fill="#0B1017" stroke="#1687FF" strokeOpacity="0.4" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00D9FF" />
                    <text x="28" y="20" fill="#F5F7FA" fontSize="11" fontFamily="monospace" fontWeight="bold">auth-service</text>
                  </g>
                  <g transform="translate(550, 185)">
                    <rect width="130" height="32" rx="6" fill="#0B1017" stroke="#1687FF" strokeOpacity="0.4" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#1687FF" />
                    <text x="28" y="20" fill="#F5F7FA" fontSize="11" fontFamily="monospace" fontWeight="bold">gateway-api</text>
                  </g>
                  <g transform="translate(550, 285)">
                    <rect width="130" height="32" rx="6" fill="#0B1017" stroke="#1A2A38" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#526273" />
                    <text x="28" y="20" fill="#8A9AAA" fontSize="11" fontFamily="monospace" fontWeight="bold">data-store</text>
                  </g>

                  {/* Distributed (Glowing) */}
                  <g transform="translate(800, 55)">
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="1.5" filter="url(#glow-box)" opacity="0.5" />
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00D9FF" filter="url(#glow-dot)" />
                    <text x="28" y="20" fill="#00D9FF" fontSize="11" fontFamily="monospace" fontWeight="bold">order-service</text>
                  </g>
                  <g transform="translate(800, 135)">
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="1.5" filter="url(#glow-box)" opacity="0.5" />
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00D9FF" filter="url(#glow-dot)" />
                    <text x="28" y="20" fill="#00D9FF" fontSize="11" fontFamily="monospace" fontWeight="bold">payment-service</text>
                  </g>
                  <g transform="translate(800, 235)">
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="1.5" filter="url(#glow-box)" opacity="0.5" />
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#00D9FF" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#00D9FF" filter="url(#glow-dot)" />
                    <text x="28" y="20" fill="#00D9FF" fontSize="11" fontFamily="monospace" fontWeight="bold">inventory-service</text>
                  </g>
                  <g transform="translate(800, 315)">
                    <rect width="140" height="32" rx="6" fill="#0B1017" stroke="#1A2A38" strokeWidth="1.5" />
                    <circle cx="15" cy="16" r="4" fill="#526273" />
                    <text x="28" y="20" fill="#8A9AAA" fontSize="11" fontFamily="monospace" fontWeight="bold">event-bus</text>
                  </g>

                </svg>
              </div>

              {/* Bottom Info Bar */}
              <div className="flex items-center gap-4 mt-6 z-20">
                <div className="px-4 py-2 rounded bg-[#101722] border border-[#1A2A38] text-sm font-mono text-[#8A9AAA]">
                  Delta: +18 modular edges
                </div>
                <div className="px-4 py-2 rounded bg-[#00D9FF]/20 border border-[#00D9FF]/30 text-sm font-mono text-[#00D9FF] font-bold">
                  architecture change detected
                </div>
              </div>
            </div>
          </div>

          {/* Feature Indicators */}
          <div className="grid grid-cols-3 gap-6 shrink-0 border-t border-[#1A2A38] pt-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-[#00D9FF] font-semibold">01</span>
              <h4 className="text-[#F5F7FA] text-sm font-medium">Repository Mining</h4>
              <p className="text-[#526273] text-xs leading-relaxed">Deep commit mining and structural analysis.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-[#00D9FF] font-semibold">02</span>
              <h4 className="text-[#F5F7FA] text-sm font-medium">Architecture Evolution</h4>
              <p className="text-[#526273] text-xs leading-relaxed">Automated visual dependency reconstruction.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-[#00D9FF] font-semibold">03</span>
              <h4 className="text-[#F5F7FA] text-sm font-medium">Evidence-Based AI</h4>
              <p className="text-[#526273] text-xs leading-relaxed">Grounded architectural explanations linked to PRs.</p>
            </div>
          </div>

        </div>
      </div>
      
      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #0B1017;
        }
        ::-webkit-scrollbar-thumb {
          background: #1A2A38;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #526273;
        }
      `}</style>
    </div>
  );
};

export default AuthPage;
