import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '@/api/client';
import { getWorkspaces, mayHaveSnapshots, type Workspace } from '@/features/workspace-summary';
import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  GitCommit,
  GitBranch,
  ChevronDown,
  FileText,
  User,
  Calendar,
  Layers,
  GitMerge,
  GitCompare,
  Search,
  X
} from 'lucide-react';

import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';

const ArchitectureHistory: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [history, setHistory] = useState<{ id: string; commits: any[]; error: string | null } | null>(null);
  const [projectsList, setProjectsList] = useState<Workspace[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const [chosenCommit, setChosenCommit] = useState<string>('');
  // Commits belong to the workspace they were loaded for; until the selected one's arrive, it is loading.
  const current = history && history.id === selectedProjectId ? history : null;
  const loadingSnapshots = !!selectedProjectId && !current;
  const allCommits = React.useMemo(() => current?.commits ?? [], [current]);
  const loadError = listError ?? current?.error ?? null;
  const branchesList = React.useMemo(() => Array.from(new Set(allCommits.flatMap((c: any) => c.branches))) as string[], [allCommits]);
  const [branchChoice, setBranchChoice] = useState<string | null>(null);
  // '' means every branch: the default when the repository has no main or master (tags only, or no branch information).
  const defaultBranch = ['main', 'master'].find(b => branchesList.includes(b)) ?? '';
  const selectedBranch = branchChoice !== null && (branchChoice === '' || branchesList.includes(branchChoice)) ? branchChoice : defaultBranch;
  const setSelectedBranch = setBranchChoice;
  const commits = React.useMemo(() => {
    const q = appliedSearchQuery.trim().toLowerCase();
    return (selectedBranch ? allCommits.filter(c => c.branches.includes(selectedBranch)) : allCommits)
      .filter(c => !q || c.title.toLowerCase().includes(q) || c.hash.toLowerCase().includes(q) || c.author.toLowerCase().includes(q));
  }, [allCommits, selectedBranch, appliedSearchQuery]);
  const pagination = usePagination(commits, '', 5);
  const activeCommit = commits.some(c => c.hash === chosenCommit) ? chosenCommit : commits[0]?.hash ?? '';
  const setActiveCommit = setChosenCommit;

  const currentCommit = commits.find(c => c.hash === activeCommit) || commits[0];
  const isBaseState = activeCommit === commits[0]?.hash;
  const selectedProject = projectsList?.find(p => p.id === selectedProjectId);

  React.useEffect(() => {
    const controller = new AbortController();
    getWorkspaces(controller.signal).then(({ workspaces }) => {
      // Every workspace with mined commits, whatever its status says about the rest of its history.
      const withHistory = workspaces.filter(mayHaveSnapshots);
      setProjectsList(withHistory);
      const wanted = searchParams.get('projectId');
      setSelectedProjectId(withHistory.find(p => p.id === wanted)?.id ?? withHistory[0]?.id ?? null);
    }).catch(e => { if (!controller.signal.aborted) setListError(e instanceof Error ? e.message : 'Could not load your workspaces.'); });
    return () => controller.abort();
  }, [searchParams]);

  React.useEffect(() => {
    if (!selectedProjectId) return;
    const controller = new AbortController();
    const id = selectedProjectId;
    apiRequest<{ data?: { snapshots?: any[] } }>(`/projects/${encodeURIComponent(selectedProjectId)}/snapshots`, { signal: controller.signal }).then(snapData => {
      const fetchedCommits = (snapData.data?.snapshots ?? []).map((s: any) => ({
        hash: s.hash,
        version: s.version || s.hash,
        title: s.title,
        author: s.author || 'Unknown author',
        date: new Date(s.date).toLocaleDateString(),
        branches: s.branches || [],
        files: s.files ?? 0,
        archChanges: s.archChanges ?? 0,
        depAdded: s.depAdded ?? 0,
        depRemoved: s.depRemoved ?? 0,
        nodes: s.nodes || [],
        edges: s.edges || []
      })).reverse();
      setHistory({ id, commits: fetchedCommits, error: null });
    }).catch(e => {
      if (!controller.signal.aborted) setHistory({ id, commits: [], error: e instanceof Error ? e.message : 'Could not load the mined commits.' });
    });
    return () => controller.abort();
  }, [selectedProjectId]);


  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 flex flex-col min-h-[calc(100dvh-140px)]">
        
        {/* HEADER & TOP CONTROLS */}
        <div className="shrink-0 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#242527] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_5px_#3b82f6]"></div>
                <span className="text-[10px] font-mono text-[#3b82f6] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture Observatory</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Architecture History</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Reconstruct how the system architecture evolved across repository revisions.
              </p>
            </div>
            <Link to={selectedProjectId ? `/compare?projectId=${encodeURIComponent(selectedProjectId)}` : '/compare'} className="shrink-0 h-10 px-5 bg-[#11161b] hover:bg-[#242527] border border-[#242527] text-[#3b82f6] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.05)]">
              <GitCompare size={16} />
              COMPARE REVISIONS
            </Link>
          </div>

          {/* PROJECT SELECTOR FILTERS */}
          <div className="flex flex-wrap items-center gap-3 bg-[#11161b] p-3 border border-[#242527]">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#94a3b8] uppercase px-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Filters:</div>
            
            <div className="relative group flex items-center h-9 bg-[#080b0e] border border-[#242527] hover:border-[#5f636b] transition-colors">
              <span className="text-[10px] font-mono text-[#94a3b8] uppercase pl-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Workspace</span>
              <select 
                value={selectedProjectId || ''} 
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="appearance-none bg-transparent border-none text-xs font-bold text-[#f4f4f6] pl-2 pr-8 h-full outline-none cursor-pointer"
              >
                {projectsList?.length ? projectsList.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#161d24]">{p.name}</option>
                )) : <option value="" className="bg-[#161d24]">No mined workspaces</option>}
              </select>
              <ChevronDown size={14} className="text-[#94a3b8] absolute right-3 pointer-events-none group-hover:text-[#f4f4f6]" />
            </div>
            

            {branchesList.length > 0 && <div className="relative group flex items-center h-9 bg-[#080b0e] border border-[#242527] hover:border-[#5f636b] transition-colors">
              <span className="text-[10px] font-mono text-[#94a3b8] uppercase pl-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Branch</span>
              <div className="flex items-center gap-1.5 pl-2 pr-8 text-[#3b82f6]">
                <GitBranch size={12} />
                <select 
                  value={selectedBranch} 
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="appearance-none bg-transparent border-none text-xs font-bold text-[#f4f4f6] h-full outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#161d24]">All branches</option>
                  {branchesList.map(b => (
                    <option key={b} value={b} className="bg-[#161d24]">{b}</option>
                  ))}
                </select>
              </div>
              <ChevronDown size={14} className="text-[#94a3b8] absolute right-3 pointer-events-none group-hover:text-[#f4f4f6]" />
            </div>}

            <div className="flex items-center h-9 px-4 bg-[#080b0e] border border-[#242527] gap-2 ml-auto">
              <span className="text-[10px] font-mono text-[#94a3b8] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Time Range</span>
              <span className="text-xs font-bold text-[#f4f4f6]">ALL TIME</span>
            </div>

            <div className="relative flex items-center h-9 bg-[#080b0e] border border-[#242527] focus-within:border-[#3b82f6] transition-colors ml-2 w-48 lg:w-64">
              <Search size={14} className="text-[#94a3b8] absolute left-3" />
              <input 
                type="text" 
                placeholder="Search commits..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (e.target.value === '') {
                    setAppliedSearchQuery('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setAppliedSearchQuery(searchInput);
                  }
                }}
                className="w-full h-full bg-transparent border-none text-xs text-[#f4f4f6] pl-9 pr-8 outline-none placeholder-[#5f636b]"
              />
              {searchInput && (
                <button 
                  onClick={() => {
                    setSearchInput('');
                    setAppliedSearchQuery('');
                  }}
                  className="absolute right-2.5 text-[#5f636b] hover:text-[#f4f4f6] transition-colors outline-none"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="border border-[#ef4444]/40 bg-[#ef4444]/5 p-4 text-sm text-[#fca5a5]">{loadError}</div>
        )}

        {projectsList?.length === 0 ? (
          <section className="bg-[#11161b] border border-dashed border-[#242527] p-10 text-center" aria-labelledby="no-history-title">
            <Layers size={28} className="text-[#3b82f6] mx-auto mb-4" aria-hidden="true" />
            <h3 id="no-history-title" className="text-lg font-bold text-[#f4f4f6] mb-2">No architecture history yet</h3>
            <p className="text-sm text-[#94a3b8] max-w-md mx-auto mb-6">The history appears once commits of a workspace have been mined. Create a workspace or open one and choose Manage mining.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/projects" className="h-10 px-5 bg-[#3b82f6] hover:bg-[#60a5fa] text-[#080b0e] font-bold text-xs flex items-center">Go to workspaces</Link>
              <Link to="/workspace/sample/shophub" className="h-10 px-5 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-[#f4f4f6] text-xs font-medium flex items-center">Explore a sample workspace</Link>
            </div>
          </section>
        ) : selectedProject && !loadingSnapshots && !loadError && allCommits.length === 0 ? (
          <section className="bg-[#11161b] border border-dashed border-[#242527] p-10 text-center" role="status">
            <h3 className="text-lg font-bold text-[#f4f4f6] mb-2">{selectedProject.status === 'ANALYZING' ? 'Mining is still running' : 'No mined commits'}</h3>
            <p className="text-sm text-[#94a3b8] max-w-md mx-auto mb-6">{selectedProject.status === 'ANALYZING' ? 'The first commits appear here as soon as their analysis is stored. Come back in a moment.' : 'This workspace has no stored commits. Mine part of its history from the Workspaces page.'}</p>
            <Link to="/projects" className="inline-flex h-10 px-5 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-[#f4f4f6] text-xs font-medium items-center">Go to workspaces</Link>
          </section>
        ) : allCommits.length > 0 && commits.length === 0 ? (
          <p role="status" className="bg-[#11161b] border border-[#242527] p-6 text-sm text-[#94a3b8]">No commits match this search on this branch.</p>
        ) : currentCommit && (
        /* MAIN CONTENT SPLIT */
        <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
          
          {/* LEFT: TIMELINE & GRAPH (70%) */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            
            {/* HORIZONTAL TIMELINE */}
            <div className="bg-[#11161b] border border-[#242527] p-6 relative shrink-0 overflow-x-auto">
              <div className="absolute top-[45px] left-12 right-12 h-[2px] bg-[#242527]"></div>
              
              <div className="flex min-w-[580px] items-center justify-between relative z-10 px-6">
                {pagination.items.map((commit, i) => {
                  const isActive = activeCommit === commit.hash;
                  // Connecting line progress
                  const isPast = commits.findIndex(c => c.hash === activeCommit) >= (pagination.current - 1) * pagination.pageSize + i;
                  
                  return (
                    <div 
                      key={commit.hash}
                      className="flex flex-col items-center gap-3 cursor-pointer group relative"
                      role="button"
                      tabIndex={0}
                      aria-pressed={isActive}
                      aria-label={`View revision ${commit.hash}: ${commit.title}`}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveCommit(commit.hash); } }}
                      onClick={() => setActiveCommit(commit.hash)}
                    >
                      <div className="text-[10px] font-mono text-[#94a3b8] font-bold group-hover:text-[#f4f4f6] transition-colors"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{commit.version}</div>
                      
                      <div className={`w-4 h-4 rounded-full border-4 transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300 flex items-center justify-center ${
                        isActive 
                          ? 'bg-[#3b82f6] border-[#080b0e] scale-125 shadow-[0_0_12px_#3b82f6]' 
                          : isPast 
                            ? 'bg-[#3b82f6] border-[#11161b] group-hover:scale-110' 
                            : 'bg-[#242527] border-[#11161b] group-hover:bg-[#5f636b]'
                      }`}></div>
                      
                      <div className={`text-xs font-mono transition-colors flex items-center gap-1 ${
                        isActive ? 'text-[#3b82f6] font-bold' : 'text-[#94a3b8]'
                      }`}>
                        <GitCommit size={12} />
                        {commit.hash}
                      </div>

                      {/* Tooltip on hover */}
                      <div className="absolute top-16 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 text-center bg-[#161d24] border border-[#242527] p-2 shadow-2xl z-20">
                         <div className="text-xs text-[#f4f4f6] font-bold mb-1 truncate">{commit.title}</div>
                         <div className="text-[10px] font-mono text-[#ffb03a]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{commit.archChanges} Arch Changes</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <PaginationBar {...pagination} />
            {/* ARCHITECTURE SVG SNAPSHOT */}
            <div className="flex-1 bg-[#080b0e] border border-[#242527] overflow-hidden relative shadow-2xl flex flex-col">
              
              {/* Overlay Indicators */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                <div className="px-2 py-1 bg-[#161d24]/80 backdrop-blur-sm border border-[#242527] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse motion-reduce:animate-none"></div>
                  <span className="text-[10px] font-mono text-[#3b82f6] uppercase tracking-wider font-bold"
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
              <div className="relative w-full h-[420px]">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                
                <svg viewBox="0 0 800 560" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
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

                  {/* Entire graph shifted down to clear the legend overlay in the top-left corner */}
                  <g transform="translate(0, 60)">

                  {/* LINES */}
                  <g fill="none" strokeWidth="2" opacity="0.6">
                     {/* Dynamic lines */}
                     {currentCommit?.edges?.length > 0 ? currentCommit.edges.map((edge: any, i: number) => {
                       // Find source and target node index
                       const srcIdx = currentCommit.nodes.findIndex((n: any) => n.id === edge.source);
                       const tgtIdx = currentCommit.nodes.findIndex((n: any) => n.id === edge.target);
                       if (srcIdx === -1 || tgtIdx === -1) return null;
                       
                       const angleSrc = (srcIdx / currentCommit.nodes.length) * Math.PI * 2;
                       const cxSrc = 400 + Math.cos(angleSrc) * 150;
                       const cySrc = 250 + Math.sin(angleSrc) * 150;

                       const angleTgt = (tgtIdx / currentCommit.nodes.length) * Math.PI * 2;
                       const cxTgt = 400 + Math.cos(angleTgt) * 150;
                       const cyTgt = 250 + Math.sin(angleTgt) * 150;

                       return (
                         <path 
                           key={i} 
                           d={`M ${cxSrc} ${cySrc} L ${cxTgt} ${cyTgt}`} 
                           stroke="#3b82f6" 
                           strokeDasharray={edge.type === 'imports' ? '4 4' : 'none'}
                         />
                       );
                     }) : null}
                  </g>

                  {/* NODES */}
                  <g>
                    {currentCommit?.nodes?.length > 0 ? currentCommit.nodes.map((node: any, idx: number) => {
                       // Layout dynamically in a circle
                       const angle = (idx / currentCommit.nodes.length) * Math.PI * 2;
                       const cx = 400 + Math.cos(angle) * 150;
                       const cy = 250 + Math.sin(angle) * 150;
                       return (
                         <g key={node.id} transform={`translate(${cx - 80}, ${cy - 20})`}>
                            <rect width="160" height="40" rx="4" fill="#161d24" stroke="#3b82f6" strokeWidth="2" opacity="0.8" />
                            <circle cx="20" cy="20" r="4" fill="#3b82f6" />
                            <text x="35" y="24" fill="#f4f4f6" fontSize="10" fontFamily="monospace" fontWeight="bold">
                              {node.name.length > 15 ? node.name.substring(0,15) + '...' : node.name}
                            </text>
                         </g>
                       );
                    }) : (
                      <text x="400" y="200" fill="#94a3b8" fontSize="14" textAnchor="middle">This commit has no recorded modules.</text>
                    )}
                  </g>

                  </g>
                </svg>
              </div>
            </div>

          </div>

          {/* RIGHT: REVISION DETAILS (30%) */}
          <div className="w-full xl:w-80 shrink-0 flex flex-col gap-6">
            
            <div className="bg-[#11161b] border border-[#242527] overflow-hidden flex flex-col h-full">
              {/* Header */}
              <div className="p-5 border-b border-[#242527] bg-[#161d24]">
                <div className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Selected Revision</div>
                <div className="flex items-center gap-2 mb-3">
                  <GitCommit size={18} className="text-[#3b82f6]" />
                  <span className="text-xl font-mono font-bold text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{currentCommit?.hash}</span>
                </div>
                <h3 className="text-sm font-bold text-[#f4f4f6] leading-snug">
                  {currentCommit?.title}
                </h3>
              </div>

              {/* Scrollable details */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
                
                {/* Meta */}
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider flex items-center gap-1.5 mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <User size={12} /> Author
                    </div>
                    <div className="text-xs text-[#f4f4f6]">{currentCommit?.author}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider flex items-center gap-1.5 mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <Calendar size={12} /> Date
                    </div>
                    <div className="text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{currentCommit?.date}</div>
                  </div>
                </div>

                <div className="h-[1px] w-full bg-[#242527]"></div>

                {/* Change Indicators */}
                <div>
                  <div className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider flex items-center gap-1.5 mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    <Layers size={12} /> Architectural Changes
                  </div>
                  
                  {currentCommit?.archChanges > 0 ? (
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
                        <div className="bg-[#161d24] border border-[#242527] p-3">
                          <div className="text-[10px] font-mono text-[#94a3b8] mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies</div>
                          <div className="text-sm font-mono text-[#22c55e] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>+{currentCommit?.depAdded}</div>
                        </div>
                        <div className="bg-[#161d24] border border-[#242527] p-3">
                          <div className="text-[10px] font-mono text-[#94a3b8] mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Removed</div>
                          <div className="text-sm font-mono text-[#ef4444] font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>-{currentCommit?.depRemoved}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-[#94a3b8] italic bg-[#161d24] p-3 border border-[#242527]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      No major structural changes detected.
                    </div>
                  )}
                </div>

                <div className="h-[1px] w-full bg-[#242527]"></div>

                {/* File metrics */}
                <div>
                  <div className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider flex items-center gap-1.5 mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    <FileText size={12} /> Files Changed
                  </div>
                  <div className="text-lg font-mono font-bold text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{currentCommit?.files}</div>
                </div>

              </div>

              {/* Action Button */}
              <div className="p-5 border-t border-[#242527] bg-[#080b0e]">
                <Link to={`/evidence?projectId=${encodeURIComponent(selectedProjectId || '')}&commit=${encodeURIComponent(currentCommit?.hash || '')}`} className="w-full h-10 bg-[#ffb03a]/10 hover:bg-[#ffb03a]/20 border border-[#ffb03a]/50 text-[#ffb03a] font-bold text-xs transition-colors flex items-center justify-center gap-2">
                  <GitMerge size={16} />
                  VIEW EVIDENCE
                </Link>
              </div>
            </div>

          </div>
          
        </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ArchitectureHistory;
