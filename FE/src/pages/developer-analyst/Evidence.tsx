import React, { useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Search,
  ChevronDown,
  ArrowRight,
  Box,
  Layers,
  GitCommit,
  X,
  Link,
  Code2,
  FileCode,
  Network
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useComingSoon } from '@/hooks/useComingSoon';

// Mock Data
const evidenceData = [
  {
    id: 1,
    changeTitle: 'PaymentService extracted',
    type: 'MODULE EXTRACTION',
    repository: 'payment-service',
    commit: 'd82f91a',
    files: 12,
    date: '2h ago',
    summary: 'Payment processing responsibilities were moved from OrderService into PaymentService.',
    depsAdded: 8,
    depsRemoved: 3,
    sourceFiles: ['PaymentService.java', 'OrderService.java'],
    diffBefore: `public class OrderService {
    private final PaymentProcessor processor;
    
    public void createOrder(Order order) {
        // processing
        processor.charge(order.getAmount());
    }
}`,
    diffAfter: `public class OrderService {
    private final PaymentClient paymentClient;
    
    public void createOrder(Order order) {
        // processing
        paymentClient.requestCharge(order.getId());
    }
}`
  },
  {
    id: 2,
    changeTitle: 'Order dependency changed',
    type: 'DEPENDENCY CHANGE',
    repository: 'order-service',
    commit: '8af31c2',
    files: 6,
    date: 'Yesterday',
    summary: 'OrderService now communicates with PaymentService via asynchronous message queue instead of REST.',
    depsAdded: 2,
    depsRemoved: 1,
    sourceFiles: ['OrderService.java', 'pom.xml'],
    diffBefore: `import org.springframework.web.client.RestTemplate;`,
    diffAfter: `import org.springframework.kafka.core.KafkaTemplate;`
  },
  {
    id: 3,
    changeTitle: 'Settlement pipeline decoupled',
    type: 'MODULE SPLIT',
    repository: 'settlement-core',
    commit: 'c4199be',
    files: 18,
    date: '3 days ago',
    summary: 'Batch settlement jobs were decoupled from the core real-time processing engine.',
    depsAdded: 15,
    depsRemoved: 6,
    sourceFiles: ['SettlementJob.java', 'BatchConfig.java'],
    diffBefore: `@Scheduled(cron = "0 0 0 * * ?")
public void runSettlement() { ... }`,
    diffAfter: `// Moved to separate worker service`
  }
];

