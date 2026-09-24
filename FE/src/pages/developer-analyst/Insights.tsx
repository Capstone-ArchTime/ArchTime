import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Sparkles,
  GitCommit,
  CheckCircle2,
  FileCode,
  Network,
  TerminalSquare,
  ArrowRight,
  Bot,
  SearchCode,
  LineChart,
  Loader2,
  Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { useComingSoon } from '@/hooks/useComingSoon';

const Insights: React.FC = () => {
  const [askInput, setAskInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mockAnswer, setMockAnswer] = useState<string | null>(null);
  const notifyComingSoon = useComingSoon();

  const handleAsk = (query: string) => {
    if (!query.trim()) return;
    setAskInput(query);
    setMockAnswer(null);
    setIsAnalyzing(true);

    // Simulate backend analysis of evidence
    setTimeout(() => {
      setIsAnalyzing(false);
      setMockAnswer("Based on repository evidence from the last 30 days, we have insufficient evidence to confirm developer intent. However, structural AST changes indicate that the data access layer was increasingly coupled with the presentation layer before commit c4199be.");
    }, 2500);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 flex flex-col min-h-0 pb-12">
        
        {/* HEADER */}
        <div className="shrink-0 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#38bdf8]/10 border border-[#38bdf8]/30 mb-4">
              <Sparkles size={12} className="text-[#38bdf8]" />
              <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence-Grounded AI</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">AI Architectural Insights</h2>
            <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
              Understand architectural changes through evidence-grounded explanations.
            </p>
          </div>
        </div>

        {/* SUMMARY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
          <div className="bg-[#11161b] border border-[#222c37] p-5 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
               <Bot size={14} className="text-[#38bdf8]" />
               <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Insights Generated</h4>
            </div>
            <div className="text-3xl font-bold font-mono text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>24</div>
          </div>
          
          <div className="bg-[#11161b] border border-[#222c37] p-5 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
               <SearchCode size={14} className="text-[#ffb03a]" />
               <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Changes Analyzed</h4>
            </div>
            <div className="text-3xl font-bold font-mono text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>38</div>
          </div>

          <div className="bg-[#11161b] border border-[#222c37] p-5 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
               <LineChart size={14} className="text-[#22c55e]" />
               <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence Links</h4>
            </div>
            <div className="text-3xl font-bold font-mono text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>126</div>
          </div>
        </div>

        {/* MAIN INSIGHT SPLIT PANEL */}
        <div className="bg-[#11161b] border border-[#38bdf8]/30 overflow-hidden shadow-[0_0_30px_rgba(56,189,248,0.05)]">
          <div className="p-4 border-b border-[#222c37] bg-[#161d24] flex items-center gap-3">
             <div className="w-6 h-6 bg-[#38bdf8]/20 flex items-center justify-center">
                <Sparkles size={12} className="text-[#38bdf8]" />
             </div>
             <span className="text-xs font-bold text-[#f4f4f6] tracking-wide uppercase">ArchTime AI</span>
             <span className="text-xs font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>|</span>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Latest Architectural Insight</span>
          </div>

          <div className="flex flex-col lg:flex-row">
            
            {/* LEFT: EXPLANATION (70%) */}
            <div className="flex-[2] p-8 lg:border-r border-[#222c37] bg-[#080b0e] relative overflow-hidden">
               {/* Background tech grid */}
               <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
               
               <div className="relative z-10">
                 <h3 className="text-xl font-bold text-[#f4f4f6] mb-6">
                   Why was PaymentService extracted from OrderService?
                 </h3>
                 
                 <div className="prose prose-invert max-w-none">
                   <p className="text-[#94a3b8] leading-loose text-[15px]">
                     Based on repository evidence, payment processing responsibilities were separated from <code className="text-[#ffb03a] bg-[#ffb03a]/10 px-1.5 py-0.5 text-xs border border-[#ffb03a]/20">OrderService</code> between commits <code className="text-[#38bdf8] bg-[#38bdf8]/10 px-1.5 py-0.5 text-xs font-mono border border-[#38bdf8]/20"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>3e4877f</code> and <code className="text-[#38bdf8] bg-[#38bdf8]/10 px-1.5 py-0.5 text-xs font-mono border border-[#38bdf8]/20"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>d82f91a</code>. 
                   </p>
                   <p className="text-[#94a3b8] leading-loose text-[15px] mt-4">
                     Evidence suggests this was driven by a need to decouple dependencies, as exactly 8 new external dependencies (including payment gateway SDKs) were introduced exclusively within the new <code className="text-[#ffb03a] bg-[#ffb03a]/10 px-1.5 py-0.5 text-xs border border-[#ffb03a]/20">PaymentService.java</code> file, effectively removing them from the core Order processing path.
                   </p>
                 </div>
               </div>
            </div>

            {/* RIGHT: EVIDENCE & BASIS (30%) */}
            <div className="flex-1 bg-[#11161b] flex flex-col">
              
              {/* Evidence Support */}
              <div className="p-6 border-b border-[#222c37]">
                <h4 className="text-[10px] font-mono font-semibold text-[#ffb03a] tracking-widest uppercase mb-4 flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  <CheckCircle2 size={12} /> Evidence Supporting This Insight
                </h4>
                <ul className="space-y-3">
                   <li className="flex items-start gap-2 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <span className="text-[#22c55e] mt-0.5">✓</span> Commit d82f91a
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <span className="text-[#22c55e] mt-0.5">✓</span> 12 modified files
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <span className="text-[#22c55e] mt-0.5">✓</span> 8 dependencies added
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <span className="text-[#22c55e] mt-0.5">✓</span> 3 dependencies removed
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <span className="text-[#22c55e] mt-0.5">✓</span> PaymentService.java introduced
                   </li>
                </ul>
                <Link
                  to="/evidence"
                  className="mt-5 flex items-center justify-center w-full h-8 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-bold text-[10px] transition-colors uppercase tracking-wider">
                  View Evidence
                </Link>
              </div>

              {/* Analysis Basis */}
              <div className="p-6">
                <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  Analysis Basis
                </h4>
                <div className="flex flex-wrap gap-2">
                   <span className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <GitCommit size={10} /> Commit metadata
                   </span>
                   <span className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <FileCode size={10} /> Source changes
                   </span>
                   <span className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <Network size={10} /> Dependency graph
                   </span>
                   <span className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                     <Box size={10} /> Architecture snapshots
                   </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* PREVIOUS INSIGHTS */}
        <div>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase mb-4 mt-4">Previous Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             
             {/* Card 1 */}
             <div className="bg-[#11161b] border border-[#222c37] p-5 hover:border-[#38bdf8]/30 transition-colors group">
               <h4 className="text-sm font-bold text-[#f4f4f6] mb-2">Payment service extraction</h4>
               <p className="text-xs text-[#94a3b8] mb-4 line-clamp-2">Based on AST evidence, payment responsibilities were extracted from the monolith.</p>
               <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#222c37]">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-mono text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}><GitCommit size={10} className="inline mr-1" />d82f91a</span>
                   <span className="text-[9px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Sep 18, 2026</span>
                 </div>
                 <button
                   onClick={() => notifyComingSoon("Insight detail view")}
                   className="text-[10px] font-bold font-mono text-[#5f636b] group-hover:text-[#38bdf8] uppercase tracking-wider transition-colors flex items-center gap-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                   View Insight <ArrowRight size={12} />
                 </button>
               </div>
             </div>

             {/* Card 2 */}
             <div className="bg-[#11161b] border border-[#222c37] p-5 hover:border-[#38bdf8]/30 transition-colors group">
               <h4 className="text-sm font-bold text-[#f4f4f6] mb-2">Order dependency restructuring</h4>
               <p className="text-xs text-[#94a3b8] mb-4 line-clamp-2">Evidence shows messaging queues replaced REST endpoints for inter-service communication.</p>
               <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#222c37]">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-mono text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}><GitCommit size={10} className="inline mr-1" />8af31c2</span>
                   <span className="text-[9px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Sep 12, 2026</span>
                 </div>
                 <button
                   onClick={() => notifyComingSoon("Insight detail view")}
                   className="text-[10px] font-bold font-mono text-[#5f636b] group-hover:text-[#38bdf8] uppercase tracking-wider transition-colors flex items-center gap-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                   View Insight <ArrowRight size={12} />
                 </button>
               </div>
             </div>

             {/* Card 3 */}
             <div className="bg-[#11161b] border border-[#222c37] p-5 hover:border-[#38bdf8]/30 transition-colors group">
               <h4 className="text-sm font-bold text-[#f4f4f6] mb-2">Settlement pipeline decoupling</h4>
               <p className="text-xs text-[#94a3b8] mb-4 line-clamp-2">Source code diffs confirm batch jobs were moved to a separate scheduled worker.</p>
               <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#222c37]">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-mono text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}><GitCommit size={10} className="inline mr-1" />c4199be</span>
                   <span className="text-[9px] font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Sep 05, 2026</span>
                 </div>
                 <button
                   onClick={() => notifyComingSoon("Insight detail view")}
                   className="text-[10px] font-bold font-mono text-[#5f636b] group-hover:text-[#38bdf8] uppercase tracking-wider transition-colors flex items-center gap-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                   View Insight <ArrowRight size={12} />
                 </button>
               </div>
             </div>

          </div>
        </div>

        {/* ASK ARCHTIME */}
        <div className="bg-[#080b0e] border border-[#222c37] p-6 md:p-8 mt-8">
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase mb-6 flex items-center gap-2">
            <TerminalSquare size={16} className="text-[#38bdf8]" /> Ask About Your Architecture
          </h3>

          <div className="space-y-4 max-w-3xl">
             <div className="relative flex items-center">
                <div className="absolute left-4 text-[#38bdf8] font-mono font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'>'}</div>
                <input
                   type="text"
                   value={askInput}
                   onChange={(e) => setAskInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleAsk(askInput)}
                   aria-label="Ask about your architecture"
                   placeholder="Why did the architecture change here?"
                   className="w-full h-12 bg-[#080b0e] border border-[#222c37] pl-10 pr-32 text-sm font-mono text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                />
                <button 
                  onClick={() => handleAsk(askInput)}
                  className="absolute right-2 top-1.5 bottom-1.5 px-4 bg-[#222c37] hover:bg-[#5f636b] text-[#f4f4f6] font-bold text-[10px] tracking-wider transition-colors uppercase disabled:opacity-50"
                  disabled={!askInput.trim() || isAnalyzing}
                >
                  Ask ArchTime
                </button>
             </div>

             {/* Suggested Chips */}
             <div className="flex flex-wrap gap-2">
                <button onClick={() => handleAsk("Why was this module extracted?")} className="px-3 py-1.5 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/30 text-[10px] font-mono text-[#94a3b8] hover:text-[#38bdf8] rounded-full transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  Why was this module extracted?
                </button>
                <button onClick={() => handleAsk("What changed between these revisions?")} className="px-3 py-1.5 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/30 text-[10px] font-mono text-[#94a3b8] hover:text-[#38bdf8] rounded-full transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  What changed between these revisions?
                </button>
                <button onClick={() => handleAsk("Which services became more coupled?")} className="px-3 py-1.5 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/30 text-[10px] font-mono text-[#94a3b8] hover:text-[#38bdf8] rounded-full transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  Which services became more coupled?
                </button>
                <button onClick={() => handleAsk("Which architectural changes affected the most files?")} className="px-3 py-1.5 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/30 text-[10px] font-mono text-[#94a3b8] hover:text-[#38bdf8] rounded-full transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  Which architectural changes affected the most files?
                </button>
             </div>

             {/* Output Area */}
             <div role="status" aria-live="polite">
               <AnimatePresence mode="wait">
                 {isAnalyzing && (
                   <motion.div
                     key="loading"
                     initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                     className="mt-6 p-4 bg-[#080b0e] border border-[#222c37] flex items-center gap-3"
                   >
                     <Loader2 size={16} className="text-[#38bdf8] animate-spin motion-reduce:animate-none" />
                     <span className="text-xs font-mono text-[#5f636b] animate-pulse motion-reduce:animate-none"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Analyzing repository evidence and structural topologies...</span>
                   </motion.div>
                 )}

                 {mockAnswer && !isAnalyzing && (
                   <motion.div
                     key="answer"
                     initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                     className="mt-6 p-5 bg-[#080b0e] border border-[#222c37] border-l-2 border-l-[#38bdf8]"
                   >
                     <div className="flex items-center gap-2 mb-3">
                       <Sparkles size={14} className="text-[#38bdf8]" />
                       <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence-Grounded Response</span>
                     </div>
                     <p className="text-sm text-[#f4f4f6] leading-relaxed">
                       {mockAnswer}
                     </p>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>

          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Insights;
