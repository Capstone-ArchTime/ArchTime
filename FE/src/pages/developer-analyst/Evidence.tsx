import SampleDataNotice from '@/components/SampleDataNotice';
import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Search,
  ArrowRight,
  Box,
  Layers,
  GitCommit,
  X,
  Link,
  Code2,
  FileCode,
  Network,
  FolderKanban,
  ChevronDown,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { API_BASE_URL } from '@/auth/session';
import { App, Modal } from 'antd';

const Evidence: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [evidenceData, setEvidenceData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [selectedChange, setSelectedChange] = useState<any | null>(null);
  const [fileDiffModal, setFileDiffModal] = useState<{ visible: boolean, filename: string, content: string }>({
    visible: false,
    filename: '',
    content: ''
  });

  const closeDrawer = useCallback(() => setSelectedChange(null), []);
  const drawerRef = useFocusTrap(selectedChange !== null, closeDrawer);
  
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [repository, setRepository] = useState('all');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`${API_BASE_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const pList = data.data?.projects || [];
          setProjectsList(pList);
          
          const searchParams = new URLSearchParams(location.search);
          const pId = searchParams.get('projectId');
          if (pId && pList.find((p: any) => p.id === pId)) {
            setSelectedProjectId(pId);
          } else if (pList.length > 0) {
            setSelectedProjectId(pList[0].id);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchProjects();
  }, [location.search]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchEvidences = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`${API_BASE_URL}/projects/${selectedProjectId}/evidences`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const eList = data.data?.evidences || [];
          
          // formatting dates for UI
          const formatted = eList.map((e: any) => ({
            ...e,
            date: new Date(e.date).toLocaleString(),
            sourceFiles: e.sourceFiles && e.sourceFiles.length > 0 ? e.sourceFiles : [],
            diffBefore: e.diffBefore || '// No diff recorded',
          }));
          setEvidenceData(formatted);
        } else {
           setEvidenceData([]);
        }
      } catch (e) {
        console.error(e);
        setEvidenceData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvidences();
  }, [selectedProjectId]);

  const filtered = evidenceData.filter(item =>
    (type === 'all' || item.type === type) && (repository === 'all' || item.repository === repository) &&
    [item.changeTitle, item.summary, item.commit].some(value => value.toLowerCase().includes(search.trim().toLowerCase())));
  
  const pagination = usePagination(filtered, JSON.stringify([search, type, repository, evidenceData]));

  // Helper to extract specific file diff from full patch
  const viewFileDiff = (filename: string, fullPatch: string) => {
    if (!fullPatch) return;
    // Basic extraction logic: split by diff --git
    const chunks = fullPatch.split('diff --git ');
    // Find the chunk for this file
    const fileChunk = chunks.find(chunk => chunk.includes(`b/${filename}`) || chunk.includes(`a/${filename}`));
    
    if (fileChunk) {
      setFileDiffModal({
        visible: true,
        filename,
        content: `diff --git ${fileChunk}`
      });
    } else {
      setFileDiffModal({
        visible: true,
        filename,
        content: '// Diff snippet not found in stored patch'
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 flex flex-col min-h-[calc(100dvh-140px)] relative">
        {evidenceData.length === 0 && !loading && <SampleDataNotice />}
        
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

              <div className="mt-6 mb-2 flex items-center gap-4">
                <div className="relative group flex items-center h-10 bg-[#080b0e] border border-[#222c37] hover:border-[#5f636b] transition-colors">
                  <FolderKanban size={16} className="text-[#94a3b8] ml-4" />
                  <span className="text-[10px] font-mono text-[#94a3b8] uppercase pl-2" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Project:</span>
                  <select 
                    value={selectedProjectId} 
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="appearance-none bg-transparent border-none text-xs font-bold text-[#f4f4f6] pl-2 pr-10 h-full outline-none cursor-pointer w-48"
                  >
                    {projectsList.length > 0 ? projectsList.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#161d24]">{p.name}</option>
                    )) : <option value="" className="bg-[#161d24]">No Projects Found</option>}
                  </select>
                  <ChevronDown size={14} className="text-[#94a3b8] absolute right-3 pointer-events-none group-hover:text-[#f4f4f6]" />
                </div>
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="flex flex-wrap items-center gap-3 bg-[#11161b] p-3 border border-[#222c37]">
            <div className="flex-1 relative min-w-[200px]">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
               <input
                 type="text"
                 aria-label="Search changes"
                 value={search}
                 onChange={event => setSearch(event.target.value)}
                 placeholder="Search changes..."
                 className="w-full bg-[#080b0e] border border-[#222c37] h-9 pl-9 pr-9 text-sm text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
               />
               {search && (
                 <button 
                   onClick={() => setSearch('')}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f636b] hover:text-[#f4f4f6] transition-colors"
                   aria-label="Clear search"
                 >
                   <X size={14} />
                 </button>
               )}
            </div>
            
            <select aria-label="Filter by change type" value={type} onChange={event => setType(event.target.value)} className="h-10 px-3 bg-[#080b0e] border border-[#222c37] text-sm">
              <option value="all">All change types</option>{[...new Set(evidenceData.map(item => item.type))].map(value => <option key={value} value={value as string}>{value as string}</option>)}
            </select>
            <select aria-label="Filter by repository" value={repository} onChange={event => setRepository(event.target.value)} className="h-10 px-3 bg-[#080b0e] border border-[#222c37] text-sm">
              <option value="all">All repositories</option>{[...new Set(evidenceData.map(item => item.repository))].map(value => <option key={value} value={value as string}>{value as string}</option>)}
            </select>
          </div>
        </div>

        {/* CHANGE LIST TABLE */}
        <div className="flex-1 bg-[#11161b] border border-[#222c37] overflow-hidden flex flex-col relative">
          {loading && (
             <div className="absolute inset-0 bg-[#080b0e]/80 flex items-center justify-center z-10 backdrop-blur-sm">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-[#38bdf8] border-t-transparent animate-spin"></div>
                  <span className="text-xs font-mono text-[#38bdf8]">Loading Evidence...</span>
               </div>
             </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#222c37] bg-[#161d24]">
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Change</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Type</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Date</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider text-right"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222c37]">
                {!loading && !filtered.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-[#94a3b8]" role="status">No changes match these filters.</td></tr>}
                {pagination.items.map((item: any) => (
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
                         className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#94a3b8] group-hover:text-[#38bdf8] transition-colors uppercase focus:outline-none focus-visible:text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          View <ArrowRight size={14} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar {...pagination} />
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
                      <h3 id="evidence-detail-title" className="text-xl font-bold text-[#f4f4f6] leading-snug">{selectedChange.changeTitle}</h3>
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
                    <h4 className="text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2"
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
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-[#161d24] border border-[#222c37] p-4">
                        <div className="text-[10px] font-mono text-[#94a3b8] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit Info</div>
                        <div className="text-sm font-mono font-bold text-[#38bdf8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{selectedChange.commit}</div>
                        <div className="text-[10px] mt-1 text-[#f4f4f6] truncate" title={selectedChange.diffBefore?.match(/Author:\s*(.*)/)?.[1] || 'Unknown Author'}>
                          {selectedChange.diffBefore?.match(/Author:\s*(.*)/)?.[1] || 'Unknown Author'}
                        </div>
                        <div className="text-[10px] mt-1 text-[#94a3b8]">{selectedChange.date}</div>
                     </div>
                     <div className="bg-[#161d24] border border-[#222c37] p-4">
                        <div className="text-[10px] font-mono text-[#94a3b8] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies Drift</div>
                        <div className="text-sm font-bold font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                           <span className="text-[#22c55e]">+{selectedChange.depsAdded} added</span> / <span className="text-[#ef4444]">-{selectedChange.depsRemoved} removed</span>
                        </div>
                     </div>
                  </div>

                  {/* MODIFIED FILES LIST */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <FileCode size={14} /> Modified Files ({selectedChange.files})
                    </h4>
                    
                    <div className="bg-[#11161b] border border-[#222c37] overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                       <ul className="divide-y divide-[#222c37]">
                         {selectedChange.sourceFiles?.length > 0 ? (
                           selectedChange.sourceFiles.map((file: string, idx: number) => (
                             <li key={idx} className="flex items-center justify-between p-3 hover:bg-[#161d24] transition-colors group">
                                <div className="flex items-center gap-3 truncate">
                                   <FileText size={14} className="text-[#94a3b8]" />
                                   <span className="text-xs font-mono text-[#f4f4f6] truncate" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{file}</span>
                                </div>
                                <button
                                  onClick={() => viewFileDiff(file, selectedChange.diffBefore)}
                                  className="shrink-0 ml-4 px-3 py-1 bg-[#222c37] text-[10px] font-mono text-[#94a3b8] group-hover:text-[#38bdf8] transition-colors rounded-sm"
                                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                                >
                                  VIEW DIFF
                                </button>
                             </li>
                           ))
                         ) : (
                           <li className="p-4 text-xs text-[#94a3b8] italic">No file details collected.</li>
                         )}
                       </ul>
                    </div>
                  </div>

                  {/* ARCHITECTURE SUMMARY */}
                  <div className="space-y-3 pb-8">
                     <h4 className="text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <Box size={14} /> Architecture Interpretation
                     </h4>
                     <div className="bg-[#161d24] border border-[#222c37] p-6 flex flex-col items-center">
                        <div className="flex items-center justify-center w-full max-w-md relative">
                           {/* Line connecting them */}
                           <div className="absolute top-1/2 left-0 right-0 h-px bg-[#222c37] -translate-y-1/2 z-0"></div>
                           
                           <div className="flex justify-between w-full z-10">
                              <div className="flex flex-col items-center gap-2 bg-[#161d24] px-4">
                                <div className="w-12 h-12 rounded-lg bg-[#080b0e] border border-[#222c37] flex items-center justify-center text-[#94a3b8] shadow-inner">
                                   <Layers size={20} />
                                </div>
                                <span className="text-[10px] font-mono text-[#94a3b8] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>PREVIOUS STATE</span>
                              </div>

                              <div className="flex flex-col items-center justify-center bg-[#161d24] px-2">
                                <div className="w-6 h-6 rounded-full bg-[#222c37] border border-[#5f636b] flex items-center justify-center text-[#f4f4f6]">
                                   <ArrowRight size={12} />
                                </div>
                              </div>

                              <div className="flex flex-col items-center gap-2 bg-[#161d24] px-4">
                                <div className="w-12 h-12 rounded-lg bg-[#ffb03a]/10 border border-[#ffb03a]/30 flex items-center justify-center text-[#ffb03a] shadow-[0_0_15px_rgba(255,176,58,0.1)]">
                                   <Box size={20} />
                                </div>
                                <span className="text-[10px] font-mono text-[#ffb03a] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>NEW STRUCTURE</span>
                              </div>
                           </div>
                        </div>
                        <p className="text-[10px] text-[#94a3b8] mt-4 uppercase tracking-widest">
                           Detected structural change based on AST dependency drift mapping to Git diffs
                        </p>
                     </div>
                  </div>

                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* MODAL FOR INDIVIDUAL FILE DIFF */}
        <Modal
          centered
          title={
            <div className="flex items-center gap-2 text-[#f4f4f6] font-mono text-sm" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              <Code2 size={16} className="text-[#38bdf8]" />
              Diff: {fileDiffModal.filename}
            </div>
          }
          open={fileDiffModal.visible}
          onCancel={() => setFileDiffModal({ visible: false, filename: '', content: '' })}
          footer={null}
          width={900}
          className="dark-modal"
          styles={{
            content: { backgroundColor: '#11161b', border: '1px solid #222c37', padding: 0 },
            header: { backgroundColor: '#161d24', borderBottom: '1px solid #222c37', padding: '16px', margin: 0 },
            body: { padding: '0' }
          }}
          closeIcon={<X size={18} className="text-[#94a3b8] hover:text-[#f4f4f6]" />}
        >
          <div className="bg-[#080b0e] overflow-x-auto p-4 custom-scrollbar" style={{ maxHeight: '70vh' }}>
            <pre className="text-xs font-mono" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              <code>
                {fileDiffModal.content.split('\n').map((line, idx) => {
                  let textColor = 'text-[#f4f4f6]';
                  let bgColor = 'bg-transparent';
                  
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    textColor = 'text-[#22c55e]'; // green
                    bgColor = 'bg-[#22c55e]/10';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    textColor = 'text-[#ef4444]'; // red
                    bgColor = 'bg-[#ef4444]/10';
                  } else if (line.startsWith('@@')) {
                    textColor = 'text-[#38bdf8]'; // blue for chunks
                  } else if (line.startsWith('+++') || line.startsWith('---')) {
                    textColor = 'text-[#94a3b8] font-bold'; // gray for headers
                  }
                  
                  return (
                    <div key={idx} className={`px-2 py-0.5 whitespace-pre ${textColor} ${bgColor}`}>
                      {line || ' '}
                    </div>
                  );
                })}
              </code>
            </pre>
          </div>
        </Modal>
        
      </div>
    </DashboardLayout>
  );
};

export default Evidence;