const Evidence: React.FC = () => {
  const [selectedChange, setSelectedChange] = useState<typeof evidenceData[0] | null>(null);
  const closeDrawer = useCallback(() => setSelectedChange(null), []);
  const drawerRef = useFocusTrap(selectedChange !== null, closeDrawer);
  const notifyComingSoon = useComingSoon();

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 flex flex-col h-[calc(100vh-140px)] relative">
        
        {/* HEADER */}
        <div className="shrink-0 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#222c37] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
                <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence Observatory</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Changes & Evidence</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Trace architectural changes back to commits, files and dependency evidence.
              </p>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="flex flex-wrap items-center gap-3 bg-[#11161b] p-3 border border-[#222c37]">
            <div className="flex-1 relative min-w-[200px]">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f636b]" />
               <input
                 type="text"
                 aria-label="Search changes"
                 placeholder="Search changes..."
                 className="w-full bg-[#080b0e] border border-[#222c37] h-9 pl-9 pr-4 text-sm text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
               />
            </div>
            
            <button
              onClick={() => notifyComingSoon("Project filter")}
              aria-haspopup="listbox"
              className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Project</span>
              <span className="text-xs font-bold text-[#f4f4f6]">All Projects</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>

            <button
              onClick={() => notifyComingSoon("Type filter")}
              aria-haspopup="listbox"
              className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Type</span>
              <span className="text-xs font-bold text-[#f4f4f6]">All Changes</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>

            <button
              onClick={() => notifyComingSoon("Date filter")}
              aria-haspopup="listbox"
              className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Date</span>
              <span className="text-xs font-bold text-[#f4f4f6]">All Time</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>

            <button
              onClick={() => notifyComingSoon("Repository filter")}
              aria-haspopup="listbox"
              className="h-9 px-4 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#5f636b] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository</span>
              <span className="text-xs font-bold text-[#f4f4f6]">All Repositories</span>
              <ChevronDown size={14} className="text-[#5f636b] group-hover:text-[#f4f4f6]" />
            </button>
          </div>
        </div>

        {/* CHANGE LIST TABLE */}
        <div className="flex-1 bg-[#11161b] border border-[#222c37] overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#222c37] bg-[#161d24]">
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Change</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Type</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Date</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-wider text-right"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222c37]">
                {evidenceData.map((item) => (
                  <tr 
                    key={item.id} 
                    className="group hover:bg-[#222c37]/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedChange(item)}
                  >
                    <td className="p-4 text-sm font-bold text-[#f4f4f6]">{item.changeTitle}</td>
                    <td className="p-4">
                       <span className="px-2 py-1 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest whitespace-nowrap"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                         {item.type}
                       </span>
                    </td>
                    <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{item.repository}</td>
                    <td className="p-4 text-xs font-mono text-[#38bdf8] font-bold flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <GitCommit size={14} /> {item.commit}
                    </td>
                    <td className="p-4 text-xs font-mono text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{item.files} files</td>
                    <td className="p-4 text-xs text-[#94a3b8]">{item.date}</td>
                    <td className="p-4 text-right">
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           setSelectedChange(item);
                         }}
                         aria-label={`View evidence for ${item.changeTitle}`}
                         className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#5f636b] group-hover:text-[#38bdf8] transition-colors uppercase focus:outline-none focus-visible:text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          View <ArrowRight size={14} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* EVIDENCE DETAIL DRAWER (SLIDE OVER) */}
        <AnimatePresence>
          {selectedChange && (
            <>
              {/* BACKDROP */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#080b0e]/50 backdrop-blur-sm z-40"
                onClick={closeDrawer}
              />

              {/* DRAWER PANEL */}
              <motion.div
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="evidence-detail-title"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 bottom-0 w-[800px] max-w-[90vw] bg-[#11161b] border-l border-[#222c37] shadow-2xl z-50 flex flex-col"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-[#222c37] bg-[#161d24] shrink-0">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="px-2 py-1 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest mb-3 inline-block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {selectedChange.type}
                      </span>
                      <h3 id="evidence-detail-title" className="text-2xl font-bold text-[#f4f4f6] uppercase tracking-wide">{selectedChange.changeTitle.toUpperCase()}</h3>
                    </div>
                    <button
                      onClick={closeDrawer}
                      aria-label="Close evidence detail"
                      className="w-8 h-8 bg-[#222c37] hover:bg-[#5f636b] text-[#f4f4f6] flex items-center justify-center transition-colors shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  
                  {/* AI Disclaimer */}
                  <div className="bg-[#38bdf8]/5 border border-[#38bdf8]/20 p-4 mt-4">
                     <p className="text-xs text-[#38bdf8] leading-relaxed">
                       <strong className="font-bold tracking-wide uppercase font-mono text-[10px]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence Suggests:</strong><br />
                       Based on repository evidence, {selectedChange.summary}
                     </p>
                  </div>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  
                  {/* TRACEABILITY CHAIN */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-widest flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <Link size={14} /> Traceability Chain
                    </h4>
                    
                    <div className="bg-[#080b0e] border border-[#222c37] p-6 flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                       <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                       
                       <div className="flex items-center justify-between w-full max-w-2xl relative z-10">
                          {/* Line connecting them */}
                          <div className="absolute top-1/2 left-0 right-0 h-px bg-[#222c37] -translate-y-1/2 z-0"></div>
                          
                          <div className="flex flex-col items-center gap-2 z-10 bg-[#080b0e] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#ffb03a]/20 border border-[#ffb03a]/50 flex items-center justify-center text-[#ffb03a]">
                               <Layers size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#94a3b8] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Arch Change</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#080b0e] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#222c37] border border-[#5f636b] flex items-center justify-center text-[#f4f4f6]">
                               <GitCommit size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#94a3b8] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#080b0e] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#222c37] border border-[#5f636b] flex items-center justify-center text-[#f4f4f6]">
                               <FileCode size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#94a3b8] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#080b0e] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#222c37] border border-[#5f636b] flex items-center justify-center text-[#f4f4f6]">
                               <Network size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#94a3b8] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>AST Deps</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#080b0e] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#38bdf8]/20 border border-[#38bdf8]/50 flex items-center justify-center text-[#38bdf8]">
                               <Box size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#38bdf8] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Snapshot</span>
                          </div>
                       </div>
                    </div>
                  </div>

                  {/* EVIDENCE GRID */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-[#161d24] border border-[#222c37] p-4">
                        <div className="text-[10px] font-mono text-[#5f636b] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit</div>
                        <div className="text-sm font-mono font-bold text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{selectedChange.commit}</div>
                     </div>
                     <div className="bg-[#161d24] border border-[#222c37] p-4">
                        <div className="text-[10px] font-mono text-[#5f636b] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</div>
                        <div className="text-sm font-bold text-[#f4f4f6]">{selectedChange.files} modified</div>
                     </div>
                     <div className="bg-[#161d24] border border-[#222c37] p-4">
                        <div className="text-[10px] font-mono text-[#5f636b] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies</div>
                        <div className="text-sm font-bold font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                           <span className="text-[#22c55e]">+{selectedChange.depsAdded}</span> / <span className="text-[#ef4444]">-{selectedChange.depsRemoved}</span>
                        </div>
                     </div>
                     <div className="bg-[#161d24] border border-[#222c37] p-4">
                        <div className="text-[10px] font-mono text-[#5f636b] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Source</div>
                        <div className="text-[10px] font-mono text-[#f4f4f6] truncate"
            style={{ fontFamily: '"JetBrains Mono", monospace' }} title={selectedChange.sourceFiles.join(', ')}>
                           {selectedChange.sourceFiles[0]}...
                        </div>
                     </div>
                  </div>

                  {/* SOURCE DIFF */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-widest flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <Code2 size={14} /> Source Diff
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-px bg-[#222c37] border border-[#222c37] overflow-hidden">
                       
                       {/* LEFT - BEFORE */}
                       <div className="bg-[#11161b]">
                         <div className="p-2 border-b border-[#222c37] bg-[#161d24] flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-[#ef4444] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Before</span>
                         </div>
                         <pre className="p-4 text-xs font-mono text-[#94a3b8] overflow-x-auto"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                            <code>{selectedChange.diffBefore}</code>
                         </pre>
                       </div>

                       {/* RIGHT - AFTER */}
                       <div className="bg-[#11161b]">
                         <div className="p-2 border-b border-[#222c37] bg-[#161d24] flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-[#22c55e] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>After</span>
                         </div>
                         <pre className="p-4 text-xs font-mono text-[#f4f4f6] overflow-x-auto"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                            <code>{selectedChange.diffAfter}</code>
                         </pre>
                       </div>

                    </div>
                  </div>

                  {/* ARCHITECTURE SUMMARY */}
                  <div className="space-y-3 pb-8">
                     <h4 className="text-[10px] font-mono font-bold text-[#5f636b] uppercase tracking-widest flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <Box size={14} /> Architecture Interpretation
                     </h4>
                     <div className="bg-[#161d24] border border-[#222c37] p-6 text-center">
                        <div className="inline-flex items-center justify-center gap-4 text-sm font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                           <span className="px-3 py-1 bg-[#222c37] border border-[#5f636b]">Monolithic Node</span>
                           <ArrowRight size={16} className="text-[#5f636b]" />
                           <span className="px-3 py-1 bg-[#ffb03a]/20 text-[#ffb03a] border border-[#ffb03a]/50 font-bold">Decoupled Services</span>
                        </div>
                        <p className="text-[10px] text-[#5f636b] mt-4 uppercase tracking-widest">
                           Detected structural change based on AST dependency drift
                        </p>
                     </div>
                  </div>

                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        
      </div>
    </DashboardLayout>
  );
};

export default Evidence;
