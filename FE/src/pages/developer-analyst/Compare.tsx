import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  GitCommit,
  ArrowRight,
  Database,
  Cpu,
  Box,
  FileText,
  User,
  Calendar,
  Layers,
  GitMerge,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  SplitSquareHorizontal,
  FileDiff,
  Download
} from 'lucide-react';
import { motion } from 'motion/react';

const Compare: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 flex flex-col min-h-0">
        
        {/* HEADER */}
        <div className="shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#222c37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
            <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture Diff</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Compare Architecture</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Compare two repository revisions and identify structural changes.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* REVISION SELECTORS */}
        <div className="flex flex-col md:flex-row items-stretch gap-4 shrink-0">
          
          {/* BASE REVISION */}
          <div className="flex-1 bg-[#11161b] border border-[#222c37] p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[#5f636b]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Base Revision</h3>
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-[#f4f4f6] mb-1 flex items-center gap-2">
                  v1.5
                  <ChevronDown size={16} className="text-[#5f636b]" />
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  <span className="flex items-center gap-1 text-[#94a3b8]"><GitCommit size={12} /> 8af31c2</span>
                  <span>•</span>
                  <span>Sep 12, 2026</span>
                </div>
              </div>
            </div>
          </div>

          {/* ARROW & COMPARE BUTTON */}
          <div className="flex flex-col justify-center items-center px-4 gap-2">
            <div className="w-10 h-10 rounded-full bg-[#161d24] border border-[#222c37] flex items-center justify-center text-[#5f636b]">
              <ArrowRightLeft size={18} />
            </div>
            <button className="px-4 py-1.5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-[10px] tracking-wider transition-colors shadow-[0_0_10px_rgba(56,189,248,0.15)] uppercase">
              Compare
            </button>
          </div>

          {/* TARGET REVISION */}
          <div className="flex-1 bg-[#11161b] border border-[#222c37] p-5 relative overflow-hidden group border-r-2 border-r-[#38bdf8]/50">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[#38bdf8]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[#38bdf8] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Target Revision</h3>
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-[#f4f4f6] mb-1 flex items-center gap-2">
                  v2.0
                  <ChevronDown size={16} className="text-[#5f636b]" />
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  <span className="flex items-center gap-1 text-[#f4f4f6]"><GitCommit size={12} className="text-[#38bdf8]" /> d82f91a</span>
                  <span>•</span>
                  <span className="text-[#94a3b8]">Sep 18, 2026</span>
                </div>
              </div>
            </div>
          </div>
          
        </div>

        {/* SUMMARY METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
          <div className="bg-[#161d24] border border-[#222c37] p-4 flex flex-col justify-between">
            <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Modules</h4>
            <div className="text-xl font-bold font-mono text-[#22c55e] flex items-center gap-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              +2
            </div>
          </div>
          
          <div className="bg-[#161d24] border border-[#222c37] p-4 flex flex-col justify-between">
            <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies</h4>
            <div className="flex items-center gap-3 text-xl font-bold font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              <span className="text-[#22c55e]">+8</span>
              <span className="text-[#5f636b]">/</span>
              <span className="text-[#ef4444]">-3</span>
            </div>
          </div>

          <div className="bg-[#161d24] border border-[#222c37] p-4 flex flex-col justify-between">
            <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</h4>
            <div className="text-xl font-bold text-[#f4f4f6] flex items-center gap-2">
              12 <span className="text-xs font-sans text-[#94a3b8] font-normal">changed</span>
            </div>
          </div>

          <div className="bg-[#161d24] border border-[#ffb03a]/30 p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 bg-[#ffb03a]/5 pointer-events-none"></div>
            <h4 className="text-[10px] font-mono font-semibold text-[#ffb03a] tracking-widest uppercase mb-2 z-10"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Arch Changes</h4>
            <div className="text-xl font-bold font-mono text-[#ffb03a] flex items-center gap-1 z-10"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              3
            </div>
          </div>
        </div>

        {/* SIDE-BY-SIDE GRAPH CONTAINER */}
        <div className="flex flex-col lg:flex-row gap-6 shrink-0 h-[450px]">
          
          {/* LEFT: BEFORE GRAPH */}
          <div className="flex-1 flex flex-col bg-[#080b0e] border border-[#222c37] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[#222c37] bg-[#080b0e] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#5f636b]"></div>
                <span className="text-xs font-bold text-[#f4f4f6] tracking-wide uppercase">Before</span>
              </div>
              <div className="text-[10px] font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture at 8af31c2</div>
            </div>
            
            <div className="flex-1 relative w-full h-full">
               <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
               
               <svg viewBox="0 0 500 400" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
                  {/* LINES */}
                  <g fill="none" strokeWidth="2" opacity="0.6">
                     {/* Order -> Legacy Mono */}
                     <path d="M 250 150 L 250 250" stroke="#38bdf8" />
                     <path d="M 250 150 C 150 150, 150 200, 150 250" stroke="#38bdf8" />
                  </g>

                  {/* NODES */}
                  <g>
                    {/* ORDER MODULE */}
                    <g transform="translate(170, 110)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">ORDER_SERVICE</text>
                    </g>

                    {/* USER MODULE */}
                    <g transform="translate(70, 250)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">USER_SERVICE</text>
                    </g>

                    {/* LEGACY MONO (Order + Payment) */}
                    <g transform="translate(270, 250)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#ef4444" strokeOpacity="0.5" strokeDasharray="4 4" />
                      <circle cx="20" cy="20" r="4" fill="#ef4444" />
                      <text x="35" y="24" fill="#94a3b8" fontSize="13" fontFamily="monospace" fontWeight="bold">LEGACY_MONO</text>
                    </g>
                  </g>
               </svg>
            </div>
          </div>

          {/* RIGHT: AFTER GRAPH */}
          <div className="flex-1 flex flex-col bg-[#080b0e] border border-[#222c37] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[#222c37] bg-[#080b0e] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse motion-reduce:animate-none shadow-[0_0_8px_#38bdf8]"></div>
                <span className="text-xs font-bold text-[#f4f4f6] tracking-wide uppercase">After</span>
              </div>
              <div className="text-[10px] font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture at d82f91a</div>
            </div>
            
            <div className="flex-1 relative w-full h-full">
               <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
               
               <svg viewBox="0 0 500 440" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <filter id="glow-amber-compare" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glow-cyan-compare" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Entire graph shifted down so the "+ EXTRACTED" badge above PAYMENT_SERVICE never clips the top edge */}
                  <g transform="translate(0, 25)">

                  {/* LINES */}
                  <g fill="none" strokeWidth="2" opacity="0.6">
                     {/* Order -> User */}
                     <path d="M 250 150 C 150 150, 150 200, 150 250" stroke="#38bdf8" />

                     {/* Order -> Payment (New dep) */}
                     <motion.path
                       initial={{ opacity: 0 }} animate={{ opacity: 0.8 }}
                       d="M 250 150 C 350 150, 350 200, 350 250"
                       stroke="#38bdf8" filter="url(#glow-cyan-compare)" strokeWidth="2.5"
                     />
                  </g>

                  {/* NODES */}
                  <g>
                    {/* ORDER MODULE */}
                    <g transform="translate(170, 110)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">ORDER_SERVICE</text>
                    </g>

                    {/* USER MODULE */}
                    <g transform="translate(70, 250)">
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#38bdf8" strokeOpacity="0.5" />
                      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
                      <text x="35" y="24" fill="#f4f4f6" fontSize="13" fontFamily="monospace" fontWeight="bold">USER_SERVICE</text>
                    </g>

                    {/* NEW PAYMENT MODULE */}
                    <motion.g
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      transform="translate(270, 250)"
                    >
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#ffb03a" strokeWidth="2" filter="url(#glow-amber-compare)" opacity="0.5" />
                      <rect width="160" height="40" rx="4" fill="#161d24" stroke="#ffb03a" strokeWidth="2" />
                      <circle cx="20" cy="20" r="4" fill="#ffb03a" />
                      <text x="35" y="24" fill="#ffb03a" fontSize="13" fontFamily="monospace" fontWeight="bold">PAYMENT_SERVICE</text>

                      {/* Highlight Badge */}
                      <g transform="translate(120, -15)">
                        <rect width="80" height="18" rx="2" fill="#ffb03a" fillOpacity="0.1" stroke="#ffb03a" />
                        <text x="40" y="12" fill="#ffb03a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">+ EXTRACTED</text>
                      </g>
                    </motion.g>
                  </g>
                  </g>
               </svg>
            </div>
          </div>
          
        </div>

        {/* CHANGE LEGEND */}
        <div className="flex items-center justify-center gap-6 py-2">
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Added</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#ef4444] shadow-[0_0_5px_#ef4444]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Removed</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#ffb03a] shadow-[0_0_5px_#ffb03a]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Changed</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#5f636b]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Unchanged</span>
          </div>
        </div>

        {/* CHANGE LIST */}
        <div className="shrink-0 space-y-4">
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase mb-4 flex items-center gap-2">
            <FileDiff size={16} className="text-[#38bdf8]" />
            Detailed Change Log
          </h3>

          <div className="bg-[#11161b] border border-[#222c37] overflow-hidden divide-y divide-[#222c37]">
            
            {/* Event 1 */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
               <div>
                 <div className="flex items-center gap-2 mb-2">
                   <span className="px-2 py-0.5 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Extraction</span>
                   <span className="text-[10px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>d82f91a</span>
                 </div>
                 <div className="text-sm font-bold text-[#f4f4f6] mb-1">PaymentService extracted from LegacyMono</div>
                 <div className="text-xs text-[#94a3b8] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>12 files affected</div>
               </div>
               <button className="shrink-0 h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-mono font-bold text-[10px] transition-colors flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                 VIEW EVIDENCE <ArrowRight size={14} />
               </button>
            </div>

            {/* Event 2 */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
               <div>
                 <div className="flex items-center gap-2 mb-2">
                   <span className="px-2 py-0.5 bg-[#38bdf8]/10 border border-[#38bdf8]/20 text-[#38bdf8] text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependency Change</span>
                   <span className="text-[10px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>d82f91a</span>
                 </div>
                 <div className="text-sm font-bold text-[#f4f4f6] mb-1">OrderService <ArrowRight size={12} className="inline text-[#5f636b]" /> PaymentService</div>
                 <div className="text-xs text-[#94a3b8] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>8 dependencies added, 3 removed</div>
               </div>
               <button className="shrink-0 h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-mono font-bold text-[10px] transition-colors flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                 VIEW EVIDENCE <ArrowRight size={14} />
               </button>
            </div>

            {/* Event 3 */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
               <div>
                 <div className="flex items-center gap-2 mb-2">
                   <span className="px-2 py-0.5 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Split</span>
                   <span className="text-[10px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>c4199be</span>
                 </div>
                 <div className="text-sm font-bold text-[#f4f4f6] mb-1">SettlementCore decoupled</div>
                 <div className="text-xs text-[#94a3b8] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>5 files affected</div>
               </div>
               <button className="shrink-0 h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-mono font-bold text-[10px] transition-colors flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                 VIEW EVIDENCE <ArrowRight size={14} />
               </button>
            </div>

          </div>
        </div>

        {/* BOTTOM CTA */}
        <div className="shrink-0 flex items-center justify-end gap-4 py-8">
           <button className="h-10 px-5 bg-transparent border border-[#222c37] hover:border-[#94a3b8] text-[#f4f4f6] font-bold text-xs transition-colors flex items-center gap-2">
              VIEW FULL HISTORY
           </button>
           <button className="h-10 px-5 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.05)]">
              <Download size={16} />
              GENERATE REPORT
           </button>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Compare;
