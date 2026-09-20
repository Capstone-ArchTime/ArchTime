import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Sparkles,
  GitCommit,
  CheckCircle2,
  Database,
  Cpu,
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

const Insights: React.FC = () => {
  const [askInput, setAskInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mockAnswer, setMockAnswer] = useState<string | null>(null);

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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#19C8F3]/10 border border-[#19C8F3]/30 mb-4">
              <Sparkles size={12} className="text-[#19C8F3]" />
              <span className="text-[10px] font-mono text-[#19C8F3] tracking-wider font-semibold uppercase">Evidence-Grounded AI</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#F4F7FA] mb-2">AI Architectural Insights</h2>
            <p className="text-[#8A98A8] text-sm max-w-xl leading-relaxed">
              Understand architectural changes through evidence-grounded explanations.
            </p>
          </div>
        </div>

        {/* SUMMARY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
               <Bot size={14} className="text-[#19C8F3]" />
               <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase">Insights Generated</h4>
            </div>
            <div className="text-3xl font-bold font-mono text-[#F4F7FA]">24</div>
          </div>
          
          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
               <SearchCode size={14} className="text-[#FFB020]" />
               <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase">Changes Analyzed</h4>
            </div>
            <div className="text-3xl font-bold font-mono text-[#F4F7FA]">38</div>
          </div>

          <div className="bg-[#0B1017] border border-[#1A2A37] p-5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
               <LineChart size={14} className="text-[#20C997]" />
               <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase">Evidence Links</h4>
            </div>
            <div className="text-3xl font-bold font-mono text-[#F4F7FA]">126</div>
          </div>
        </div>

        {/* MAIN INSIGHT SPLIT PANEL */}
        <div className="bg-[#0B1017] border border-[#19C8F3]/30 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(25,200,243,0.05)]">
          <div className="p-4 border-b border-[#1A2A37] bg-[#0E151D] flex items-center gap-3">
             <div className="w-6 h-6 rounded bg-[#19C8F3]/20 flex items-center justify-center">
                <Sparkles size={12} className="text-[#19C8F3]" />
             </div>
             <span className="text-xs font-bold text-[#F4F7FA] tracking-wide uppercase">ArchTime AI</span>
             <span className="text-xs font-mono text-[#566575]">|</span>
             <span className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-widest">Latest Architectural Insight</span>
          </div>

          <div className="flex flex-col lg:flex-row">
            
            {/* LEFT: EXPLANATION (70%) */}
            <div className="flex-[2] p-8 lg:border-r border-[#1A2A37] bg-[#090E14] relative overflow-hidden">
               {/* Background tech grid */}
               <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#19C8F3 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
               
               <div className="relative z-10">
                 <h3 className="text-xl font-bold text-[#F4F7FA] mb-6">
                   Why was PaymentService extracted from OrderService?
                 </h3>
                 
                 <div className="prose prose-invert max-w-none">
                   <p className="text-[#8A98A8] leading-loose text-[15px]">
                     Based on repository evidence, payment processing responsibilities were separated from <code className="text-[#FFB020] bg-[#FFB020]/10 px-1.5 py-0.5 rounded text-xs border border-[#FFB020]/20">OrderService</code> between commits <code className="text-[#19C8F3] bg-[#19C8F3]/10 px-1.5 py-0.5 rounded text-xs font-mono border border-[#19C8F3]/20">3e4877f</code> and <code className="text-[#19C8F3] bg-[#19C8F3]/10 px-1.5 py-0.5 rounded text-xs font-mono border border-[#19C8F3]/20">d82f91a</code>. 
                   </p>
                   <p className="text-[#8A98A8] leading-loose text-[15px] mt-4">
                     Evidence suggests this was driven by a need to decouple dependencies, as exactly 8 new external dependencies (including payment gateway SDKs) were introduced exclusively within the new <code className="text-[#FFB020] bg-[#FFB020]/10 px-1.5 py-0.5 rounded text-xs border border-[#FFB020]/20">PaymentService.java</code> file, effectively removing them from the core Order processing path.
                   </p>
                 </div>
               </div>
            </div>

            {/* RIGHT: EVIDENCE & BASIS (30%) */}
            <div className="flex-1 bg-[#0B1017] flex flex-col">
              
              {/* Evidence Support */}
              <div className="p-6 border-b border-[#1A2A37]">
                <h4 className="text-[10px] font-mono font-semibold text-[#FFB020] tracking-widest uppercase mb-4 flex items-center gap-2">
                  <CheckCircle2 size={12} /> Evidence Supporting This Insight
                </h4>
                <ul className="space-y-3">
                   <li className="flex items-start gap-2 text-xs font-mono text-[#8A98A8]">
                     <span className="text-[#20C997] mt-0.5">✓</span> Commit d82f91a
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#8A98A8]">
                     <span className="text-[#20C997] mt-0.5">✓</span> 12 modified files
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#8A98A8]">
                     <span className="text-[#20C997] mt-0.5">✓</span> 8 dependencies added
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#8A98A8]">
                     <span className="text-[#20C997] mt-0.5">✓</span> 3 dependencies removed
                   </li>
                   <li className="flex items-start gap-2 text-xs font-mono text-[#8A98A8]">
                     <span className="text-[#20C997] mt-0.5">✓</span> PaymentService.java introduced
                   </li>
                </ul>
                <button className="mt-5 w-full h-8 bg-[#0E151D] border border-[#1A2A37] hover:border-[#19C8F3]/50 text-[#19C8F3] font-bold text-[10px] rounded transition-colors uppercase tracking-wider">
                  View Evidence
                </button>
              </div>

              {/* Analysis Basis */}
              <div className="p-6">
                <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase mb-4">
                  Analysis Basis
                </h4>
                <div className="flex flex-wrap gap-2">
                   <span className="px-2 py-1 bg-[#1A2A37]/50 border border-[#1A2A37] text-[10px] font-mono text-[#8A98A8] rounded flex items-center gap-1.5">
                     <GitCommit size={10} /> Commit metadata
                   </span>
                   <span className="px-2 py-1 bg-[#1A2A37]/50 border border-[#1A2A37] text-[10px] font-mono text-[#8A98A8] rounded flex items-center gap-1.5">
                     <FileCode size={10} /> Source changes
                   </span>
                   <span className="px-2 py-1 bg-[#1A2A37]/50 border border-[#1A2A37] text-[10px] font-mono text-[#8A98A8] rounded flex items-center gap-1.5">
                     <Network size={10} /> Dependency graph
                   </span>
                   <span className="px-2 py-1 bg-[#1A2A37]/50 border border-[#1A2A37] text-[10px] font-mono text-[#8A98A8] rounded flex items-center gap-1.5">
                     <Box size={10} /> Architecture snapshots
                   </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* PREVIOUS INSIGHTS */}
        <div>
          <h3 className="text-sm font-bold text-[#F4F7FA] tracking-wide uppercase mb-4 mt-4">Previous Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             
             {/* Card 1 */}
             <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl p-5 hover:border-[#19C8F3]/30 transition-colors group">
               <h4 className="text-sm font-bold text-[#F4F7FA] mb-2">Payment service extraction</h4>
               <p className="text-xs text-[#8A98A8] mb-4 line-clamp-2">Based on AST evidence, payment responsibilities were extracted from the monolith.</p>
               <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#1A2A37]">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-mono text-[#19C8F3]"><GitCommit size={10} className="inline mr-1" />d82f91a</span>
                   <span className="text-[9px] font-mono text-[#566575]">Sep 18, 2026</span>
                 </div>
                 <button className="text-[10px] font-bold font-mono text-[#566575] group-hover:text-[#19C8F3] uppercase tracking-wider transition-colors flex items-center gap-1">
                   View Insight <ArrowRight size={12} />
                 </button>
               </div>
             </div>

             {/* Card 2 */}
             <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl p-5 hover:border-[#19C8F3]/30 transition-colors group">
               <h4 className="text-sm font-bold text-[#F4F7FA] mb-2">Order dependency restructuring</h4>
               <p className="text-xs text-[#8A98A8] mb-4 line-clamp-2">Evidence shows messaging queues replaced REST endpoints for inter-service communication.</p>
               <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#1A2A37]">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-mono text-[#19C8F3]"><GitCommit size={10} className="inline mr-1" />8af31c2</span>
                   <span className="text-[9px] font-mono text-[#566575]">Sep 12, 2026</span>
                 </div>
                 <button className="text-[10px] font-bold font-mono text-[#566575] group-hover:text-[#19C8F3] uppercase tracking-wider transition-colors flex items-center gap-1">
                   View Insight <ArrowRight size={12} />
                 </button>
               </div>
             </div>

             {/* Card 3 */}
             <div className="bg-[#0B1017] border border-[#1A2A37] rounded-xl p-5 hover:border-[#19C8F3]/30 transition-colors group">
               <h4 className="text-sm font-bold text-[#F4F7FA] mb-2">Settlement pipeline decoupling</h4>
               <p className="text-xs text-[#8A98A8] mb-4 line-clamp-2">Source code diffs confirm batch jobs were moved to a separate scheduled worker.</p>
               <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#1A2A37]">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-mono text-[#19C8F3]"><GitCommit size={10} className="inline mr-1" />c4199be</span>
                   <span className="text-[9px] font-mono text-[#566575]">Sep 05, 2026</span>
                 </div>
                 <button className="text-[10px] font-bold font-mono text-[#566575] group-hover:text-[#19C8F3] uppercase tracking-wider transition-colors flex items-center gap-1">
                   View Insight <ArrowRight size={12} />
                 </button>
               </div>
             </div>

          </div>
        </div>

        {/* ASK ARCHTIME */}
        <div className="bg-[#090E14] border border-[#1A2A37] rounded-xl p-6 md:p-8 mt-8">
          <h3 className="text-sm font-bold text-[#F4F7FA] tracking-wide uppercase mb-6 flex items-center gap-2">
            <TerminalSquare size={16} className="text-[#19C8F3]" /> Ask About Your Architecture
          </h3>

          <div className="space-y-4 max-w-3xl">
             <div className="relative flex items-center">
                <div className="absolute left-4 text-[#19C8F3] font-mono font-bold">{'>'}</div>
                <input 
                   type="text" 
                   value={askInput}
                   onChange={(e) => setAskInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleAsk(askInput)}
                   placeholder="Why did the architecture change here?"
                   className="w-full h-12 bg-[#05070A] border border-[#1A2A37] rounded-lg pl-10 pr-32 text-sm font-mono text-[#F4F7FA] placeholder-[#566575] focus:outline-none focus:border-[#19C8F3]/50 transition-colors"
                />
                <button 
                  onClick={() => handleAsk(askInput)}
                  className="absolute right-2 top-1.5 bottom-1.5 px-4 bg-[#1A2A37] hover:bg-[#566575] text-[#F4F7FA] font-bold text-[10px] tracking-wider rounded transition-colors uppercase disabled:opacity-50"
                  disabled={!askInput.trim() || isAnalyzing}
                >
                  Ask ArchTime
                </button>
             </div>

             {/* Suggested Chips */}
             <div className="flex flex-wrap gap-2">
                <button onClick={() => handleAsk("Why was this module extracted?")} className="px-3 py-1.5 bg-[#0E151D] border border-[#1A2A37] hover:border-[#19C8F3]/30 text-[10px] font-mono text-[#8A98A8] hover:text-[#19C8F3] rounded-full transition-colors">
                  Why was this module extracted?
                </button>
                <button onClick={() => handleAsk("What changed between these revisions?")} className="px-3 py-1.5 bg-[#0E151D] border border-[#1A2A37] hover:border-[#19C8F3]/30 text-[10px] font-mono text-[#8A98A8] hover:text-[#19C8F3] rounded-full transition-colors">
                  What changed between these revisions?
                </button>
                <button onClick={() => handleAsk("Which services became more coupled?")} className="px-3 py-1.5 bg-[#0E151D] border border-[#1A2A37] hover:border-[#19C8F3]/30 text-[10px] font-mono text-[#8A98A8] hover:text-[#19C8F3] rounded-full transition-colors">
                  Which services became more coupled?
                </button>
                <button onClick={() => handleAsk("Which architectural changes affected the most files?")} className="px-3 py-1.5 bg-[#0E151D] border border-[#1A2A37] hover:border-[#19C8F3]/30 text-[10px] font-mono text-[#8A98A8] hover:text-[#19C8F3] rounded-full transition-colors">
                  Which architectural changes affected the most files?
                </button>
             </div>

             {/* Output Area */}
             <AnimatePresence mode="wait">
               {isAnalyzing && (
                 <motion.div 
                   key="loading"
                   initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                   className="mt-6 p-4 bg-[#05070A] border border-[#1A2A37] rounded-lg flex items-center gap-3"
                 >
                   <Loader2 size={16} className="text-[#19C8F3] animate-spin" />
                   <span className="text-xs font-mono text-[#566575] animate-pulse">Analyzing repository evidence and structural topologies...</span>
                 </motion.div>
               )}
               
               {mockAnswer && !isAnalyzing && (
                 <motion.div 
                   key="answer"
                   initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                   className="mt-6 p-5 bg-[#05070A] border border-[#1A2A37] border-l-2 border-l-[#19C8F3] rounded-r-lg"
                 >
                   <div className="flex items-center gap-2 mb-3">
                     <Sparkles size={14} className="text-[#19C8F3]" />
                     <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#19C8F3]">Evidence-Grounded Response</span>
                   </div>
                   <p className="text-sm text-[#F4F7FA] leading-relaxed">
                     {mockAnswer}
                   </p>
                 </motion.div>
               )}
             </AnimatePresence>

          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Insights;
