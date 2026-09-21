import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  GitCommit,
  GitBranch,
  ChevronDown,
  ArrowRight,
  Database,
  Cpu,
  Box,
  FileText,
  User,
  Calendar,
  Layers,
  GitMerge,
  GitCompare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Mock Commit Data
const commits = [
  {
    hash: 'a82f91a',
    version: 'v1.0',
    title: 'Initial API Gateway implementation',
    author: 'alex@example.com',
    date: 'Sep 10, 2026',
    files: 24,
    archChanges: 0,
    depAdded: 12,
    depRemoved: 0
  },
  {
    hash: 'd82f91a',
    version: 'v1.2',
    title: 'PaymentService extracted',
    author: 'developer@example.com',
    date: 'Sep 18, 2026',
    files: 12,
    archChanges: 2, // 1 extracted, 1 dep changed
    depAdded: 8,
    depRemoved: 3
  },
  {
    hash: '8af31c2',
    version: 'v1.5',
    title: 'Order Dependency Changed',
    author: 'alex@example.com',
    date: 'Sep 20, 2026',
    files: 5,
    archChanges: 1,
    depAdded: 2,
    depRemoved: 1
  },
  {
    hash: 'c4199be',
    version: 'v2.0',
    title: 'Settlement Pipeline Decoupled',
    author: 'developer@example.com',
    date: 'Sep 21, 2026',
    files: 18,
    archChanges: 3,
    depAdded: 15,
    depRemoved: 6
  }
];

