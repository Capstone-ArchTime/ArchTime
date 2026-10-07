import { readTokens } from '@/auth/session';
import SampleDataNotice from '@/components/SampleDataNotice';
import { Link, useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  GitCommit,
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  FileDiff,
  Download,
  FolderKanban
} from 'lucide-react';

import { API_BASE_URL } from '@/auth/session';
import { App } from 'antd';

const Compare: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [baseId, setBaseId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [compareData, setCompareData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = readTokens().accessToken;
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
    const fetchSnapshots = async () => {
      try {
        const token = readTokens().accessToken;
        const res = await fetch(`${API_BASE_URL}/projects/${selectedProjectId}/snapshots`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const sList = data.data?.snapshots || [];
          setSnapshots(sList);
          if (sList.length >= 2) {
            setBaseId(sList[sList.length - 1].id); // Oldest as base
            setTargetId(sList[0].id); // Newest as target
          } else if (sList.length === 1) {
            setBaseId(sList[0].id);
            setTargetId(sList[0].id);
          } else {
            setBaseId('');
            setTargetId('');
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchSnapshots();
  }, [selectedProjectId]);

  const handleCompare = async () => {
    if (!selectedProjectId || !baseId || !targetId) {
      message.warning('Please select a project and two revisions to compare.');
      return;
    }
    setLoading(true);
    try {
      const token = readTokens().accessToken;
      const res = await fetch(`${API_BASE_URL}/projects/${selectedProjectId}/snapshots/compare?baseId=${baseId}&targetId=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCompareData(data.data);
      } else {
        message.error('Failed to compare revisions.');
      }
    } catch (e) {
      message.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getBaseSnapshot = () => snapshots.find(s => s.id === baseId);
  const getTargetSnapshot = () => snapshots.find(s => s.id === targetId);

  const renderGraph = (snapshot: any, isTarget: boolean = false) => {
    if (!snapshot || !snapshot.nodes || snapshot.nodes.length === 0) {
      return (
        <g>
          <text x="250" y="200" fill="#5f636b" fontSize="14" textAnchor="middle" fontFamily="sans-serif">
            Không có dữ liệu kiến trúc
          </text>
          <text x="250" y="220" fill="#5f636b" fontSize="12" textAnchor="middle" fontFamily="sans-serif">
            (Bản chụp này không chứa module/component nào)
          </text>
        </g>
      );
    }
    return (
      <g>
        {/* Edges */}
        <g fill="none" strokeWidth="2" opacity="0.6">
          {snapshot.edges.map((edge: any, i: number) => {
             const srcIdx = snapshot.nodes.findIndex((n: any) => n.id === edge.source);
             const tgtIdx = snapshot.nodes.findIndex((n: any) => n.id === edge.target);
             if (srcIdx === -1 || tgtIdx === -1) return null;
             const angleSrc = (srcIdx / snapshot.nodes.length) * Math.PI * 2;
             const cxSrc = 250 + Math.cos(angleSrc) * 120;
             const cySrc = 180 + Math.sin(angleSrc) * 120;
             const angleTgt = (tgtIdx / snapshot.nodes.length) * Math.PI * 2;
             const cxTgt = 250 + Math.cos(angleTgt) * 120;
             const cyTgt = 180 + Math.sin(angleTgt) * 120;

             // Color coding for target graph
             let strokeColor = "#38bdf8"; // default cyan
             let strokeWidth = 2;
             if (isTarget && compareData?.diff) {
               const isAdded = compareData.diff.edgesAdded.find((e: any) => e.source === edge.source && e.target === edge.target);
               if (isAdded) {
                 strokeColor = "#22c55e"; // green for added
                 strokeWidth = 3;
               }
             }

             return (
               <path 
                 key={i} 
                 d={`M ${cxSrc} ${cySrc} L ${cxTgt} ${cyTgt}`} 
                 stroke={strokeColor} 
                 strokeWidth={strokeWidth}
                 strokeDasharray={edge.type === 'imports' ? '4 4' : 'none'}
               />
             );
          })}
        </g>
        {/* Nodes */}
        <g>
          {snapshot.nodes.map((node: any, idx: number) => {
             const angle = (idx / snapshot.nodes.length) * Math.PI * 2;
             const cx = 250 + Math.cos(angle) * 120;
             const cy = 180 + Math.sin(angle) * 120;

             // Color coding
             let borderColor = "#38bdf8";
             let fillColor = "#38bdf8";
             if (isTarget && compareData?.diff) {
               const isAdded = compareData.diff.nodesAdded.find((n: any) => n.id === node.id);
               if (isAdded) {
                 borderColor = "#22c55e";
                 fillColor = "#22c55e";
               }
             } else if (!isTarget && compareData?.diff) {
               const isRemoved = compareData.diff.nodesRemoved.find((n: any) => n.id === node.id);
               if (isRemoved) {
                 borderColor = "#ef4444";
                 fillColor = "#ef4444";
               }
             }

             return (
               <g key={node.id} transform={`translate(${cx - 70}, ${cy - 20})`}>
                  <rect width="140" height="40" rx="4" fill="#161d24" stroke={borderColor} strokeWidth="2" opacity="0.8" />
                  <circle cx="20" cy="20" r="4" fill={fillColor} />
                  <text x="35" y="24" fill="#f4f4f6" fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {node.name.length > 13 ? node.name.substring(0,13) + '...' : node.name}
                  </text>
               </g>
             );
          })}
        </g>
      </g>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 flex flex-col min-h-0">
        {!compareData && <SampleDataNotice />}
        
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
          
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-4"></div>
        </div>

        {/* REVISION SELECTORS */}
        <div className="flex flex-col md:flex-row items-stretch gap-4 shrink-0">
          
          {/* BASE REVISION */}
          <div className="flex-1 bg-[#11161b] border border-[#222c37] p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[#94a3b8]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Base Revision</h3>
            <div className="flex items-center gap-4 relative z-10">
              <select 
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                className="bg-[#080b0e] border border-[#222c37] text-lg font-bold text-[#f4f4f6] p-2 outline-none w-full max-w-[250px]"
              >
                {snapshots.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.version || s.hash.substring(0, 7)} ({new Date(s.date).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            {getBaseSnapshot() && (
              <div className="mt-3 text-xs text-[#94a3b8]">
                {getBaseSnapshot()?.title}
              </div>
            )}
          </div>

          {/* ARROW & COMPARE BUTTON */}
          <div className="flex flex-col justify-center items-center px-4 gap-2">
            <div className="w-10 h-10 rounded-full bg-[#161d24] border border-[#222c37] flex items-center justify-center text-[#94a3b8]">
              <ArrowRightLeft size={18} />
            </div>
            <button 
              onClick={handleCompare}
              disabled={loading}
              className="px-4 py-1.5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-[10px] tracking-wider transition-colors shadow-[0_0_10px_rgba(56,189,248,0.15)] uppercase disabled:opacity-50"
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {/* TARGET REVISION */}
          <div className="flex-1 bg-[#11161b] border border-[#222c37] p-5 relative overflow-hidden group border-r-2 border-r-[#38bdf8]/50">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[#38bdf8]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[#38bdf8] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Target Revision</h3>
            <div className="flex items-center gap-4 relative z-10">
              <select 
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="bg-[#080b0e] border border-[#222c37] text-lg font-bold text-[#f4f4f6] p-2 outline-none w-full max-w-[250px]"
              >
                {snapshots.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.version || s.hash.substring(0, 7)} ({new Date(s.date).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            {getTargetSnapshot() && (
              <div className="mt-3 text-xs text-[#94a3b8]">
                {getTargetSnapshot()?.title}
              </div>
            )}
          </div>
          
        </div>

        {/* SUMMARY METRICS */}
        {compareData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            <div className="bg-[#161d24] border border-[#222c37] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Modules</h4>
              <div className="text-xl font-bold font-mono flex items-center gap-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                <span className="text-[#22c55e]">+{compareData.diff.nodesAdded.length}</span>
                <span className="text-[#94a3b8]">/</span>
                <span className="text-[#ef4444]">-{compareData.diff.nodesRemoved.length}</span>
              </div>
            </div>
            
            <div className="bg-[#161d24] border border-[#222c37] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies</h4>
              <div className="flex items-center gap-2 text-xl font-bold font-mono"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                <span className="text-[#22c55e]">+{compareData.diff.edgesAdded.length}</span>
                <span className="text-[#94a3b8]">/</span>
                <span className="text-[#ef4444]">-{compareData.diff.edgesRemoved.length}</span>
              </div>
            </div>

            <div className="bg-[#161d24] border border-[#222c37] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</h4>
              <div className="text-xl font-bold text-[#f4f4f6] flex items-center gap-2">
                {compareData.targetSnapshot.files} <span className="text-xs font-sans text-[#94a3b8] font-normal">total in target</span>
              </div>
            </div>

            <div className="bg-[#161d24] border border-[#ffb03a]/30 p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute inset-0 bg-[#ffb03a]/5 pointer-events-none"></div>
              <h4 className="text-[10px] font-mono font-semibold text-[#ffb03a] tracking-widest uppercase mb-2 z-10"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Arch Changes</h4>
              <div className="text-xl font-bold font-mono text-[#ffb03a] flex items-center gap-1 z-10"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {compareData.diff.nodesAdded.length + compareData.diff.nodesRemoved.length + compareData.diff.edgesAdded.length + compareData.diff.edgesRemoved.length > 0 ? 'Detected' : 'None'}
              </div>
            </div>
          </div>
        )}

        {/* SIDE-BY-SIDE GRAPH CONTAINER */}
        <div className="flex flex-col lg:flex-row gap-6 shrink-0 min-h-[450px]">
          
          {/* LEFT: BEFORE GRAPH */}
          <div className="flex-1 flex flex-col bg-[#080b0e] border border-[#222c37] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[#222c37] bg-[#080b0e] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#5f636b]"></div>
                <span className="text-xs font-bold text-[#f4f4f6] tracking-wide uppercase">Before</span>
              </div>
              <div className="text-[10px] font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{getBaseSnapshot()?.version || getBaseSnapshot()?.hash.substring(0, 7) || 'Select Base'}</div>
            </div>
            
            <div className="relative w-full h-[360px]">
               <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
               <svg viewBox="0 0 500 400" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
                 {compareData ? renderGraph(compareData.baseSnapshot, false) : (
                   <g fill="none" strokeWidth="2" opacity="0.2">
                     <path d="M 250 150 L 250 250" stroke="#94a3b8" />
                   </g>
                 )}
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
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{getTargetSnapshot()?.version || getTargetSnapshot()?.hash.substring(0, 7) || 'Select Target'}</div>
            </div>
            
            <div className="relative w-full h-[360px]">
               <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
               <svg viewBox="0 0 500 440" className="w-full h-full absolute inset-0" preserveAspectRatio="xMidYMid meet">
                 {compareData ? renderGraph(compareData.targetSnapshot, true) : (
                   <g fill="none" strokeWidth="2" opacity="0.2">
                     <path d="M 250 150 L 250 250" stroke="#94a3b8" />
                   </g>
                 )}
               </svg>
            </div>
          </div>
          
        </div>

        {/* CHANGE LEGEND */}
        <div className="flex items-center justify-center gap-6 py-2">
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#22c55e] shadow-[0_0_5px_#22c55e]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Added</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#ef4444] shadow-[0_0_5px_#ef4444]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Removed</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
             <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Unchanged</span>
          </div>
        </div>

        {/* CHANGE LIST */}
        {compareData && (
          <div className="shrink-0 space-y-4">
            <h3 className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase mb-4 flex items-center gap-2">
              <FileDiff size={16} className="text-[#38bdf8]" />
              Detailed Change Log
            </h3>

            <div className="bg-[#11161b] border border-[#222c37] overflow-hidden divide-y divide-[#222c37]">
              
              {compareData.diff.nodesAdded.map((node: any) => (
                <div key={`na-${node.id}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e] text-[9px] font-mono font-bold uppercase tracking-widest"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Added</span>
                    </div>
                    <div className="text-sm font-bold text-[#f4f4f6] mb-1">{node.name}</div>
                    <p className="text-xs text-[#94a3b8]">New module introduced in the target revision. This component adds new functionality to the system architecture.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#94a3b8]">Impact</div>
                    <div className="text-sm font-mono text-[#22c55e]">+1 Component</div>
                  </div>
                </div>
              ))}
              
              {compareData.diff.nodesRemoved.map((node: any) => (
                <div key={`nr-${node.id}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] text-[9px] font-mono font-bold uppercase tracking-widest"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Removed</span>
                    </div>
                    <div className="text-sm font-bold text-[#f4f4f6] mb-1">{node.name}</div>
                    <p className="text-xs text-[#94a3b8]">Module was removed or refactored out of the architecture. Check if functionality was merged into other components.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#94a3b8]">Impact</div>
                    <div className="text-sm font-mono text-[#ef4444]">-1 Component</div>
                  </div>
                </div>
              ))}

              {compareData.diff.edgesAdded.map((edge: any, i: number) => {
                const src = compareData.targetSnapshot.nodes.find((n: any) => n.id === edge.source)?.name || edge.source;
                const tgt = compareData.targetSnapshot.nodes.find((n: any) => n.id === edge.target)?.name || edge.target;
                return (
                  <div key={`ea-${i}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-[#38bdf8]/10 border border-[#38bdf8]/20 text-[#38bdf8] text-[9px] font-mono font-bold uppercase tracking-widest"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependency Added</span>
                        <span className="px-2 py-0.5 bg-[#161d24] border border-[#222c37] text-[#94a3b8] text-[9px] font-mono"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>{edge.type || 'imports'}</span>
                      </div>
                      <div className="text-sm font-bold text-[#f4f4f6] mb-1 flex items-center gap-2">{src} <ArrowRight size={14} className="text-[#38bdf8]" /> {tgt}</div>
                      <p className="text-xs text-[#94a3b8]">New dependency relationship established. This may indicate coupling or integration between components.</p>
                    </div>
                  </div>
                );
              })}
              
              {compareData.diff.edgesRemoved.map((edge: any, i: number) => {
                const src = compareData.baseSnapshot.nodes.find((n: any) => n.id === edge.source)?.name || edge.source;
                const tgt = compareData.baseSnapshot.nodes.find((n: any) => n.id === edge.target)?.name || edge.target;
                return (
                  <div key={`er-${i}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#161d24]/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] text-[9px] font-mono font-bold uppercase tracking-widest"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependency Removed</span>
                        <span className="px-2 py-0.5 bg-[#161d24] border border-[#222c37] text-[#94a3b8] text-[9px] font-mono"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>{edge.type || 'imports'}</span>
                      </div>
                      <div className="text-sm font-bold text-[#f4f4f6] mb-1 flex items-center gap-2 line-through opacity-70">{src} <ArrowRight size={14} className="text-[#ef4444]" /> {tgt}</div>
                      <p className="text-xs text-[#94a3b8]">Dependency was removed. This may indicate decoupling or refactoring of module relationships.</p>
                    </div>
                  </div>
                );
              })}

            </div>
          </div>
        )}

        {/* BOTTOM CTA */}
        <div className="shrink-0 flex items-center justify-end gap-4 py-8">
           <Link to="/history" className="h-10 px-5 bg-transparent border border-[#222c37] hover:border-[#94a3b8] text-[#f4f4f6] font-bold text-xs transition-colors flex items-center gap-2">
              VIEW FULL HISTORY
           </Link>
           <Link to="/reports" className="h-10 px-5 bg-[#161d24] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.05)]">
              <Download size={16} />
              GENERATE REPORT
           </Link>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Compare;
