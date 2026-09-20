import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  FileText,
  ChevronDown,
  ArrowRight,
  Download,
  Share2,
  ArrowLeft,
  FileJson,
  Sparkles,
  GitCommit,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Mock Data
const reportsData = [
  {
    id: 1,
    name: 'E-Commerce Architecture Evolution',
    project: 'E-Commerce Platform',
    range: 'v1.0 → HEAD',
    date: 'Sep 18, 2026',
    status: 'READY'
  },
  {
    id: 2,
    name: 'Architecture Comparison',
    project: 'Payment Platform',
    range: 'v1.5 → v2.0',
    date: 'Sep 17, 2026',
    status: 'READY'
  },
  {
    id: 3,
    name: 'Repository Analysis',
    project: 'Healthcare Connect',
    range: 'HEAD',
    date: 'Sep 15, 2026',
    status: 'READY'
  }
];

const Reports: React.FC = () => {
  const [viewState, setViewState] = useState<'list' | 'preview'>('list');
  const [activeReport, setActiveReport] = useState<typeof reportsData[0] | null>(null);

  const handleViewReport = (report: typeof reportsData[0]) => {
    setActiveReport(report);
    setViewState('preview');
  };

  const handleBack = () => {
    setViewState('list');
    setActiveReport(null);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto flex flex-col h-[calc(100vh-140px)] relative overflow-hidden">
        
        <AnimatePresence mode="wait">
          
          {/* ================================================== */}
          {/* LIST VIEW */}
          {/* ================================================== */}
          {viewState === 'list' && (
            <motion.div 
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col space-y-6"
            >
              {/* HEADER */}
              <div className="shrink-0 space-y-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E151D] border border-[#1A2A37] mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
                      <span className="text-[10px] font-mono text-[#19C8F3] tracking-wider font-semibold uppercase">Architecture Reporting</span>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-[#F4F7FA] mb-2">Reports</h2>
                    <p className="text-[#8A98A8] text-sm max-w-xl leading-relaxed">
                      Generate and review evidence-backed reports of architectural evolution.
                    </p>
                  </div>
                  <button className="shrink-0 h-10 px-5 bg-[#19C8F3] hover:bg-[#19C8F3]/90 text-[#070A0F] font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(25,200,243,0.15)] uppercase">
                    + GENERATE REPORT
                  </button>
                </div>

                {/* FILTER BAR */}
                <div className="flex flex-wrap items-center gap-3 bg-[#0B1017] p-3 rounded-xl border border-[#1A2A37]">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#566575] uppercase px-2">Filters:</div>
                  
                  <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
                    <span className="text-[10px] font-mono text-[#566575] uppercase">Project</span>
                    <span className="text-xs font-bold text-[#F4F7FA]">E-Commerce Platform</span>
                    <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
                  </button>
                  
                  <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
                    <span className="text-[10px] font-mono text-[#566575] uppercase">Repository</span>
                    <span className="text-xs font-bold text-[#F4F7FA]">order-service</span>
                    <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
                  </button>

                  <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
                    <span className="text-[10px] font-mono text-[#566575] uppercase">Revision Range</span>
                    <span className="text-xs font-bold text-[#F4F7FA]">v1.0 → HEAD</span>
                    <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
                  </button>

                  <button className="h-9 px-4 bg-[#070A0F] border border-[#1A2A37] hover:border-[#566575] rounded flex items-center gap-2 transition-colors group">
                    <span className="text-[10px] font-mono text-[#566575] uppercase">Report Type</span>
                    <span className="text-xs font-bold text-[#F4F7FA]">Architecture Evolution</span>
                    <ChevronDown size={14} className="text-[#566575] group-hover:text-[#F4F7FA]" />
                  </button>
                </div>
              </div>

              {/* REPORT LIST TABLE */}
              <div className="flex-1 bg-[#0B1017] border border-[#1A2A37] rounded-xl overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="border-b border-[#1A2A37] bg-[#0E151D]">
                        <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Report</th>
                        <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Project</th>
                        <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Revision Range</th>
                        <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Created</th>
                        <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider">Status</th>
                        <th className="p-4 text-[10px] font-mono font-bold text-[#566575] uppercase tracking-wider text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1A2A37]">
                      {reportsData.map((report) => (
                        <tr key={report.id} className="group hover:bg-[#1A2A37]/30 transition-colors">
                          <td className="p-4 text-sm font-bold text-[#F4F7FA] flex items-center gap-2">
                             <FileText size={16} className="text-[#19C8F3]" />
                             {report.name}
                          </td>
                          <td className="p-4 text-xs font-mono text-[#8A98A8]">{report.project}</td>
                          <td className="p-4 text-xs font-mono text-[#8A98A8]">{report.range}</td>
                          <td className="p-4 text-xs text-[#8A98A8]">{report.date}</td>
                          <td className="p-4">
                             <span className="px-2 py-1 bg-[#19C8F3]/10 border border-[#19C8F3]/20 text-[#19C8F3] text-[9px] font-mono font-bold uppercase tracking-widest rounded flex items-center gap-1.5 w-max">
                               <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3]"></div>
                               {report.status}
                             </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                             <button 
                               onClick={() => handleViewReport(report)}
                               className="inline-flex h-8 px-3 items-center justify-center gap-1 text-[10px] font-mono font-bold text-[#F4F7FA] bg-[#1A2A37] hover:bg-[#566575] transition-colors rounded uppercase"
                             >
                                View
                             </button>
                             <button className="inline-flex h-8 px-3 items-center justify-center gap-1 text-[10px] font-mono font-bold text-[#19C8F3] border border-[#19C8F3]/30 hover:border-[#19C8F3] hover:bg-[#19C8F3]/10 transition-colors rounded uppercase">
                                Export
                             </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

          {/* ================================================== */}
          {/* PREVIEW VIEW */}
          {/* ================================================== */}
          {viewState === 'preview' && activeReport && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-1 flex flex-col bg-[#090E14] border border-[#1A2A37] rounded-xl overflow-hidden shadow-2xl relative"
            >
              
              {/* TOP ACTION BAR */}
              <div className="p-4 border-b border-[#1A2A37] bg-[#070A0F] flex items-center justify-between shrink-0">
                 <button 
                   onClick={handleBack}
                   className="h-9 px-4 bg-transparent hover:bg-[#1A2A37] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-xs rounded transition-colors flex items-center gap-2"
                 >
                    <ArrowLeft size={16} /> BACK TO REPORTS
                 </button>
                 
                 <div className="flex items-center gap-3">
                    <button className="h-9 px-4 bg-transparent border border-[#1A2A37] hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-[10px] rounded transition-colors flex items-center gap-2 uppercase tracking-wider">
                       <Share2 size={14} /> Share Report
                    </button>
                    <button className="h-9 px-4 bg-transparent border border-[#1A2A37] hover:border-[#566575] text-[#8A98A8] hover:text-[#F4F7FA] font-bold text-[10px] rounded transition-colors flex items-center gap-2 uppercase tracking-wider">
                       <FileJson size={14} /> Export JSON
                    </button>
                    <button className="h-9 px-4 bg-[#19C8F3]/10 border border-[#19C8F3]/30 hover:bg-[#19C8F3]/20 text-[#19C8F3] font-bold text-[10px] rounded transition-colors flex items-center gap-2 uppercase tracking-wider">
                       <Download size={14} /> Export PDF
                    </button>
                 </div>
              </div>

              {/* REPORT DOCUMENT SCROLL AREA */}
              <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-[#05070A]">
                 
                 <div className="max-w-[800px] mx-auto bg-[#0B1017] border border-[#1A2A37] rounded-sm p-10 md:p-16 shadow-2xl space-y-16">
                    
                    {/* REPORT HEADER */}
                    <div className="text-center space-y-6 pb-12 border-b border-[#1A2A37]">
                       <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#070A0F] border border-[#1A2A37] mb-4">
                         <FileText size={12} className="text-[#566575]" />
                         <span className="text-[10px] font-mono text-[#566575] tracking-widest font-bold uppercase">ArchTime Architecture Report</span>
                       </div>
                       
                       <h1 className="text-4xl font-bold text-[#F4F7FA] tracking-tight">{activeReport.name}</h1>
                       
                       <div className="flex items-center justify-center gap-6 text-sm font-mono text-[#8A98A8]">
                          <span className="flex items-center gap-2"><Box size={14} /> {activeReport.project}</span>
                          <span className="flex items-center gap-2"><GitCommit size={14} /> {activeReport.range}</span>
                          <span className="flex items-center gap-2"><Clock size={14} /> {activeReport.date}</span>
                       </div>
                    </div>

                    {/* 01 EXECUTIVE SUMMARY */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">01</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Executive Summary</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       <p className="text-[#8A98A8] leading-relaxed text-sm">
                          This report details the architectural evolution of the <strong className="text-[#F4F7FA]">{activeReport.project}</strong> between revisions {activeReport.range}. 
                          Repository evidence indicates a significant shift from a monolithic structure towards a decentralized microservices architecture. 
                          Key events include the extraction of the Payment Service and the decoupling of the Settlement pipeline.
                       </p>
                    </section>

                    {/* 02 ARCHITECTURE OVERVIEW */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">02</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Architecture Overview</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       
                       {/* SVG Placeholder for Report Graph */}
                       <div className="w-full h-[250px] bg-[#070A0F] border border-[#1A2A37] rounded flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                          <svg viewBox="0 0 400 200" className="w-full h-full opacity-60">
                             <path d="M 100 100 L 300 100" stroke="#566575" strokeWidth="2" strokeDasharray="4 4" />
                             <circle cx="100" cy="100" r="30" fill="#0E151D" stroke="#1687FF" strokeWidth="2" />
                             <circle cx="300" cy="100" r="30" fill="#0E151D" stroke="#FFB020" strokeWidth="2" />
                             <text x="100" y="105" fill="#8A98A8" fontSize="10" fontFamily="monospace" textAnchor="middle">ORDER</text>
                             <text x="300" y="105" fill="#8A98A8" fontSize="10" fontFamily="monospace" textAnchor="middle">PAYMENT</text>
                          </svg>
                       </div>
                    </section>

                    {/* 03 ARCHITECTURE TIMELINE */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">03</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Architecture Timeline</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       
                       <div className="relative pl-6 space-y-8 border-l border-[#1A2A37] ml-2">
                          <div className="relative">
                             <div className="absolute -left-[30px] w-3 h-3 rounded-full bg-[#1A2A37] border-2 border-[#0B1017]"></div>
                             <div className="text-[10px] font-mono text-[#566575] font-bold mb-1">v1.0 (a82f91a)</div>
                             <div className="text-sm text-[#F4F7FA]">Initial Monolith structure</div>
                          </div>
                          <div className="relative">
                             <div className="absolute -left-[30px] w-3 h-3 rounded-full bg-[#FFB020] border-2 border-[#0B1017] shadow-[0_0_5px_#FFB020]"></div>
                             <div className="text-[10px] font-mono text-[#566575] font-bold mb-1">v1.2 (d82f91a)</div>
                             <div className="text-sm text-[#FFB020] font-bold">PaymentService Extracted</div>
                          </div>
                          <div className="relative">
                             <div className="absolute -left-[30px] w-3 h-3 rounded-full bg-[#1687FF] border-2 border-[#0B1017]"></div>
                             <div className="text-[10px] font-mono text-[#566575] font-bold mb-1">v1.5 (8af31c2)</div>
                             <div className="text-sm text-[#F4F7FA]">Order Dependency Restructured</div>
                          </div>
                       </div>
                    </section>

                    {/* 04 MAJOR ARCHITECTURAL CHANGES */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">04</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Major Architectural Changes</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#070A0F] border border-[#1A2A37] p-4 rounded text-center">
                             <div className="text-3xl font-mono font-bold text-[#F4F7FA] mb-1">3</div>
                             <div className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-widest">Total Events</div>
                          </div>
                          <div className="bg-[#070A0F] border border-[#1A2A37] p-4 rounded text-center">
                             <div className="text-3xl font-mono font-bold text-[#FFB020] mb-1">2</div>
                             <div className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-widest">Modules Extracted</div>
                          </div>
                       </div>
                    </section>

                    {/* 05 DEPENDENCY EVOLUTION */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">05</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Dependency Evolution</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       <p className="text-[#8A98A8] leading-relaxed text-sm">
                          The system experienced a net increase in dependencies, primarily driven by the introduction of inter-service communication protocols (Kafka, gRPC) replacing in-memory method calls.
                       </p>
                    </section>

                    {/* 06 EVIDENCE */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">06</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Repository Evidence</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       
                       <div className="bg-[#070A0F] border border-[#1A2A37] rounded">
                          <div className="p-3 border-b border-[#1A2A37] flex items-center justify-between text-[10px] font-mono text-[#566575] uppercase tracking-widest">
                             <span>Commit Hash</span>
                             <span>Modified Files</span>
                          </div>
                          <div className="p-3 flex items-center justify-between text-sm border-b border-[#1A2A37]/50">
                             <span className="font-mono text-[#19C8F3]">d82f91a</span>
                             <span className="text-[#F4F7FA]">12 files</span>
                          </div>
                          <div className="p-3 flex items-center justify-between text-sm">
                             <span className="font-mono text-[#19C8F3]">c4199be</span>
                             <span className="text-[#F4F7FA]">18 files</span>
                          </div>
                       </div>
                    </section>

                    {/* 07 AI-GENERATED INSIGHTS */}
                    <section className="bg-[#19C8F3]/5 border border-[#19C8F3]/20 rounded p-6">
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">07</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide flex items-center gap-2">
                               <Sparkles size={18} className="text-[#19C8F3]" /> AI-Generated Insights
                            </h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       
                       <div className="text-[10px] font-mono text-[#19C8F3] uppercase tracking-widest mb-4 font-bold">
                          ⚠ AI Interpretation based on repository evidence
                       </div>
                       <p className="text-[#8A98A8] leading-relaxed text-sm">
                          Evidence suggests that the extraction of the Payment Service was a deliberate architectural refactoring to isolate third-party dependencies from the core order processing logic. This conclusion is based on the removal of 3 external SDKs from the Order module and their corresponding addition to the new Payment module.
                       </p>
                    </section>

                    {/* 08 CONCLUSION */}
                    <section>
                       <div className="flex items-start gap-4 mb-6">
                         <span className="text-2xl font-mono font-bold text-[#19C8F3]">08</span>
                         <div>
                            <h2 className="text-xl font-bold text-[#F4F7FA] uppercase tracking-wide">Conclusion</h2>
                            <div className="h-[2px] w-12 bg-[#19C8F3] mt-2"></div>
                         </div>
                       </div>
                       <p className="text-[#8A98A8] leading-relaxed text-sm">
                          The system architecture has matured from a monolithic design to a more distributed topology. The evidence indicates successful decoupling of critical business domains, though it introduces new network dependencies that must be monitored.
                       </p>
                    </section>
                    
                    <div className="text-center pt-8 border-t border-[#1A2A37]">
                       <div className="text-[10px] font-mono text-[#566575] uppercase tracking-widest">
                          Generated by ArchTime • {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                       </div>
                    </div>

                 </div>
              </div>

            </motion.div>
          )}

        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
};

export default Reports;
