import React from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  FolderGit2,
  Box,
  GitCommit,
  Clock,
  ScanSearch,
  Download,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Sparkles,
  SearchCode
} from 'lucide-react';
import { Icon } from '@iconify/react';

const ProjectDetail: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto flex flex-col min-h-0 pb-12">
        
        {/* HEADER */}
        <div className="shrink-0 space-y-6 pt-2">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#222c37] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
                <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Project Observatory</span>
              </div>
              
              <div className="flex items-center gap-2 mb-2 text-sm font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                 <Link to="/projects" className="hover:text-[#f4f4f6] transition-colors">ArchTime</Link>
                 <span>/</span>
                 <Link to="/projects" className="hover:text-[#f4f4f6] transition-colors">Projects</Link>
                 <span>/</span>
                 <span className="text-[#38bdf8]">E-Commerce Platform</span>
              </div>
              
              <h2 className="text-4xl font-bold tracking-tight text-[#f4f4f6] mb-2">E-Commerce Platform</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Cloud-native multi-tenant commerce engine.
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
               <button className="h-10 px-5 bg-[#11161b] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.05)] uppercase tracking-wider">
                  <Download size={16} /> Export Report
               </button>
               <button className="h-10 px-5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.15)] uppercase tracking-wider">
                  <ScanSearch size={16} /> Analyze Repository
               </button>
            </div>
          </div>
        </div>

        {/* STATUS METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <div className="bg-[#11161b] border border-[#222c37] p-5 flex items-center gap-4">
             <div className="w-12 h-12 bg-[#222c37] flex items-center justify-center text-[#f4f4f6]">
               <FolderGit2 size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>4</div>
               <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-widest font-bold mt-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repositories</div>
             </div>
          </div>
          <div className="bg-[#11161b] border border-[#222c37] p-5 flex items-center gap-4">
             <div className="w-12 h-12 bg-[#ffb03a]/10 border border-[#ffb03a]/20 flex items-center justify-center text-[#ffb03a]">
               <Box size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#ffb03a]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>38</div>
               <div className="text-[10px] font-mono text-[#ffb03a]/70 uppercase tracking-widest font-bold mt-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Arch Changes</div>
             </div>
          </div>
          <div className="bg-[#11161b] border border-[#222c37] p-5 flex items-center gap-4">
             <div className="w-12 h-12 bg-[#38bdf8]/10 border border-[#38bdf8]/20 flex items-center justify-center text-[#38bdf8]">
               <GitCommit size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>86</div>
               <div className="text-[10px] font-mono text-[#38bdf8]/70 uppercase tracking-widest font-bold mt-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commits Analyzed</div>
             </div>
          </div>
          <div className="bg-[#11161b] border border-[#222c37] p-5 flex items-center gap-4">
             <div className="w-12 h-12 bg-[#222c37] flex items-center justify-center text-[#5f636b]">
               <Clock size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#f4f4f6] text-lg"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>2h ago</div>
               <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-widest font-bold mt-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Last Analyzed</div>
             </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="mt-8 border-b border-[#222c37] flex gap-8 overflow-x-auto custom-scrollbar">
           <div className="pb-3 border-b-2 border-[#38bdf8] text-[#38bdf8] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer">
              Overview
           </div>
           <div className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Repositories
           </div>
           <Link to="/history" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Architecture
           </Link>
           <Link to="/history" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              History
           </Link>
           <Link to="/compare" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Compare
           </Link>
           <Link to="/evidence" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Changes
           </Link>
           <Link to="/evidence" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Evidence
           </Link>
           <Link to="/insights" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              AI Insights
           </Link>
           <Link to="/reports" className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Reports
           </Link>
        </div>

        {/* OVERVIEW CONTENT */}
        <div className="flex flex-col xl:flex-row gap-6 mt-8">
           
           {/* LEFT COLUMN (70%) */}
           <div className="flex-[2.5] flex flex-col gap-6 min-w-0">
              
              {/* LARGE ARCHITECTURE GRAPH */}
              <div className="bg-[#080b0e] border border-[#222c37] overflow-hidden shadow-2xl relative flex flex-col">
                 <div className="p-4 border-b border-[#222c37] bg-[#080b0e] flex items-center justify-between z-10">
                    <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase">Current Architecture</h3>
                    <div className="text-[10px] font-mono text-[#38bdf8] uppercase tracking-widest font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Live Status</div>
                 </div>
                 
                 <div className="relative w-full h-[350px]">
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                    
                    <svg viewBox="0 0 800 400" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
                       <defs>
                         <filter id="glow-cyan-dash" x="-20%" y="-20%" width="140%" height="140%">
                           <feGaussianBlur stdDeviation="3" result="blur" />
                           <feComposite in="SourceGraphic" in2="blur" operator="over" />
                         </filter>
                       </defs>

                       {/* LINES */}
                       <g fill="none" strokeWidth="2" opacity="0.6">
                          <path d="M 400 80 L 400 150" stroke="#38bdf8" />
                          
                          <path d="M 400 150 C 250 150, 250 200, 250 250" stroke="#38bdf8" />
                          <path d="M 400 150 C 550 150, 550 200, 550 250" stroke="#38bdf8" />
                          <path d="M 400 150 L 400 250" stroke="#38bdf8" />
                          
                          <path d="M 400 250 C 650 250, 650 250, 700 250" stroke="#38bdf8" />
                          
                          <path d="M 400 290 L 400 350" stroke="#38bdf8" />
                          <path d="M 250 290 C 250 330, 400 330, 400 350" stroke="#38bdf8" />
                          <path d="M 550 290 C 550 330, 400 330, 400 350" stroke="#38bdf8" />
                       </g>

                       {/* NODES */}
                       <g>
                         {/* API GATEWAY */}
                         <g transform="translate(320, 40)">
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeWidth="2" filter="url(#glow-cyan-dash)" opacity="0.3" />
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeWidth="2" />
                           <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                           <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">API GATEWAY</text>
                         </g>

                         {/* ORDER MODULE */}
                         <g transform="translate(170, 250)">
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                           <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">ORDER_SERVICE</text>
                         </g>

                         {/* INVENTORY MODULE */}
                         <g transform="translate(320, 250)">
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                           <text x="35" y="24" fill="#f4f4f6" fontSize="11" fontFamily="monospace" fontWeight="bold">INVENTORY_SERVICE</text>
                         </g>

                         {/* PAYMENT MODULE */}
                         <g transform="translate(470, 250)">
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                           <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">PAYMENT_SERVICE</text>
                         </g>
                         
                         {/* USER MODULE */}
                         <g transform="translate(620, 250)">
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                           <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">USER_SERVICE</text>
                         </g>

                         {/* DATABASE */}
                         <g transform="translate(320, 350)">
                           <rect width="160" height="40" rx="4" fill="#161d24" stroke="#5f636b" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#5f636b" />
                           <text x="35" y="24" fill="#94a3b8" fontSize="13" fontFamily="monospace" fontWeight="bold">SHARED_DB</text>
                         </g>
                       </g>
                    </svg>
                 </div>
                 
                 <div className="p-4 bg-[#080b0e] border-t border-[#222c37] text-[10px] font-mono text-[#5f636b] flex items-center justify-between"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    <span>Recent structural changes detected: Payment extracted, Dependencies updated.</span>
                    <Link to="/history" className="text-[#38bdf8] hover:underline flex items-center gap-1 font-bold">
                       VIEW TIMELINE <ArrowRight size={12} />
                    </Link>
                 </div>
              </div>

              {/* REPOSITORIES LIST */}
              <div className="bg-[#11161b] border border-[#222c37] overflow-hidden flex flex-col">
                 <div className="p-4 border-b border-[#222c37] bg-[#161d24] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase">Connected Repositories</h3>
                 </div>
                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse min-w-[600px]">
                     <thead>
                       <tr className="border-b border-[#222c37] bg-[#080b0e]">
                         <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Provider</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Branch</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commits</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Status</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider text-right"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Action</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-[#222c37]">
                       
                       <tr className="group hover:bg-[#222c37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>payment-service</td>
                         <td className="p-4"><Icon icon="mdi:github" width="16" height="16" className="text-[#94a3b8]" /></td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>main</td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>124</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#22c55e] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <CheckCircle2 size={12} /> Syncing
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#5f636b] hover:text-[#38bdf8] transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>
                       
                       <tr className="group hover:bg-[#222c37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>order-service</td>
                         <td className="p-4"><Icon icon="mdi:github" width="16" height="16" className="text-[#94a3b8]" /></td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>main</td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>842</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#22c55e] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <CheckCircle2 size={12} /> Syncing
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#5f636b] hover:text-[#38bdf8] transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>
                       
                       <tr className="group hover:bg-[#222c37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>inventory-service</td>
                         <td className="p-4"><Icon icon="mdi:gitlab" width="16" height="16" className="text-[#ffb03a]" /></td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>develop</td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>45</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#22c55e] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <CheckCircle2 size={12} /> Syncing
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#5f636b] hover:text-[#38bdf8] transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>
                       
                       <tr className="group hover:bg-[#222c37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>user-service</td>
                         <td className="p-4"><Icon icon="mdi:github" width="16" height="16" className="text-[#94a3b8]" /></td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>main</td>
                         <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>210</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#94a3b8] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <Clock size={12} /> Pending
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#5f636b] hover:text-[#38bdf8] transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>

                     </tbody>
                   </table>
                 </div>
              </div>

           </div>

           {/* RIGHT COLUMN (30%) */}
           <div className="flex-1 flex flex-col gap-6 min-w-[320px]">
              
              {/* LATEST AI INSIGHT */}
              <div className="bg-[#11161b] border border-[#38bdf8]/30 overflow-hidden relative group">
                 <div className="absolute inset-0 bg-gradient-to-br from-[#38bdf8]/5 to-transparent pointer-events-none"></div>
                 <div className="p-5 relative z-10">
                    <div className="flex items-center justify-between mb-4">
                       <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase flex items-center gap-2">
                         <Sparkles size={16} className="text-[#38bdf8]" /> AI Insight
                       </h3>
                       <div className="px-2 py-0.5 bg-[#38bdf8]/10 border border-[#38bdf8]/20 text-[9px] font-mono font-bold text-[#38bdf8] uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          New
                       </div>
                    </div>
                    
                    <h4 className="text-sm font-bold text-[#f4f4f6] mb-2 leading-snug">
                       Payment service extraction reduces Order module blast radius.
                    </h4>
                    <p className="text-xs text-[#94a3b8] mb-4 leading-relaxed line-clamp-3">
                       Based on repository evidence from commit d82f91a, extracting the Payment responsibilities successfully decoupled 8 external dependencies from the core Order processing engine.
                    </p>
                    
                    <Link to="/insights" className="inline-flex h-9 px-4 items-center justify-center gap-2 text-[10px] font-mono font-bold text-[#080b0e] bg-[#38bdf8] hover:bg-[#38bdf8]/90 transition-colors uppercase w-full"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       View Insight <ArrowRight size={14} />
                    </Link>
                 </div>
              </div>

              {/* RECENT CHANGES */}
              <div className="bg-[#11161b] border border-[#222c37] overflow-hidden flex flex-col flex-1">
                 <div className="p-5 border-b border-[#222c37] bg-[#161d24] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase">Recent Changes</h3>
                 </div>
                 
                 <div className="divide-y divide-[#222c37] flex-1">
                    
                    <div className="p-4 hover:bg-[#222c37]/30 transition-colors group cursor-pointer">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="px-1.5 py-0.5 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Extraction</span>
                         <span className="text-[10px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>2h ago</span>
                       </div>
                       <div className="text-sm font-bold text-[#f4f4f6] group-hover:text-[#38bdf8] transition-colors">PaymentService extracted</div>
                    </div>

                    <div className="p-4 hover:bg-[#222c37]/30 transition-colors group cursor-pointer">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="px-1.5 py-0.5 bg-[#38bdf8]/10 border border-[#38bdf8]/20 text-[#38bdf8] text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependency</span>
                         <span className="text-[10px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Yesterday</span>
                       </div>
                       <div className="text-sm font-bold text-[#f4f4f6] group-hover:text-[#38bdf8] transition-colors">Order dependency changed</div>
                    </div>

                    <div className="p-4 hover:bg-[#222c37]/30 transition-colors group cursor-pointer">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="px-1.5 py-0.5 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Split</span>
                         <span className="text-[10px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>3 days ago</span>
                       </div>
                       <div className="text-sm font-bold text-[#f4f4f6] group-hover:text-[#38bdf8] transition-colors">Settlement pipeline decoupled</div>
                    </div>
                    
                 </div>

                 <div className="p-4 border-t border-[#222c37] bg-[#080b0e]">
                    <Link to="/evidence" className="inline-flex h-9 px-4 items-center justify-center gap-2 text-[10px] font-mono font-bold text-[#94a3b8] border border-[#222c37] hover:border-[#5f636b] hover:text-[#f4f4f6] transition-colors uppercase w-full"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       View All Changes <SearchCode size={14} />
                    </Link>
                 </div>
              </div>

           </div>
           
        </div>

      </div>
    </DashboardLayout>
  );
};

export default ProjectDetail;
