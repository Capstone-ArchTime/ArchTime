import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  FolderKanban,
  Activity,
  GitPullRequest,
  Plus,
  ArrowRight,
  GitCommit,
  X,
  FolderGit2
} from 'lucide-react';
import { Icon } from '@iconify/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const Projects: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const modalRef = useFocusTrap(isModalOpen, closeModal);
  
  // Hardcoded projects data based on user spec
  const projects = [
    {
      id: 1,
      name: 'E-Commerce Platform',
      description: 'Cloud-native multi-tenant commerce engine.',
      repos: 4,
      lastAnalyzed: '2 hours ago',
      changes: 38,
      status: 'COMPLETED',
      nodes: [
        { cx: 20, cy: 30, r: 4, color: '#38bdf8' },
        { cx: 50, cy: 20, r: 4, color: '#38bdf8' },
        { cx: 50, cy: 40, r: 4, color: '#ffb03a', glow: true },
        { cx: 80, cy: 30, r: 4, color: '#38bdf8' },
      ],
      links: [
        { d: "M 20 30 C 35 30, 35 20, 50 20", color: "#38bdf8" },
        { d: "M 20 30 C 35 30, 35 40, 50 40", color: "#38bdf8" },
        { d: "M 50 20 C 65 20, 65 30, 80 30", color: "#38bdf8" },
        { d: "M 50 40 C 65 40, 65 30, 80 30", color: "#ffb03a" },
      ]
    },
    {
      id: 2,
      name: 'Payment Platform',
      description: 'High-throughput payment gateway.',
      repos: 2,
      lastAnalyzed: 'Yesterday',
      changes: 21,
      status: 'COMPLETED',
      nodes: [
        { cx: 20, cy: 30, r: 4, color: '#38bdf8' },
        { cx: 50, cy: 30, r: 4, color: '#38bdf8' },
        { cx: 80, cy: 15, r: 4, color: '#ffb03a', glow: true },
        { cx: 80, cy: 45, r: 4, color: '#38bdf8' },
      ],
      links: [
        { d: "M 20 30 L 50 30", color: "#38bdf8" },
        { d: "M 50 30 C 65 30, 65 15, 80 15", color: "#ffb03a" },
        { d: "M 50 30 C 65 30, 65 45, 80 45", color: "#38bdf8" },
      ]
    },
    {
      id: 3,
      name: 'Healthcare Connect',
      description: 'Healthcare integration platform.',
      repos: 3,
      lastAnalyzed: '3 days ago',
      changes: 15,
      status: 'COMPLETED',
      nodes: [
        { cx: 30, cy: 20, r: 4, color: '#38bdf8' },
        { cx: 30, cy: 40, r: 4, color: '#38bdf8' },
        { cx: 70, cy: 30, r: 4, color: '#38bdf8' },
      ],
      links: [
        { d: "M 30 20 C 50 20, 50 30, 70 30", color: "#38bdf8" },
        { d: "M 30 40 C 50 40, 50 30, 70 30", color: "#38bdf8" },
      ]
    }
  ];

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10 relative">
        
        {/* HEADER */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#222c37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
            <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Project Workspace</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Projects</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Explore and analyze the software systems connected to your ArchTime workspace.
              </p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 h-10 px-5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.15)]"
            >
              <Plus size={16} />
              NEW PROJECT
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* PROJECT SUMMARY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="flex items-center gap-4 bg-[#161d24] border border-[#222c37] p-5">
            <div className="w-12 h-12 bg-[#080b0e] border border-[#222c37] flex items-center justify-center">
              <FolderKanban size={20} className="text-[#94a3b8]" />
            </div>
            <div>
              <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Total Projects</h4>
              <div className="text-2xl font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>03</div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#161d24] border border-[#222c37] p-5">
            <div className="w-12 h-12 bg-[#080b0e] border border-[#222c37] flex items-center justify-center">
              <Activity size={20} className="text-[#38bdf8]" />
            </div>
            <div>
              <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Active Analyses</h4>
              <div className="text-2xl font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>02</div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#161d24] border border-[#222c37] p-5">
            <div className="w-12 h-12 bg-[#080b0e] border border-[#222c37] flex items-center justify-center">
              <GitPullRequest size={20} className="text-[#ffb03a]" />
            </div>
            <div>
              <h4 className="text-[10px] font-mono font-semibold text-[#5f636b] tracking-widest uppercase mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architectural Changes</h4>
              <div className="text-2xl font-bold text-[#f4f4f6] font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>64</div>
            </div>
          </div>

        </div>

        {/* PROJECT LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-[#11161b] border border-[#222c37] hover:border-[#38bdf8]/50 overflow-hidden transition-colors flex flex-col group">
              
              {/* SVG GRAPH PREVIEW */}
              <div className="h-32 w-full bg-[#080b0e] border-b border-[#222c37] relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#F5F7FA 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                
                <svg viewBox="0 0 100 60" className="w-full h-full opacity-70 group-hover:opacity-100 transition-opacity group-hover:scale-105 duration-500">
                  <defs>
                    <filter id="glow-amber-mini" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  
                  <g fill="none" strokeWidth="1" opacity="0.6">
                    {project.links.map((link, i) => (
                      <path key={i} d={link.d} stroke={link.color} />
                    ))}
                  </g>
                  
                  <g>
                    {project.nodes.map((node, i) => (
                      <circle 
                        key={i} 
                        cx={node.cx} 
                        cy={node.cy} 
                        r={node.r} 
                        fill={node.color} 
                        filter={node.glow ? "url(#glow-amber-mini)" : undefined} 
                      />
                    ))}
                  </g>
                </svg>
              </div>

              {/* CARD CONTENT */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-[#f4f4f6] font-bold text-lg tracking-tight group-hover:text-[#38bdf8] transition-colors">{project.name}</h3>
                </div>
                
                <p className="text-[#94a3b8] text-sm mb-6 line-clamp-2 leading-relaxed flex-1">
                  {project.description}
                </p>
                
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 mb-6">
                  <div>
                    <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repositories</div>
                    <div className="text-[#f4f4f6] text-sm font-mono flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <FolderGit2 size={14} className="text-[#94a3b8]" />
                      {project.repos}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Last Analyzed</div>
                    <div className="text-[#f4f4f6] text-sm font-mono flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <Activity size={14} className="text-[#94a3b8]" />
                      {project.lastAnalyzed}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Arch Changes</div>
                    <div className="text-[#ffb03a] text-sm font-mono font-bold flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <GitCommit size={14} />
                      {project.changes}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#5f636b] uppercase tracking-wider mb-1"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Analysis Status</div>
                    <div className="text-[#22c55e] text-[11px] font-mono font-bold flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></div>
                      {project.status}
                    </div>
                  </div>
                </div>
                
                <button className="w-full h-10 bg-[#161d24] hover:bg-[#222c37] border border-[#222c37] group-hover:border-[#38bdf8]/50 text-[#f4f4f6] group-hover:text-[#38bdf8] font-mono font-bold text-xs transition-colors flex items-center justify-center gap-2 mt-auto"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  OPEN PROJECT <ArrowRight size={14} />
                </button>
              </div>
              
            </div>
          ))}
        </div>

        {/* BOTTOM PADDING */}
        <div className="h-10"></div>
        
      </div>

      {/* NEW PROJECT MODAL OVERLAY */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-[#080b0e]/80 backdrop-blur-sm"
            ></motion.div>

            {/* Modal Dialog */}
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-project-title"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-[#11161b] border border-[#222c37] shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[#222c37] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
                  <h2 id="create-project-title" className="text-[#f4f4f6] font-bold tracking-tight uppercase text-sm font-mono tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Create Project</h2>
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close dialog"
                  className="text-[#5f636b] hover:text-[#f4f4f6] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label htmlFor="project-name" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Project Name</label>
                  <input
                    id="project-name"
                    type="text"
                    placeholder="e.g. Identity Service"
                    className="w-full h-10 bg-[#161d24] border border-[#222c37] px-3 text-sm text-[#f4f4f6] placeholder:text-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 focus:ring-1 focus:ring-[#38bdf8]/20 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-description" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Description <span className="text-[#5f636b]">(Optional)</span></label>
                  <textarea
                    id="project-description"
                    placeholder="Brief architectural context..."
                    className="w-full h-20 bg-[#161d24] border border-[#222c37] px-3 py-2 text-sm text-[#f4f4f6] placeholder:text-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 focus:ring-1 focus:ring-[#38bdf8]/20 transition-all resize-none"
                  ></textarea>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository Provider</span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#161d24] border border-[#222c37] cursor-pointer hover:border-[#94a3b8] transition-colors has-[:checked]:border-[#38bdf8] has-[:checked]:bg-[#38bdf8]/5 group">
                      <input type="radio" name="provider" className="sr-only" defaultChecked />
                      <Icon icon="mdi:github" width="18" height="18" className="text-[#f4f4f6] group-has-[:checked]:text-[#38bdf8]" />
                      <span className="text-xs font-bold text-[#f4f4f6] group-has-[:checked]:text-[#38bdf8]">GitHub</span>
                    </label>
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#161d24] border border-[#222c37] cursor-pointer hover:border-[#94a3b8] transition-colors has-[:checked]:border-[#38bdf8] has-[:checked]:bg-[#38bdf8]/5 group">
                      <input type="radio" name="provider" className="sr-only" />
                      <Icon icon="mdi:gitlab" width="18" height="18" className="text-[#FC6D26] group-has-[:checked]:text-[#38bdf8]" />
                      <span className="text-xs font-bold text-[#f4f4f6] group-has-[:checked]:text-[#38bdf8]">GitLab</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="repository-url" className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository URL</label>
                  <input
                    id="repository-url"
                    type="text"
                    placeholder="https://github.com/organization/repo"
                    className="w-full h-10 bg-[#161d24] border border-[#222c37] px-3 text-sm font-mono text-[#f4f4f6] placeholder:text-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 focus:ring-1 focus:ring-[#38bdf8]/20 transition-all"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  />
                </div>
              </div>

              <div className="p-6 pt-0">
                <button
                  onClick={closeModal}
                  className="w-full h-10 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.15)]"
                >
                  <FolderGit2 size={16} />
                  CONNECT REPOSITORY
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </DashboardLayout>
  );
};

export default Projects;
