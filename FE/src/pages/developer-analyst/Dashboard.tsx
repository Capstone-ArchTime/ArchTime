import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  FolderKanban, 
  Activity,
  GitCommit,
  GitBranch,
  FolderGit2,
  GitPullRequest,
  Box,
  Sparkles,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import { Icon } from '@iconify/react';

const Dashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10">
        
        {/* DASHBOARD HEADER */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E151D] border border-[#1A2A37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
            <span className="text-[10px] font-mono text-[#19C8F3] tracking-wider font-semibold uppercase">ArchTime Observatory</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#F4F7FA] mb-2">Good morning, Alex</h2>
              <p className="text-[#8A98A8] text-sm max-w-xl leading-relaxed">
                Reconstruct and trace how your software architecture evolves across repository history.
              </p>
            </div>
            <button className="shrink-0 h-10 px-5 bg-[#0E151D] hover:bg-[#1A2A37] border border-[#1A2A37] text-[#F4F7FA] font-medium text-xs rounded-lg transition-colors flex items-center gap-2">
              <FolderGit2 size={16} className="text-[#19C8F3]" />
              ANALYZE NEW REPOSITORY
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#1A2A37] to-transparent mt-8"></div>
        </div>

        {/* SECTION 01 - PERSONAL OVERVIEW */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl hover:border-[#566575] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <FolderKanban size={48} className="text-[#F4F7FA]" />
            </div>
            <h4 className="text-[10px] font-mono font-semibold text-[#8A98A8] tracking-widest uppercase mb-4">My Projects</h4>
            <div className="text-4xl font-bold text-[#F4F7FA] mb-1">03</div>
            <p className="text-xs text-[#566575] mb-4">Active projects</p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#20C997]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#20C997]"></div>
              +1 this month
            </div>
          </div>

          <div className="bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl hover:border-[#566575] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitBranch size={48} className="text-[#F4F7FA]" />
            </div>
            <h4 className="text-[10px] font-mono font-semibold text-[#8A98A8] tracking-widest uppercase mb-4">Repositories</h4>
            <div className="text-4xl font-bold text-[#F4F7FA] mb-1">07</div>
            <p className="text-xs text-[#566575] mb-4">Connected repositories</p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#8A98A8]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#566575]"></div>
              Stable connections
            </div>
          </div>

          <div className="bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl hover:border-[#566575] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity size={48} className="text-[#F4F7FA]" />
            </div>
            <h4 className="text-[10px] font-mono font-semibold text-[#8A98A8] tracking-widest uppercase mb-4">Analysis Jobs</h4>
            <div className="text-4xl font-bold text-[#F4F7FA] mb-1">18</div>
            <p className="text-xs text-[#566575] mb-4">Completed analyses</p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#19C8F3]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
              1 running currently
            </div>
          </div>

          <div className="bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl hover:border-[#566575] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitPullRequest size={48} className="text-[#FFB020]" />
            </div>
            <h4 className="text-[10px] font-mono font-semibold text-[#FFB020] tracking-widest uppercase mb-4">Architectural Changes</h4>
            <div className="text-4xl font-bold text-[#F4F7FA] mb-1">64</div>
            <p className="text-xs text-[#566575] mb-4">Detected structural changes</p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#FFB020]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FFB020]"></div>
              +12 in last 7 days
            </div>
          </div>

        </div>

        {/* TWO COLUMN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT MAJOR COLUMN (2/3) */}
          <div className="lg:col-span-2 space-y-10">
            
            {/* SECTION 02 - ARCHITECTURE EVOLUTION */}
            <section>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-[#F4F7FA] tracking-tight">Architecture Evolution</h3>
                <p className="text-sm text-[#8A98A8] mt-1">Explore how your system changed across repository history.</p>
              </div>
              
              <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl overflow-hidden flex flex-col shadow-2xl relative">
                {/* SVG GRAPH AREA */}
                <div className="p-8 h-[400px] relative w-full overflow-hidden border-b border-[#1A2A37]">
                    {/* Grid Background */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                    
                    {/* Pure SVG Graph */}
                    <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                      <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <linearGradient id="glow-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#1687FF" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#19C8F3" />
                          </linearGradient>
                          <linearGradient id="glow-amber" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#1687FF" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#FFB020" />
                          </linearGradient>
                          <filter id="blur-cyan" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                          <filter id="blur-amber" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                        </defs>
                        
                        {/* Lines */}
                        <g fill="none" strokeWidth="2" opacity="0.6">
                          {/* Static Blue Lines */}
                          <path d="M 200 200 C 300 200, 300 100, 450 100" stroke="#1687FF" />
                          <path d="M 200 200 C 300 200, 300 300, 450 300" stroke="#1687FF" />
                          
                          <path d="M 550 100 C 650 100, 650 50, 800 50" stroke="#1687FF" />
                          <path d="M 550 100 C 650 100, 650 150, 800 150" stroke="#1687FF" />
                          
                          <path d="M 550 300 C 650 300, 650 350, 800 350" stroke="#566575" />
                          
                          {/* Animated Changed Lines */}
                          <path d="M 550 300 C 650 300, 650 250, 800 250" stroke="url(#glow-amber)" strokeWidth="2.5" filter="url(#blur-amber)" />
                        </g>
                        
                        {/* Nodes */}
                        <g>
                          {/* Root Node */}
                          <g transform="translate(80, 180)">
                            <rect width="120" height="40" rx="4" fill="#0E151D" stroke="#1A2A37" />
                            <circle cx="15" cy="20" r="4" fill="#1687FF" />
                            <text x="28" y="24" fill="#F4F7FA" fontSize="12" fontFamily="monospace" fontWeight="bold">ecomm-core</text>
                          </g>
                          
                          {/* Layer 1 */}
                          <g transform="translate(430, 80)">
                            <rect width="120" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeOpacity="0.5" />
                            <circle cx="15" cy="20" r="4" fill="#1687FF" />
                            <text x="28" y="24" fill="#F4F7FA" fontSize="12" fontFamily="monospace" fontWeight="bold">auth-svc</text>
                          </g>
                          <g transform="translate(430, 280)">
                            <rect width="120" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeOpacity="0.5" />
                            <circle cx="15" cy="20" r="4" fill="#1687FF" />
                            <text x="28" y="24" fill="#F4F7FA" fontSize="12" fontFamily="monospace" fontWeight="bold">catalog-svc</text>
                          </g>
                          
                          {/* Layer 2 */}
                          <g transform="translate(780, 30)">
                            <rect width="130" height="40" rx="4" fill="#0E151D" stroke="#19C8F3" strokeOpacity="0.8" filter="url(#blur-cyan)" opacity="0.4" />
                            <rect width="130" height="40" rx="4" fill="#0E151D" stroke="#19C8F3" strokeWidth="1.5" />
                            <circle cx="15" cy="20" r="4" fill="#19C8F3" />
                            <text x="28" y="24" fill="#19C8F3" fontSize="12" fontFamily="monospace" fontWeight="bold">user-profile</text>
                          </g>
                          
                          <g transform="translate(780, 130)">
                            <rect width="130" height="40" rx="4" fill="#0E151D" stroke="#1687FF" strokeWidth="1.5" />
                            <circle cx="15" cy="20" r="4" fill="#1687FF" />
                            <text x="28" y="24" fill="#F4F7FA" fontSize="12" fontFamily="monospace" fontWeight="bold">payment-gw</text>
                          </g>
                          
                          {/* CHANGED NODE */}
                          <g transform="translate(780, 230)">
                            <rect width="130" height="40" rx="4" fill="#0E151D" stroke="#FFB020" strokeWidth="1.5" filter="url(#blur-amber)" opacity="0.6" />
                            <rect width="130" height="40" rx="4" fill="#0E151D" stroke="#FFB020" strokeWidth="1.5" />
                            <circle cx="15" cy="20" r="4" fill="#FFB020" />
                            <text x="28" y="24" fill="#FFB020" fontSize="12" fontFamily="monospace" fontWeight="bold">inventory-db</text>
                          </g>
                          
                          <g transform="translate(780, 330)">
                            <rect width="130" height="40" rx="4" fill="#090E14" stroke="#1A2A37" />
                            <circle cx="15" cy="20" r="4" fill="#566575" />
                            <text x="28" y="24" fill="#8A98A8" fontSize="12" fontFamily="monospace" fontWeight="bold">legacy-job</text>
                          </g>
                        </g>
                        
                        {/* Floating Badges */}
                        <g transform="translate(850, 195)">
                          <rect width="80" height="20" rx="2" fill="#0E151D" stroke="#FFB020" strokeOpacity="0.5" />
                          <text x="40" y="14" fill="#FFB020" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">+ Extracted</text>
                        </g>
                      </svg>
                    </div>
                </div>
                
                {/* TIMELINE */}
                <div className="bg-[#090E14] p-4 px-8 flex items-center justify-between">
                  
                  <div className="flex-1 flex items-center justify-between max-w-xl mx-auto relative px-8">
                    {/* Connecting Line */}
                    <div className="absolute top-1/2 left-8 right-8 h-[1px] bg-[#1A2A37] -translate-y-1/2 z-0"></div>
                    <div className="absolute top-1/2 left-8 right-[20%] h-[2px] bg-[#19C8F3] -translate-y-1/2 z-0"></div>
                    
                    {/* Nodes */}
                    <div className="relative z-10 flex flex-col items-center gap-2 cursor-pointer group">
                      <div className="w-3 h-3 rounded-full bg-[#19C8F3] border-4 border-[#090E14] group-hover:scale-125 transition-transform"></div>
                      <span className="text-[10px] font-mono text-[#8A98A8]">v1.0</span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center gap-2 cursor-pointer group">
                      <div className="w-3 h-3 rounded-full bg-[#19C8F3] border-4 border-[#090E14] group-hover:scale-125 transition-transform"></div>
                      <span className="text-[10px] font-mono text-[#8A98A8]">v1.2</span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center gap-2 cursor-pointer group">
                      <div className="w-3 h-3 rounded-full bg-[#19C8F3] border-4 border-[#090E14] shadow-[0_0_8px_#19C8F3] scale-125"></div>
                      <span className="text-[10px] font-mono text-[#F4F7FA] font-bold">v1.5</span>
                      <span className="absolute -top-7 text-[9px] font-mono bg-[#19C8F3] text-[#070A0F] px-1.5 py-0.5 rounded font-bold">ACTIVE</span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center gap-2 cursor-pointer group">
                      <div className="w-3 h-3 rounded-full bg-[#1A2A37] border-4 border-[#090E14] group-hover:scale-125 transition-transform"></div>
                      <span className="text-[10px] font-mono text-[#566575]">v2.0</span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center gap-2 cursor-pointer group">
                      <div className="w-3 h-3 rounded-full bg-[#1A2A37] border-4 border-[#090E14] group-hover:scale-125 transition-transform"></div>
                      <span className="text-[10px] font-mono text-[#566575]">HEAD</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0 ml-8">
                    <button className="h-8 px-3 bg-[#0B1017] border border-[#1A2A37] text-[#8A98A8] hover:text-[#F4F7FA] font-mono text-xs rounded transition-colors flex items-center gap-2">
                      v1.5 <ChevronDown size={14} />
                    </button>
                    <button className="h-8 px-4 bg-[#0E151D] border border-[#1A2A37] hover:border-[#19C8F3]/50 text-[#19C8F3] font-mono font-bold text-xs rounded transition-all shadow-[0_0_10px_rgba(25,200,243,0.05)]">
                      COMPARE
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 04 - MY ANALYSIS JOBS */}
            <section>
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <h3 className="text-xl font-bold text-[#F4F7FA] tracking-tight">Recent Mining Jobs</h3>
                  <p className="text-sm text-[#8A98A8] mt-1">Track your repository analysis activity.</p>
                </div>
              </div>

              <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#0E151D] border-b border-[#1A2A37] text-[10px] font-mono text-[#8A98A8] uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3 font-medium">Repository</th>
                      <th className="px-5 py-3 font-medium">Commit Range</th>
                      <th className="px-5 py-3 font-medium">Analysis Stage</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Duration</th>
                      <th className="px-5 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A2A37]">
                    
                    <tr className="hover:bg-[#0E151D]/50 transition-colors group">
                      <td className="px-5 py-4 font-mono text-[#F4F7FA] font-medium">payment-service</td>
                      <td className="px-5 py-4 font-mono text-[#566575] text-xs">
                        3e4877f <span className="text-[#8A98A8]">→</span> d82f91a
                      </td>
                      <td className="px-5 py-4 text-[#8A98A8]">Graph edit distance</td>
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#20C997]/10 border border-[#20C997]/20 text-[10px] font-mono text-[#20C997] font-bold">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#20C997]"></div>
                          COMPLETED
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#566575] font-mono text-xs">2m 14s</td>
                      <td className="px-5 py-4 text-right">
                        <button className="text-[#19C8F3] hover:text-[#19C8F3]/80 font-mono text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          Details &rarr;
                        </button>
                      </td>
                    </tr>

                    <tr className="hover:bg-[#0E151D]/50 transition-colors group">
                      <td className="px-5 py-4 font-mono text-[#F4F7FA] font-medium">order-service</td>
                      <td className="px-5 py-4 font-mono text-[#566575] text-xs">
                        a028fa1 <span className="text-[#8A98A8]">→</span> 8af31c2
                      </td>
                      <td className="px-5 py-4 text-[#8A98A8]">Dependency analysis</td>
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#19C8F3]/10 border border-[#19C8F3]/20 text-[10px] font-mono text-[#19C8F3] font-bold">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] animate-pulse"></div>
                          RUNNING
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#566575] font-mono text-xs">3m 37s</td>
                      <td className="px-5 py-4 text-right">
                        <button className="text-[#19C8F3] hover:text-[#19C8F3]/80 font-mono text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          Details &rarr;
                        </button>
                      </td>
                    </tr>

                    <tr className="hover:bg-[#0E151D]/50 transition-colors group">
                      <td className="px-5 py-4 font-mono text-[#F4F7FA] font-medium">inventory-service</td>
                      <td className="px-5 py-4 font-mono text-[#566575] text-xs">
                        81a029c <span className="text-[#8A98A8]">→</span> b149e2c
                      </td>
                      <td className="px-5 py-4 text-[#8A98A8]">Analysis persisted</td>
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#20C997]/10 border border-[#20C997]/20 text-[10px] font-mono text-[#20C997] font-bold">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#20C997]"></div>
                          COMPLETED
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#566575] font-mono text-xs">1m 45s</td>
                      <td className="px-5 py-4 text-right">
                        <button className="text-[#19C8F3] hover:text-[#19C8F3]/80 font-mono text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          Details &rarr;
                        </button>
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </section>
            
          </div>

          {/* RIGHT MINOR COLUMN (1/3) */}
          <div className="space-y-10">
            
            {/* SECTION 03 - RECENT ARCHITECTURAL CHANGES */}
            <section>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-[#F4F7FA] tracking-tight">Recent Architectural Changes</h3>
                <p className="text-sm text-[#8A98A8] mt-1">Structural changes detected from your repository evidence.</p>
              </div>
              
              <div className="space-y-4">
                
                {/* Event Card 1 */}
                <div className="bg-[#0B1017] border border-[#1A2A37] hover:border-[#FFB020]/50 p-5 rounded-xl transition-colors group">
                  <div className="flex items-center gap-2 mb-3">
                      <div className="px-2 py-0.5 rounded bg-[#FFB020]/10 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest border border-[#FFB020]/20">
                        Module Extraction
                      </div>
                      <span className="text-xs text-[#566575] font-mono">2 hours ago</span>
                  </div>
                  <h4 className="text-[#F4F7FA] font-bold text-sm mb-2 uppercase tracking-wide">Payment Service Extracted</h4>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-1.5 text-xs text-[#8A98A8] font-mono bg-[#0E151D] px-2 py-1 rounded border border-[#1A2A37]">
                      <Box size={12} className="text-[#1687FF]" />
                      payment-service
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#566575] font-mono">
                      <GitCommit size={12} />
                      d82f91a
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono mb-5">
                    <div className="text-[#8A98A8]"><span className="text-[#19C8F3]">12</span> files changed</div>
                    <div className="text-[#8A98A8]"><span className="text-[#20C997]">+8</span> dependencies</div>
                  </div>

                  <button className="text-[#FFB020] hover:text-[#FFB020]/80 font-mono text-xs font-semibold flex items-center gap-1 transition-colors">
                    VIEW EVIDENCE <ArrowRight size={14} />
                  </button>
                </div>

                {/* Event Card 2 */}
                <div className="bg-[#0B1017] border border-[#1A2A37] hover:border-[#FFB020]/50 p-5 rounded-xl transition-colors group">
                  <div className="flex items-center gap-2 mb-3">
                      <div className="px-2 py-0.5 rounded bg-[#FFB020]/10 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest border border-[#FFB020]/20">
                        Dependency Change
                      </div>
                      <span className="text-xs text-[#566575] font-mono">Yesterday</span>
                  </div>
                  <h4 className="text-[#F4F7FA] font-bold text-sm mb-2 uppercase tracking-wide">Order Dependency Changed</h4>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-1.5 text-xs text-[#8A98A8] font-mono bg-[#0E151D] px-2 py-1 rounded border border-[#1A2A37]">
                      <Box size={12} className="text-[#1687FF]" />
                      order-service
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#566575] font-mono">
                      <GitCommit size={12} />
                      8af31c2
                    </div>
                  </div>

                  <button className="text-[#FFB020] hover:text-[#FFB020]/80 font-mono text-xs font-semibold flex items-center gap-1 transition-colors">
                    VIEW EVIDENCE <ArrowRight size={14} />
                  </button>
                </div>

                {/* Event Card 3 */}
                <div className="bg-[#0B1017] border border-[#1A2A37] hover:border-[#FFB020]/50 p-5 rounded-xl transition-colors group">
                  <div className="flex items-center gap-2 mb-3">
                      <div className="px-2 py-0.5 rounded bg-[#FFB020]/10 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest border border-[#FFB020]/20">
                        Module Split
                      </div>
                      <span className="text-xs text-[#566575] font-mono">3 days ago</span>
                  </div>
                  <h4 className="text-[#F4F7FA] font-bold text-sm mb-2 uppercase tracking-wide">Settlement Pipeline Decoupled</h4>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-1.5 text-xs text-[#8A98A8] font-mono bg-[#0E151D] px-2 py-1 rounded border border-[#1A2A37]">
                      <Box size={12} className="text-[#1687FF]" />
                      settlement-core
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#566575] font-mono">
                      <GitCommit size={12} />
                      c4199be
                    </div>
                  </div>

                  <button className="text-[#FFB020] hover:text-[#FFB020]/80 font-mono text-xs font-semibold flex items-center gap-1 transition-colors">
                    VIEW EVIDENCE <ArrowRight size={14} />
                  </button>
                </div>

              </div>
            </section>

            {/* SECTION 06 - AI ARCHITECTURAL INSIGHT */}
            <section>
              <div className="bg-gradient-to-br from-[#0B1017] to-[#0E151D] border border-[#1A2A37] rounded-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Sparkles size={64} className="text-[#19C8F3]" />
                </div>
                
                <div className="p-6 relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={16} className="text-[#19C8F3]" />
                    <h4 className="text-[#F4F7FA] font-bold text-sm tracking-wide">Latest Architectural Insight</h4>
                  </div>
                  
                  <p className="text-[#F4F7FA] text-sm leading-relaxed mb-6 font-medium bg-[#19C8F3]/5 p-3 rounded-lg border border-[#19C8F3]/10">
                    "Payment processing was extracted from the Order module between commits 3e4877f and d82f91a."
                  </p>

                  <h5 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase mb-3">Evidence</h5>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-xs font-mono text-[#8A98A8]">
                      <div className="w-1 h-1 rounded-full bg-[#19C8F3]"></div>
                      Commit d82f91a
                    </li>
                    <li className="flex items-center gap-2 text-xs font-mono text-[#8A98A8]">
                      <div className="w-1 h-1 rounded-full bg-[#19C8F3]"></div>
                      12 modified files
                    </li>
                    <li className="flex items-center gap-2 text-xs font-mono text-[#8A98A8]">
                      <div className="w-1 h-1 rounded-full bg-[#19C8F3]"></div>
                      8 dependencies added
                    </li>
                    <li className="flex items-center gap-2 text-xs font-mono text-[#8A98A8]">
                      <div className="w-1 h-1 rounded-full bg-[#19C8F3]"></div>
                      3 dependencies removed
                    </li>
                  </ul>

                  <button className="w-full h-9 bg-[#0B1017] hover:bg-[#1A2A37] border border-[#19C8F3]/30 text-[#19C8F3] font-mono font-bold text-xs rounded transition-colors shadow-[0_0_10px_rgba(25,200,243,0.05)]">
                    VIEW EVIDENCE
                  </button>
                </div>
              </div>
            </section>
            
            {/* SECTION 05 - MY PROJECTS (Compact version) */}
            <section>
                <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#F4F7FA] tracking-tight uppercase">Recent Projects</h3>
                </div>
              </div>
              <div className="space-y-3">
                  
                  <div className="bg-[#0B1017] border border-[#1A2A37] hover:border-[#566575] p-4 rounded-xl transition-colors cursor-pointer group flex gap-4 items-center">
                    <div className="w-12 h-12 bg-[#0E151D] border border-[#1A2A37] rounded-lg flex items-center justify-center shrink-0 group-hover:border-[#19C8F3]/50 transition-colors">
                        <FolderKanban size={20} className="text-[#8A98A8] group-hover:text-[#19C8F3] transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-[#F4F7FA] text-sm font-bold truncate mb-1">E-Commerce Platform</h4>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-[#566575]">
                          <span>4 repos</span>
                          <span>•</span>
                          <span className="text-[#FFB020]">38 changes</span>
                        </div>
                    </div>
                    <ArrowRight size={16} className="text-[#566575] group-hover:text-[#F4F7FA] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </div>

                  <div className="bg-[#0B1017] border border-[#1A2A37] hover:border-[#566575] p-4 rounded-xl transition-colors cursor-pointer group flex gap-4 items-center">
                    <div className="w-12 h-12 bg-[#0E151D] border border-[#1A2A37] rounded-lg flex items-center justify-center shrink-0 group-hover:border-[#19C8F3]/50 transition-colors">
                        <FolderKanban size={20} className="text-[#8A98A8] group-hover:text-[#19C8F3] transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-[#F4F7FA] text-sm font-bold truncate mb-1">Payment Platform</h4>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-[#566575]">
                          <span>2 repos</span>
                          <span>•</span>
                          <span className="text-[#FFB020]">21 changes</span>
                        </div>
                    </div>
                    <ArrowRight size={16} className="text-[#566575] group-hover:text-[#F4F7FA] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </div>

              </div>
            </section>

            {/* SECTION 07 - QUICK ACTION */}
            <section>
              <div className="bg-[#0E151D] border border-[#1A2A37] border-dashed p-6 rounded-xl text-center">
                  <div className="w-10 h-10 bg-[#1A2A37]/50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <FolderGit2 size={18} className="text-[#8A98A8]" />
                  </div>
                  <h4 className="text-[#F4F7FA] font-bold text-sm mb-2">Start New Analysis</h4>
                  <p className="text-xs text-[#566575] mb-5 max-w-[200px] mx-auto">Connect a repository and reconstruct its architectural history.</p>
                  <div className="flex gap-2 justify-center">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1017] border border-[#1A2A37] hover:border-[#8A98A8] text-[#F4F7FA] text-[10px] font-mono font-bold rounded transition-colors">
                      <Icon icon="mdi:github" width="14" height="14" /> GITHUB
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1017] border border-[#1A2A37] hover:border-[#8A98A8] text-[#F4F7FA] text-[10px] font-mono font-bold rounded transition-colors">
                      <Icon icon="mdi:gitlab" width="14" height="14" className="text-[#FC6D26]" /> GITLAB
                    </button>
                  </div>
              </div>
            </section>

          </div>
        </div>
        
        {/* Bottom Padding */}
        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
