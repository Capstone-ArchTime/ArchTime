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
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Sparkles,
  SearchCode
} from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion } from 'motion/react';

const ProjectDetail: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto flex flex-col min-h-0 pb-12">
        
        {/* HEADER */}
        <div className="shrink-0 space-y-6 pt-2">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E151D] border border-[#1A2A37] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
                <span className="text-[10px] font-mono text-[#19C8F3] tracking-wider font-semibold uppercase">Project Observatory</span>
              </div>
              
              <div className="flex items-center gap-2 mb-2 text-sm font-mono text-[#566575]">
                 <Link to="/projects" className="hover:text-[#F4F7FA] transition-colors">ArchTime</Link>
                 <span>/</span>
                 <Link to="/projects" className="hover:text-[#F4F7FA] transition-colors">Projects</Link>
                 <span>/</span>
                 <span className="text-[#19C8F3]">E-Commerce Platform</span>
              </div>
              
              <h2 className="text-4xl font-bold tracking-tight text-[#F4F7FA] mb-2">E-Commerce Platform</h2>
              <p className="text-[#8A98A8] text-sm max-w-xl leading-relaxed">
                Cloud-native multi-tenant commerce engine.
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
               <button className="h-10 px-5 bg-[#0B1017] border border-[#1A2A37] hover:border-[#19C8F3]/50 text-[#19C8F3] font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(25,200,243,0.05)] uppercase tracking-wider">
                  <Download size={16} /> Export Report
               </button>
               <button className="h-10 px-5 bg-[#19C8F3] hover:bg-[#19C8F3]/90 text-[#070A0F] font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(25,200,243,0.15)] uppercase tracking-wider">
                  <ScanSearch size={16} /> Analyze Repository
               </button>
            </div>
          </div>
        </div>

        {/* STATUS METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex items-center gap-4">
             <div className="w-12 h-12 rounded-lg bg-[#1A2A37] flex items-center justify-center text-[#F4F7FA]">
               <FolderGit2 size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#F4F7FA]">4</div>
               <div className="text-[10px] font-mono text-[#566575] uppercase tracking-widest font-bold mt-1">Repositories</div>
             </div>
          </div>
          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex items-center gap-4">
             <div className="w-12 h-12 rounded-lg bg-[#FFB020]/10 border border-[#FFB020]/20 flex items-center justify-center text-[#FFB020]">
               <Box size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#FFB020]">38</div>
               <div className="text-[10px] font-mono text-[#FFB020]/70 uppercase tracking-widest font-bold mt-1">Arch Changes</div>
             </div>
          </div>
          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex items-center gap-4">
             <div className="w-12 h-12 rounded-lg bg-[#19C8F3]/10 border border-[#19C8F3]/20 flex items-center justify-center text-[#19C8F3]">
               <GitCommit size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#19C8F3]">86</div>
               <div className="text-[10px] font-mono text-[#19C8F3]/70 uppercase tracking-widest font-bold mt-1">Commits Analyzed</div>
             </div>
          </div>
          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex items-center gap-4">
             <div className="w-12 h-12 rounded-lg bg-[#1A2A37] flex items-center justify-center text-[#566575]">
               <Clock size={24} />
             </div>
             <div>
               <div className="text-2xl font-bold font-mono text-[#F4F7FA] text-lg">2h ago</div>
               <div className="text-[10px] font-mono text-[#566575] uppercase tracking-widest font-bold mt-1">Last Analyzed</div>
             </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="mt-8 border-b border-[#1A2A37] flex gap-8 overflow-x-auto custom-scrollbar">
           <div className="pb-3 border-b-2 border-[#19C8F3] text-[#19C8F3] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer">
              Overview
           </div>
           <div className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Repositories
           </div>
           <Link to="/history" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Architecture
           </Link>
           <Link to="/history" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              History
           </Link>
           <Link to="/compare" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Compare
           </Link>
           <Link to="/evidence" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Changes
           </Link>
           <Link to="/evidence" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Evidence
           </Link>
           <Link to="/insights" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              AI Insights
           </Link>
           <Link to="/reports" className="pb-3 border-b-2 border-transparent hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors">
              Reports
           </Link>
        </div>

        {/* OVERVIEW CONTENT */}
        <div className="flex flex-col xl:flex-row gap-6 mt-8">
           
           {/* LEFT COLUMN (70%) */}
           <div className="flex-[2.5] flex flex-col gap-6 min-w-0">
              
              {/* LARGE ARCHITECTURE GRAPH */}
              <div className="bg-[#090E14] border border-[#1A2A37] rounded-xl overflow-hidden shadow-2xl relative flex flex-col">
                 <div className="p-4 border-b border-[#1A2A37] bg-[#070A0F] flex items-center justify-between z-10">
                    <h3 className="text-sm font-bold text-[#F4F7FA] tracking-wide uppercase">Current Architecture</h3>
                    <div className="text-[10px] font-mono text-[#19C8F3] uppercase tracking-widest font-bold">Live Status</div>
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
                          <path d="M 400 80 L 400 150" stroke="#19C8F3" />
                          
                          <path d="M 400 150 C 250 150, 250 200, 250 250" stroke="#1687FF" />
                          <path d="M 400 150 C 550 150, 550 200, 550 250" stroke="#1687FF" />
                          <path d="M 400 150 L 400 250" stroke="#1687FF" />
                          
                          <path d="M 400 250 C 650 250, 650 250, 700 250" stroke="#1687FF" />
                          
                          <path d="M 400 290 L 400 350" stroke="#1687FF" />
                          <path d="M 250 290 C 250 330, 400 330, 400 350" stroke="#1687FF" />
                          <path d="M 550 290 C 550 330, 400 330, 400 350" stroke="#1687FF" />
                       </g>

                       {/* NODES */}
                       <g>
                         {/* API GATEWAY */}
                         <g transform="translate(320, 40)">
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#19C8F3" strokeWidth="2" filter="url(#glow-cyan-dash)" opacity="0.3" />
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#19C8F3" strokeWidth="2" />
                           <circle cx="20" cy="20" r="4" fill="#19C8F3" />
                           <text x="35" y="24" fill="#F4F7FA" fontSize="13" fontFamily="monospace" fontWeight="bold">API GATEWAY</text>
                         </g>

                         {/* ORDER MODULE */}
                         <g transform="translate(170, 250)">
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#1687FF" />
                           <text x="35" y="24" fill="#F4F7FA" fontSize="13" fontFamily="monospace" fontWeight="bold">ORDER_SERVICE</text>
                         </g>

                         {/* INVENTORY MODULE */}
                         <g transform="translate(320, 250)">
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#1687FF" />
                           <text x="35" y="24" fill="#F4F7FA" fontSize="13" fontFamily="monospace" fontWeight="bold">INVENTORY_SERVICE</text>
                         </g>

                         {/* PAYMENT MODULE */}
                         <g transform="translate(470, 250)">
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#1687FF" />
                           <text x="35" y="24" fill="#F4F7FA" fontSize="13" fontFamily="monospace" fontWeight="bold">PAYMENT_SERVICE</text>
                         </g>
                         
                         {/* USER MODULE */}
                         <g transform="translate(620, 250)">
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#1687FF" />
                           <text x="35" y="24" fill="#F4F7FA" fontSize="13" fontFamily="monospace" fontWeight="bold">USER_SERVICE</text>
                         </g>

                         {/* DATABASE */}
                         <g transform="translate(320, 350)">
                           <rect width="160" height="40" rx="4" fill="#0E151D" stroke="#566575" strokeOpacity="0.5" />
                           <circle cx="20" cy="20" r="4" fill="#566575" />
                           <text x="35" y="24" fill="#8A98A8" fontSize="13" fontFamily="monospace" fontWeight="bold">SHARED_DB</text>
                         </g>
                       </g>
                    </svg>
                 </div>
                 
                 <div className="p-4 bg-[#070A0F] border-t border-[#1A2A37] text-[10px] font-mono text-[#566575] flex items-center justify-between">
                    <span>Recent structural changes detected: Payment extracted, Dependencies updated.</span>
                    <Link to="/history" className="text-[#19C8F3] hover:underline flex items-center gap-1 font-bold">
                       VIEW TIMELINE <ArrowRight size={12} />
                    </Link>
                 </div>
              </div>

              {/* REPOSITORIES LIST */}
              <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl overflow-hidden flex flex-col">
                 <div className="p-4 border-b border-[#1A2A37] bg-[#0E151D] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F4F7FA] tracking-wide uppercase">Connected Repositories</h3>
                 </div>
                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse min-w-[600px]">
                     <thead>
                       <tr className="border-b border-[#1A2A37] bg-[#090E14]">
                         <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Repository</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Provider</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Branch</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Commits</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Status</th>
                         <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider text-right">Action</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-[#1A2A37]">
                       
                       <tr className="group hover:bg-[#1A2A37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#F4F7FA] font-mono">payment-service</td>
                         <td className="p-4"><Icon icon="mdi:github" width="16" height="16" className="text-[#8A98A8]" /></td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">main</td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">124</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#20C997] uppercase">
                               <CheckCircle2 size={12} /> Syncing
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#566575] hover:text-[#19C8F3] transition-colors">
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>
                       
                       <tr className="group hover:bg-[#1A2A37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#F4F7FA] font-mono">order-service</td>
                         <td className="p-4"><Icon icon="mdi:github" width="16" height="16" className="text-[#8A98A8]" /></td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">main</td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">842</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#20C997] uppercase">
                               <CheckCircle2 size={12} /> Syncing
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#566575] hover:text-[#19C8F3] transition-colors">
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>
                       
                       <tr className="group hover:bg-[#1A2A37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#F4F7FA] font-mono">inventory-service</td>
                         <td className="p-4"><Icon icon="mdi:gitlab" width="16" height="16" className="text-[#FFB020]" /></td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">develop</td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">45</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#20C997] uppercase">
                               <CheckCircle2 size={12} /> Syncing
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#566575] hover:text-[#19C8F3] transition-colors">
                               <ExternalLink size={14} />
                            </button>
                         </td>
                       </tr>
                       
                       <tr className="group hover:bg-[#1A2A37]/30 transition-colors">
                         <td className="p-4 text-sm font-bold text-[#F4F7FA] font-mono">user-service</td>
                         <td className="p-4"><Icon icon="mdi:github" width="16" height="16" className="text-[#8A98A8]" /></td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">main</td>
                         <td className="p-4 text-xs font-mono text-[#8A98A8]">210</td>
                         <td className="p-4">
                            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#8A98A8] uppercase">
                               <Clock size={12} /> Pending
                            </span>
                         </td>
                         <td className="p-4 text-right">
                            <button className="text-[10px] font-mono font-bold text-[#566575] hover:text-[#19C8F3] transition-colors">
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
              <div className="bg-[#0B1017] border border-[#19C8F3]/30 rounded-xl overflow-hidden relative group">
                 <div className="absolute inset-0 bg-gradient-to-br from-[#19C8F3]/5 to-transparent pointer-events-none"></div>
                 <div className="p-5 relative z-10">
                    <div className="flex items-center justify-between mb-4">
                       <h3 className="text-sm font-bold text-[#F4F7FA] tracking-wide uppercase flex items-center gap-2">
                         <Sparkles size={16} className="text-[#19C8F3]" /> AI Insight
                       </h3>
                       <div className="px-2 py-0.5 bg-[#19C8F3]/10 border border-[#19C8F3]/20 rounded text-[9px] font-mono font-bold text-[#19C8F3] uppercase tracking-widest">
                          New
                       </div>
                    </div>
                    
                    <h4 className="text-sm font-bold text-[#F4F7FA] mb-2 leading-snug">
                       Payment service extraction reduces Order module blast radius.
                    </h4>
                    <p className="text-xs text-[#8A98A8] mb-4 leading-relaxed line-clamp-3">
                       Based on repository evidence from commit d82f91a, extracting the Payment responsibilities successfully decoupled 8 external dependencies from the core Order processing engine.
                    </p>
                    
                    <Link to="/insights" className="inline-flex h-9 px-4 items-center justify-center gap-2 text-[10px] font-mono font-bold text-[#070A0F] bg-[#19C8F3] hover:bg-[#19C8F3]/90 transition-colors rounded uppercase w-full">
                       View Insight <ArrowRight size={14} />
                    </Link>
                 </div>
              </div>

              {/* RECENT CHANGES */}
              <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl overflow-hidden flex flex-col flex-1">
                 <div className="p-5 border-b border-[#1A2A37] bg-[#0E151D] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F4F7FA] tracking-wide uppercase">Recent Changes</h3>
                 </div>
                 
                 <div className="divide-y divide-[#1A2A37] flex-1">
                    
                    <div className="p-4 hover:bg-[#1A2A37]/30 transition-colors group cursor-pointer">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="px-1.5 py-0.5 bg-[#FFB020]/10 border border-[#FFB020]/20 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest rounded">Module Extraction</span>
                         <span className="text-[10px] font-mono text-[#566575]">2h ago</span>
                       </div>
                       <div className="text-sm font-bold text-[#F4F7FA] group-hover:text-[#19C8F3] transition-colors">PaymentService extracted</div>
                    </div>

                    <div className="p-4 hover:bg-[#1A2A37]/30 transition-colors group cursor-pointer">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="px-1.5 py-0.5 bg-[#19C8F3]/10 border border-[#19C8F3]/20 text-[#19C8F3] text-[9px] font-mono font-bold uppercase tracking-widest rounded">Dependency</span>
                         <span className="text-[10px] font-mono text-[#566575]">Yesterday</span>
                       </div>
                       <div className="text-sm font-bold text-[#F4F7FA] group-hover:text-[#19C8F3] transition-colors">Order dependency changed</div>
                    </div>

                    <div className="p-4 hover:bg-[#1A2A37]/30 transition-colors group cursor-pointer">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="px-1.5 py-0.5 bg-[#FFB020]/10 border border-[#FFB020]/20 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest rounded">Module Split</span>
                         <span className="text-[10px] font-mono text-[#566575]">3 days ago</span>
                       </div>
                       <div className="text-sm font-bold text-[#F4F7FA] group-hover:text-[#19C8F3] transition-colors">Settlement pipeline decoupled</div>
                    </div>
                    
                 </div>

                 <div className="p-4 border-t border-[#1A2A37] bg-[#090E14]">
                    <Link to="/evidence" className="inline-flex h-9 px-4 items-center justify-center gap-2 text-[10px] font-mono font-bold text-[#8A98A8] border border-[#1A2A37] hover:border-[#566575] hover:text-[#F4F7FA] transition-colors rounded uppercase w-full">
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
