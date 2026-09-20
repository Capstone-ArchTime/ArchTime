import React, { useState } from 'react';
import { Mail, Lock, CheckCircle2, Search, Zap, Server, ChevronRight } from 'lucide-react';
import { Icon } from '@iconify/react';
import { Checkbox } from 'antd';

const Login: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col md:flex-row overflow-hidden relative selection:bg-cyan-900 selection:text-cyan-50">
      
      {/* Glow Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 blur-[150px] rounded-full"></div>
      </div>

      {/* Left Panel - Login Form */}
      <div className="w-full md:w-[45%] lg:w-[40%] p-8 lg:p-12 xl:p-16 flex flex-col justify-between relative z-10 border-r border-white/5 bg-[#050505]/80 backdrop-blur-sm h-screen overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              <div className="w-5 h-5 flex items-center justify-center relative">
                <div className="w-2 h-2 rounded-full bg-cyan-400 absolute top-0 left-0"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 absolute bottom-0 right-0"></div>
                <div className="w-[1px] h-4 bg-white/30 rotate-45"></div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">ArchTime</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-900/40 text-cyan-400 border border-cyan-800/50">v2.4</span>
              </div>
              <p className="text-[11px] text-gray-500 tracking-wider uppercase mt-0.5">Architecture Evolution Observatory</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs text-gray-400 font-mono">Observatory Online</span>
          </div>
        </div>

        {/* Main Form Area */}
        <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
          
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/30 border border-cyan-900/30 text-cyan-400 text-xs font-mono mb-6">
              <CheckCircle2 size={12} />
              Developer Access Portal
            </div>
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-gray-400 text-sm">
              {isRegister 
                ? 'Start reconstructing and understanding your architecture history.' 
                : 'Trace how your software architecture evolves.'}
            </p>
          </div>

          <button className="w-full h-12 flex items-center justify-between px-4 bg-[#111] hover:bg-[#1a1a1a] border border-white/10 rounded-lg transition-colors group">
            <div className="flex items-center gap-3">
              <Icon icon="mdi:github" width="20" height="20" className="text-white group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">Continue with GitHub</span>
            </div>
            <span className="text-[10px] font-mono text-gray-500 px-2 py-1 bg-white/5 rounded">OAuth</span>
          </button>

          <div className="flex items-center gap-4 my-8">
            <div className="h-[1px] flex-1 bg-white/5"></div>
            <span className="text-xs text-gray-500 font-mono uppercase tracking-widest">or</span>
            <div className="h-[1px] flex-1 bg-white/5"></div>
          </div>

          <form className="space-y-5">
            {isRegister && (
              <div className="space-y-2">
                <label className="text-[11px] text-gray-400 font-mono uppercase tracking-widest block">Full Name</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    placeholder="Jane Doe"
                    className="w-full h-12 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] text-gray-400 font-mono uppercase tracking-widest block">Workspace Email</label>
              <div className="relative group">
                <input 
                  type="email" 
                  defaultValue={isRegister ? "" : "lead.architect@archtime.io"}
                  placeholder={isRegister ? "developer@archtime.io" : ""}
                  className="w-full h-12 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
                <Mail size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-gray-400 font-mono uppercase tracking-widest block">Password</label>
                {!isRegister && (
                  <a href="#" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Forgot password?</a>
                )}
              </div>
              <div className="relative group">
                <input 
                  type="password" 
                  defaultValue={isRegister ? "" : "••••••••••••••••"}
                  placeholder={isRegister ? "••••••••••••••••" : ""}
                  className="w-full h-12 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors tracking-widest"
                />
                <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>

            {isRegister && (
              <div className="space-y-2">
                <label className="text-[11px] text-gray-400 font-mono uppercase tracking-widest block">Confirm Password</label>
                <div className="relative group">
                  <input 
                    type="password" 
                    placeholder="••••••••••••••••"
                    className="w-full h-12 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors tracking-widest"
                  />
                  <Lock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-500 transition-colors" />
                </div>
              </div>
            )}

            {!isRegister && (
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox defaultChecked className="custom-checkbox" />
                  <span className="text-sm text-gray-400">Remember this browser session</span>
                </div>
                <span className="text-[11px] text-gray-600 font-mono">30 days</span>
              </div>
            )}

            <button className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-medium rounded-lg mt-6 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all flex items-center justify-center gap-2 group">
              {isRegister ? 'Create account' : 'Sign in to Observatory'}
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <p className="text-center mt-8 text-sm text-gray-500">
            {isRegister ? "Already have an account? " : "Don't have an account? "}
            <button 
              onClick={() => setIsRegister(!isRegister)} 
              className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium cursor-pointer"
            >
              {isRegister ? "Sign in \u2192" : "Create account \u2192"}
            </button>
          </p>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 mt-16 font-mono">
          <div className="flex items-center gap-2 mb-4 sm:mb-0">
            <Lock size={14} className="text-cyan-500" />
            <span>SOC-2 & Git AST Grounded</span>
          </div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-300 transition-colors">Docs</a>
            <span>•</span>
            <a href="#" className="hover:text-gray-300 transition-colors">API Keys</a>
            <span>•</span>
            <a href="#" className="hover:text-gray-300 transition-colors">Security</a>
          </div>
        </div>
      </div>

      {/* Right Panel - Showcase */}
      <div className="hidden md:flex flex-1 flex-col relative z-10 p-8 lg:p-12 xl:p-16">
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik00MCAwSDBWMGg0MHY0MEg0MFYweiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDMpIi8+Cjwvc3ZnPg==')] opacity-50 z-0"></div>

        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-[#111]/50 border border-white/5 backdrop-blur-md self-start mb-12">
            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
            <span className="text-xs font-mono text-cyan-400 font-medium tracking-wider">ARCHTIME OBSERVATORY <span className="text-gray-600 mx-2">|</span> <span className="text-gray-400">Git & AST Reconstruction Engine</span></span>
          </div>

          {/* Title Area */}
          <div className="max-w-2xl mb-12">
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Understand how your<br />architecture <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">evolves.</span>
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed max-w-xl">
              Reconstruct architectural changes from Git history, dependency graphs and concrete repository evidence. Trace modular boundaries across commit revisions.
            </p>
          </div>

          {/* Diagram Area */}
          <div className="flex-1 w-full bg-[#0a0a0a]/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
            <img 
              src="/architecture_diagram.png" 
              alt="Architecture Diagram" 
              className="w-full h-full object-cover rounded-xl opacity-80 group-hover:opacity-100 transition-opacity duration-500"
            />
            {/* Overlay UI elements on top of the image to make it look like the real thing */}
            <div className="absolute top-8 left-8 flex items-center gap-4 text-xs font-mono">
               <span className="text-cyan-500">⟷ REVISION RANGE:</span>
               <span className="text-white font-bold bg-white/10 px-2 py-1 rounded">rev-8e41..HEAD</span>
            </div>
            
            <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
              <div className="flex gap-12">
                <div>
                  <p className="text-[10px] text-gray-500 font-mono mb-1">MODULE COUPLING</p>
                  <p className="text-xl font-bold text-cyan-400">-42.8% <span className="text-xs font-normal text-gray-500">De-entangled</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-mono mb-1">AST CONFIDENCE</p>
                  <p className="text-xl font-bold text-white">99.4% <span className="text-xs font-normal text-gray-500">Evidence grounded</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-mono mb-1">REVISIONS TRACED</p>
                  <p className="text-xl font-bold text-blue-400">1,420+ <span className="text-xs font-normal text-gray-500">Git commits</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Boxes */}
          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-[#0a0a0a]/60 border border-white/5 hover:border-cyan-900/50 p-6 rounded-xl transition-colors">
              <div className="text-xs font-mono text-cyan-400 mb-2">01</div>
              <h3 className="text-sm font-bold mb-2">Repository Mining</h3>
              <p className="text-xs text-gray-400 leading-relaxed">Deep commit mining and Java AST parser analyzing modular structural shifts.</p>
            </div>
            <div className="bg-[#0a0a0a]/60 border border-white/5 hover:border-cyan-900/50 p-6 rounded-xl transition-colors">
              <div className="text-xs font-mono text-cyan-400 mb-2">02</div>
              <h3 className="text-sm font-bold mb-2">Architecture Evolution</h3>
              <p className="text-xs text-gray-400 leading-relaxed">Automated visual reconstruction of dependencies from initial commit to microservices.</p>
            </div>
            <div className="bg-[#0a0a0a]/60 border border-white/5 hover:border-cyan-900/50 p-6 rounded-xl transition-colors">
              <div className="text-xs font-mono text-cyan-400 mb-2">03</div>
              <h3 className="text-sm font-bold mb-2">Evidence-Based AI</h3>
              <p className="text-xs text-gray-400 leading-relaxed">Grounded architectural explanations linked directly to specific PRs and code diffs.</p>
            </div>
          </div>

        </div>
      </div>
      
      <style>{`
        .custom-checkbox .ant-checkbox-inner {
          background-color: transparent !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
          border-radius: 4px;
        }
        .custom-checkbox.ant-checkbox-checked .ant-checkbox-inner {
          background-color: #06b6d4 !important;
          border-color: #06b6d4 !important;
        }
      `}</style>
    </div>
  );
};

export default Login;