const ArchitectureHistory: React.FC = () => {
  const [activeCommit, setActiveCommit] = useState(commits[1].hash); // Default to d82f91a
  
  const currentCommit = commits.find(c => c.hash === activeCommit) || commits[1];
  
  // Base State (Before extraction)
  const isBaseState = activeCommit === 'a82f91a';

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 flex flex-col h-[calc(100vh-140px)]">
        
        {/* HEADER & TOP CONTROLS */}
        <div className="shrink-0 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#222c37] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
                <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture Observatory</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Architecture History</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Reconstruct how the system architecture evolved across repository revisions.
              </p>
            </div>
            <button className="shrink-0 h-10 px-5 bg-[#11161b] hover:bg-[#222c37] border border-[#222c37] text-[#38bdf8] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.05)]">
              <GitCompare size={16} />
              COMPARE REVISIONS
            </button>
          </div>

          {/* PROJECT SELECTOR FILTERS */}
          <div className="flex flex-wrap items-center gap-3 bg-[#11161b] p-3 border border-[#222c37]">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#5f636b] uppercase px-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Filters:</div>
            
            <button className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Project</span>
              <span className="text-xs font-bold text-[#f4f4f6]">E-Commerce Platform</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>
            
            <button className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository</span>
              <span className="text-xs font-bold text-[#f4f4f6]">order-service</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>

            <button className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Branch</span>
              <span className="text-xs font-bold text-[#f4f4f6] flex items-center gap-1.5"><GitBranch size={12} className="text-[#38bdf8]" /> main</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>

            <button className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group ml-auto">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Time Range</span>
              <span className="text-xs font-bold text-[#f4f4f6]">ALL TIME</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>
          </div>
        </div>

        {/* MAIN CONTENT SPLIT */}
        <div className="flex-1 flex gap-6 min-h-0">
          
          {/* LEFT: TIMELINE & GRAPH (70%) */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            
            {/* HORIZONTAL TIMELINE */}
            <div className="bg-[#11161b] border border-[#222c37] p-6 relative shrink-0">
              <div className="absolute top-[45px] left-12 right-12 h-[2px] bg-[#222c37]"></div>
              
              <div className="flex items-center justify-between relative z-10 px-6">
                {commits.map((commit, i) => {
                  const isActive = activeCommit === commit.hash;
                  // Connecting line progress
                  const isPast = commits.findIndex(c => c.hash === activeCommit) >= i;
                  
                  return (
                    <div 
                      key={commit.hash}
                      className="flex flex-col items-center gap-3 cursor-pointer group relative"
                      onClick={() => setActiveCommit(commit.hash)}
                    >
                      <div className="text-[10px] font-mono text-[#5f636b] font-bold group-hover:text-[#f4f4f6] transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{commit.version}</div>
                      
                      <div className={`w-4 h-4 rounded-full border-4 transition-all duration-300 flex items-center justify-center ${
                        isActive 
                          ? 'bg-[#38bdf8] border-[#080b0e] scale-125 shadow-[0_0_12px_#38bdf8]' 
                          : isPast 
                            ? 'bg-[#38bdf8] border-[#11161b] group-hover:scale-110' 
                            : 'bg-[#222c37] border-[#11161b] group-hover:bg-[#5f636b]'
                      }`}></div>
                      
                      <div className={`text-xs font-mono transition-colors flex items-center gap-1 ${
                        isActive ? 'text-[#38bdf8] font-bold' : 'text-[#94a3b8]'
                      }`}>
                        <GitCommit size={12} />
                        {commit.hash}
                      </div>

                      {/* Tooltip on hover */}
                      <div className="absolute top-16 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 text-center bg-[#161d24] border border-[#222c37] p-2 shadow-2xl z-20">
                         <div className="text-xs text-[#f4f4f6] font-bold mb-1 truncate">{commit.title}</div>
                         <div className="text-[10px] font-mono text-[#ffb03a]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{commit.archChanges} Arch Changes</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ARCHITECTURE SVG SNAPSHOT */}
            <div className="flex-1 bg-[#080b0e] border border-[#222c37] overflow-hidden relative shadow-2xl flex flex-col">
              
              {/* Overlay Indicators */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                <div className="px-2 py-1 bg-[#161d24]/80 backdrop-blur-sm border border-[#222c37] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse"></div>
                  <span className="text-[10px] font-mono text-[#38bdf8] uppercase tracking-wider font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Active Modules</span>
                </div>
                {!isBaseState && (
                  <div className="px-2 py-1 bg-[#161d24]/80 backdrop-blur-sm border border-[#ffb03a]/30 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#ffb03a] shadow-[0_0_5px_#ffb03a]"></div>
                    <span className="text-[10px] font-mono text-[#ffb03a] uppercase tracking-wider font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Changed in this revision</span>
                  </div>
                )}
              </div>

              {/* The SVG Graph */}
              <div className="flex-1 relative w-full h-full">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                
                <svg viewBox="0 0 800 500" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* LINES */}
                  <g fill="none" strokeWidth="2" opacity="0.6">
                     {/* Static lines (Always exist) */}
                     <path d="M 400 150 L 400 250" stroke="#38bdf8" />
                     <path d="M 400 150 C 250 150, 250 200, 250 250" stroke="#38bdf8" />
                     <path d="M 250 290 L 250 380" stroke="#38bdf8" />
                     
                     <AnimatePresence>
                       {isBaseState ? (
                         <motion.path 
                           initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }}
                           d="M 400 150 C 550 150, 550 200, 550 250" 
                           stroke="#38bdf8" 
                         />
                       ) : (
                         <motion.path 
                           initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0 }}
                           d="M 400 150 C 550 150, 550 200, 550 250" 
                           stroke="#ffb03a" strokeWidth="3" filter="url(#glow-amber)"
                           strokeDasharray="4 4"
                         />
                       )}
                     </AnimatePresence>
                     
                     <path d="M 400 290 L 400 380" stroke="#38bdf8" />
                     
                     {/* New Line for Payment Extraction in State 2 */}
                     {!isBaseState && (
                        <motion.path 
                          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.8 }}
                          transition={{ duration: 0.8, ease: "easeInOut" }}
                          d="M 550 290 L 550 380" 
                          stroke="#ffb03a" strokeWidth="2"
                        />
                     )}
                     
                     {/* Dep line from extracted to DB */}
                     {!isBaseState && (
                        <motion.path 
                          initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 0.5 }}
                          d="M 550 420 C 550 460, 400 460, 400 420" 
                          stroke="#38bdf8" 
                        />
                     )}
                  </g>

                  {/* NODES */}
                  <g>
                    {/* API GATEWAY */}
                    <g transform="translate(320, 110)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeWidth="2" filter="url(#glow-cyan)" opacity="0.3" />
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeWidth="2" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">API GATEWAY</text>
                    </g>

                    {/* USER MODULE */}
                    <g transform="translate(170, 250)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">USER_SERVICE</text>
                    </g>

                    {/* ORDER MODULE */}
                    <g transform="translate(320, 250)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">ORDER_SERVICE</text>
                    </g>

                    {/* DATABASE */}
                    <g transform="translate(320, 380)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#5f636b" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#5f636b" />
                      <text x="35" y="24" fill="#94a3b8" fontSize="13" fontFamily="monospace" fontWeight="bold">DATABASE</text>
                    </g>

                    {/* PAYMENT MODULE (Changes state) */}
                    <AnimatePresence mode="wait">
                      {isBaseState ? (
                        <motion.g 
                          key="state1"
                          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                          transform="translate(470, 250)"
                        >
                          <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                          <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                          <text x="35" y="24" fill="#94a3b8" fontSize="13" fontFamily="monospace" fontWeight="bold">LEGACY_MONO</text>
                        </motion.g>
                      ) : (
                        <motion.g 
                          key="state2"
                          initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }}
                          transform="translate(470, 250)"
                        >
                          <rect width="160" height="40" rx="4" fill="#161d24" stroke="#ffb03a" strokeWidth="2" filter="url(#glow-amber)" opacity="0.6" />
                          <rect width="160" height="40" rx="4" fill="#161d24" stroke="#ffb03a" strokeWidth="2" />
                          <circle cx="20" cy="20" r="4" fill="#ffb03a" />
                          <text x="35" y="24" fill="#ffb03a" fontSize="13" fontFamily="monospace" fontWeight="bold">PAYMENT_SVC</text>
                          
                          {/* Floating Tag */}
                          <g transform="translate(140, -15)">
                            <rect width="70" height="18" rx="2" fill="#ffb03a" fillOpacity="0.1" stroke="#ffb03a" />
                            <text x="35" y="12" fill="#ffb03a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">EXTRACTED</text>
                          </g>
                        </motion.g>
                      )}
                    </AnimatePresence>

                    {/* NEW PAYMENT DATABASE (Only in state 2) */}
                    {!isBaseState && (
                      <motion.g 
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        transform="translate(470, 380)"
                      >
                        <rect width="160" height="40" rx="4" fill="#161d24" stroke="#ffb03a" strokeWidth="1.5" />
                        <circle cx="20" cy="20" r="4" fill="#ffb03a" />
                        <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">PAYMENT_DB</text>
                        
                        <g transform="translate(140, -15)">
                          <rect width="50" height="18" rx="2" fill="#ffb03a" fillOpacity="0.1" stroke="#ffb03a" />
                          <text x="25" y="12" fill="#ffb03a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">NEW</text>
                        </g>
                      </motion.g>
                    )}
                  </g>
                </svg>
              </div>
            </div>
            
          </div>

          {/* RIGHT: REVISION DETAILS (30%) */}
          <div className="w-80 shrink-0 flex flex-col gap-6">
            
            <div className="bg-[#11161b] border border-[#222c37] overflow-hidden flex flex-col h-full">
              {/* Header */}
              <div className="p-5 border-b border-[#222c37] bg-[#161d24]">
                <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Selected Revision</div>
                <div className="flex items-center gap-2 mb-3">
                  <GitCommit size={18} className="text-[#38bdf8]" />
                  <span className="text-xl font-mono font-bold text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{currentCommit.hash}</span>
                </div>
                <h3 className="text-sm font-bold text-[#f4f4f6] leading-snug">
                  {currentCommit.title}
                </h3>
              </div>

              {/* Scrollable details */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
                
                {/* Meta */}
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider flex items-center gap-1.5 mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <User size={12} /> Author
                    </div>
                    <div className="text-xs text-[#f4f4f6]">{currentCommit.author}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider flex items-center gap-1.5 mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <Calendar size={12} /> Date
                    </div>
                    <div className="text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{currentCommit.date}</div>
                  </div>
                </div>

                <div className="h-[1px] w-full bg-[#222c37]"></div>

                {/* Change Indicators */}
                <div>
                  <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider flex items-center gap-1.5 mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    <Layers size={12} /> Architectural Changes
                  </div>
                  
                  {currentCommit.archChanges > 0 ? (
                    <div className="space-y-3">
                      <div className="bg-[#ffb03a]/10 border border-[#ffb03a]/20 p-3 text-[#ffb03a] text-xs font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span>Modules Extracted</span>
                          <span>{currentCommit.archChanges}</span>
                        </div>
                        <p className="text-[#ffb03a]/70 text-[10px] font-sans">Structural topology changed.</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#161d24] border border-[#222c37] p-3">
                          <div className="text-[10px] font-mono text-[#5f636b] mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies</div>
                          <div className="text-sm font-mono text-[#22c55e] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>+{currentCommit.depAdded}</div>
                        </div>
                        <div className="bg-[#161d24] border border-[#222c37] p-3">
                          <div className="text-[10px] font-mono text-[#5f636b] mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Removed</div>
                          <div className="text-sm font-mono text-[#ef4444] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>-{currentCommit.depRemoved}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-[#94a3b8] italic bg-[#161d24] p-3 border border-[#222c37]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      No major structural changes detected.
                    </div>
                  )}
                </div>

                <div className="h-[1px] w-full bg-[#222c37]"></div>

                {/* File metrics */}
                <div>
                  <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider flex items-center gap-1.5 mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    <FileText size={12} /> Files Changed
                  </div>
                  <div className="text-lg font-mono font-bold text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{currentCommit.files}</div>
                </div>

              </div>

              {/* Action Button */}
              <div className="p-5 border-t border-[#222c37] bg-[#080b0e]">
                <button className="w-full h-10 bg-[#ffb03a]/10 hover:bg-[#ffb03a]/20 border border-[#ffb03a]/50 text-[#ffb03a] font-bold text-xs transition-colors flex items-center justify-center gap-2">
                  <GitMerge size={16} />
                  VIEW EVIDENCE
                </button>
              </div>
            </div>

          </div>
          
        </div>
        
      </div>
    </DashboardLayout>
  );
};

export default ArchitectureHistory;
