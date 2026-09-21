import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Search,
  ChevronDown,
  ArrowRight,
  Database,
  Box,
  FileText,
  User,
  Calendar,
  Layers,
  GitMerge,
  GitCommit,
  X,
  Link,
  Code2,
  FileCode,
  Network
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 flex flex-col h-[calc(100vh-140px)] relative">
        
        {/* HEADER */}
        <div className="shrink-0 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E151D] border border-[#1A2A37] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
                <span className="text-[10px] font-mono text-[#19C8F3] tracking-wider font-semibold uppercase">Evidence Observatory</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#F4F7FA] mb-2">Changes & Evidence</h2>
              <p className="text-[#8A98A8] text-sm max-w-xl leading-relaxed">
                Trace architectural changes back to commits, files and dependency evidence.
              </p>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="flex flex-wrap items-center gap-3 bg-[#0B1017] p-3 rounded-xl border border-[#1A2A37]">
            <div className="flex-1 relative min-w-[200px]">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#566575]" />
               <input 
                 type="text" 
                 placeholder="Search changes..." 
                 className="w-full bg-[#070A0F] border border-[#1A2A37] rounded-lg h-9 pl-9 pr-4 text-sm text-[#F4F7FA] placeholder-[#566575] focus:outline-none focus:border-[#19C8F3]/50 transition-colors"
               />
            </div>
            
            <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#566575] uppercase">Project</span>
              <span className="text-xs font-bold text-[#F4F7FA]">All Projects</span>
              <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
            </button>
            
            <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#566575] uppercase">Type</span>
              <span className="text-xs font-bold text-[#F4F7FA]">All Changes</span>
              <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
            </button>

            <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#566575] uppercase">Date</span>
              <span className="text-xs font-bold text-[#F4F7FA]">All Time</span>
              <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
            </button>

            <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
              <span className="text-[10px] font-mono text-[#566575] uppercase">Repository</span>
              <span className="text-xs font-bold text-[#F4F7FA]">All Repositories</span>
              <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
            </button>
          </div>
        </div>

        {/* CHANGE LIST TABLE */}
        <div className="flex-1 bg-[#0B1017] border border-[#1A2A37] rounded-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#1A2A37] bg-[#0E151D]">
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Change</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Type</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Repository</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Commit</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Files</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Date</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A2A37]">
                {evidenceData.map((item) => (
                  <tr 
                    key={item.id} 
                    className="group hover:bg-[#1A2A37]/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedChange(item)}
                  >
                    <td className="p-4 text-sm font-bold text-[#F4F7FA]">{item.changeTitle}</td>
                    <td className="p-4">
                       <span className="px-2 py-1 bg-[#FFB020]/10 border border-[#FFB020]/20 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest rounded whitespace-nowrap">
                         {item.type}
                       </span>
                    </td>
                    <td className="p-4 text-xs font-mono text-[#8A98A8]">{item.repository}</td>
                    <td className="p-4 text-xs font-mono text-[#19C8F3] font-bold flex items-center gap-1.5">
                       <GitCommit size={14} /> {item.commit}
                    </td>
                    <td className="p-4 text-xs font-mono text-[#F4F7FA]">{item.files} files</td>
                    <td className="p-4 text-xs text-[#8A98A8]">{item.date}</td>
                    <td className="p-4 text-right">
                       <button className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#566575] group-hover:text-[#19C8F3] transition-colors uppercase">
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
                className="absolute inset-0 bg-[#070A0F]/50 backdrop-blur-sm z-40"
                onClick={() => setSelectedChange(null)}
              />

              {/* DRAWER PANEL */}
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 bottom-0 w-[800px] max-w-[90vw] bg-[#0B1017] border-l border-[#1A2A37] shadow-2xl z-50 flex flex-col"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-[#1A2A37] bg-[#0E151D] shrink-0">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="px-2 py-1 bg-[#FFB020]/10 border border-[#FFB020]/20 text-[#FFB020] text-[9px] font-mono font-bold uppercase tracking-widest rounded mb-3 inline-block">
                        {selectedChange.type}
                      </span>
                      <h3 className="text-2xl font-bold text-[#F4F7FA] uppercase tracking-wide">{selectedChange.changeTitle.toUpperCase()}</h3>
                    </div>
                    <button 
                      onClick={() => setSelectedChange(null)}
                      className="w-8 h-8 rounded bg-[#1A2A37] hover:bg-[#566575] text-[#F4F7FA] flex items-center justify-center transition-colors shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  
                  {/* AI Disclaimer */}
                  <div className="bg-[#19C8F3]/5 border border-[#19C8F3]/20 rounded-lg p-4 mt-4">
                     <p className="text-xs text-[#19C8F3] leading-relaxed">
                       <strong className="font-bold tracking-wide uppercase font-mono text-[10px]">Evidence Suggests:</strong><br />
                       Based on repository evidence, {selectedChange.summary}
                     </p>
                  </div>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  
                  {/* TRACEABILITY CHAIN */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-[#566575] uppercase tracking-widest flex items-center gap-2">
                       <Link size={14} /> Traceability Chain
                    </h4>
                    
                    <div className="bg-[#090E14] border border-[#1A2A37] rounded-xl p-6 flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                       <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#19C8F3 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                       
                       <div className="flex items-center justify-between w-full max-w-2xl relative z-10">
                          {/* Line connecting them */}
                          <div className="absolute top-1/2 left-0 right-0 h-px bg-[#1A2A37] -translate-y-1/2 z-0"></div>
                          
                          <div className="flex flex-col items-center gap-2 z-10 bg-[#090E14] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#FFB020]/20 border border-[#FFB020]/50 flex items-center justify-center text-[#FFB020]">
                               <Layers size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#8A98A8] font-bold">Arch Change</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#090E14] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#1A2A37] border border-[#566575] flex items-center justify-center text-[#F4F7FA]">
                               <GitCommit size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#8A98A8] font-bold">Commit</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#090E14] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#1A2A37] border border-[#566575] flex items-center justify-center text-[#F4F7FA]">
                               <FileCode size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#8A98A8] font-bold">Files</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#090E14] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#1A2A37] border border-[#566575] flex items-center justify-center text-[#F4F7FA]">
                               <Network size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#8A98A8] font-bold">AST Deps</span>
                          </div>

                          <div className="flex flex-col items-center gap-2 z-10 bg-[#090E14] px-2">
                            <div className="w-8 h-8 rounded-full bg-[#19C8F3]/20 border border-[#19C8F3]/50 flex items-center justify-center text-[#19C8F3]">
                               <Box size={14} />
                            </div>
                            <span className="text-[9px] font-mono text-[#19C8F3] font-bold">Snapshot</span>
                          </div>
                       </div>
                    </div>
                  </div>

                  {/* EVIDENCE GRID */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-[#0E151D] border border-[#1A2A37] p-4 rounded-xl">
                        <div className="text-[10px] font-mono text-[#566575] mb-2 uppercase">Commit</div>
                        <div className="text-sm font-mono font-bold text-[#19C8F3]">{selectedChange.commit}</div>
                     </div>
                     <div className="bg-[#0E151D] border border-[#1A2A37] p-4 rounded-xl">
                        <div className="text-[10px] font-mono text-[#566575] mb-2 uppercase">Files</div>
                        <div className="text-sm font-bold text-[#F4F7FA]">{selectedChange.files} modified</div>
                     </div>
                     <div className="bg-[#0E151D] border border-[#1A2A37] p-4 rounded-xl">
                        <div className="text-[10px] font-mono text-[#566575] mb-2 uppercase">Dependencies</div>
                        <div className="text-sm font-bold font-mono">
                           <span className="text-[#20C997]">+{selectedChange.depsAdded}</span> / <span className="text-[#FF4D4F]">-{selectedChange.depsRemoved}</span>
                        </div>
                     </div>
                     <div className="bg-[#0E151D] border border-[#1A2A37] p-4 rounded-xl">
                        <div className="text-[10px] font-mono text-[#566575] mb-2 uppercase">Source</div>
                        <div className="text-[10px] font-mono text-[#F4F7FA] truncate" title={selectedChange.sourceFiles.join(', ')}>
                           {selectedChange.sourceFiles[0]}...
                        </div>
                     </div>
                  </div>

                  {/* SOURCE DIFF */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-[#566575] uppercase tracking-widest flex items-center gap-2">
                       <Code2 size={14} /> Source Diff
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-px bg-[#1A2A37] border border-[#1A2A37] rounded-xl overflow-hidden">
                       
                       {/* LEFT - BEFORE */}
                       <div className="bg-[#0B1017]">
                         <div className="p-2 border-b border-[#1A2A37] bg-[#0E151D] flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-[#FF4D4F] uppercase">Before</span>
                         </div>
                         <pre className="p-4 text-xs font-mono text-[#8A98A8] overflow-x-auto">
                            <code>{selectedChange.diffBefore}</code>
                         </pre>
                       </div>

                       {/* RIGHT - AFTER */}
                       <div className="bg-[#0B1017]">
                         <div className="p-2 border-b border-[#1A2A37] bg-[#0E151D] flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-[#20C997] uppercase">After</span>
                         </div>
                         <pre className="p-4 text-xs font-mono text-[#F4F7FA] overflow-x-auto">
                            <code>{selectedChange.diffAfter}</code>
                         </pre>
                       </div>

                    </div>
                  </div>

                  {/* ARCHITECTURE SUMMARY */}
                  <div className="space-y-3 pb-8">
                     <h4 className="text-[10px] font-mono font-bold text-[#566575] uppercase tracking-widest flex items-center gap-2">
                       <Box size={14} /> Architecture Interpretation
                     </h4>
                     <div className="bg-[#0E151D] border border-[#1A2A37] rounded-xl p-6 text-center">
                        <div className="inline-flex items-center justify-center gap-4 text-sm font-mono text-[#8A98A8]">
                           <span className="px-3 py-1 bg-[#1A2A37] rounded border border-[#566575]">Monolithic Node</span>
                           <ArrowRight size={16} className="text-[#566575]" />
                           <span className="px-3 py-1 bg-[#FFB020]/20 text-[#FFB020] rounded border border-[#FFB020]/50 font-bold">Decoupled Services</span>
                        </div>
                        <p className="text-[10px] text-[#566575] mt-4 uppercase tracking-widest">
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
