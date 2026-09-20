import React, { useState } from 'react';
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

const Projects: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
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
        { cx: 20, cy: 30, r: 4, color: '#1687FF' },
        { cx: 50, cy: 20, r: 4, color: '#1687FF' },
        { cx: 50, cy: 40, r: 4, color: '#FFB020', glow: true },
        { cx: 80, cy: 30, r: 4, color: '#19C8F3' },
      ],
      links: [
        { d: "M 20 30 C 35 30, 35 20, 50 20", color: "#1687FF" },
        { d: "M 20 30 C 35 30, 35 40, 50 40", color: "#1687FF" },
        { d: "M 50 20 C 65 20, 65 30, 80 30", color: "#1687FF" },
        { d: "M 50 40 C 65 40, 65 30, 80 30", color: "#FFB020" },
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
        { cx: 20, cy: 30, r: 4, color: '#1687FF' },
        { cx: 50, cy: 30, r: 4, color: '#1687FF' },
        { cx: 80, cy: 15, r: 4, color: '#FFB020', glow: true },
        { cx: 80, cy: 45, r: 4, color: '#19C8F3' },
      ],
      links: [
        { d: "M 20 30 L 50 30", color: "#1687FF" },
        { d: "M 50 30 C 65 30, 65 15, 80 15", color: "#FFB020" },
        { d: "M 50 30 C 65 30, 65 45, 80 45", color: "#1687FF" },
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
        { cx: 30, cy: 20, r: 4, color: '#1687FF' },
        { cx: 30, cy: 40, r: 4, color: '#1687FF' },
        { cx: 70, cy: 30, r: 4, color: '#19C8F3' },
      ],
      links: [
        { d: "M 30 20 C 50 20, 50 30, 70 30", color: "#1687FF" },
        { d: "M 30 40 C 50 40, 50 30, 70 30", color: "#1687FF" },
      ]
    }
  ];

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10 relative">
        
        {/* HEADER */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E151D] border border-[#1A2A37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
            <span className="text-[10px] font-mono text-[#19C8F3] tracking-wider font-semibold uppercase">Project Workspace</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#F4F7FA] mb-2">Projects</h2>
              <p className="text-[#8A98A8] text-sm max-w-xl leading-relaxed">
                Explore and analyze the software systems connected to your ArchTime workspace.
              </p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 h-10 px-5 bg-[#19C8F3] hover:bg-[#19C8F3]/90 text-[#070A0F] font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(25,200,243,0.15)]"
            >
              <Plus size={16} />
              NEW PROJECT
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#1A2A37] to-transparent mt-8"></div>
        </div>

        {/* PROJECT SUMMARY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="flex items-center gap-4 bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-[#070A0F] border border-[#1A2A37] flex items-center justify-center">
              <FolderKanban size={20} className="text-[#8A98A8]" />
            </div>
            <div>
              <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase mb-1">Total Projects</h4>
              <div className="text-2xl font-bold text-[#F4F7FA] font-mono">03</div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-[#070A0F] border border-[#1A2A37] flex items-center justify-center">
              <Activity size={20} className="text-[#19C8F3]" />
            </div>
            <div>
              <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase mb-1">Active Analyses</h4>
              <div className="text-2xl font-bold text-[#F4F7FA] font-mono">02</div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#0E151D] border border-[#1A2A37] p-5 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-[#070A0F] border border-[#1A2A37] flex items-center justify-center">
              <GitPullRequest size={20} className="text-[#FFB020]" />
            </div>
            <div>
              <h4 className="text-[10px] font-mono font-semibold text-[#566575] tracking-widest uppercase mb-1">Architectural Changes</h4>
              <div className="text-2xl font-bold text-[#F4F7FA] font-mono">64</div>
            </div>
          </div>

        </div>

        {/* PROJECT LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-[#0B1017] border border-[#1A2A37] hover:border-[#19C8F3]/50 rounded-xl overflow-hidden transition-colors flex flex-col group">
              
              {/* SVG GRAPH PREVIEW */}
              <div className="h-32 w-full bg-[#070A0F] border-b border-[#1A2A37] relative flex items-center justify-center overflow-hidden">
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
                  <h3 className="text-[#F4F7FA] font-bold text-lg tracking-tight group-hover:text-[#19C8F3] transition-colors">{project.name}</h3>
                </div>
                
                <p className="text-[#8A98A8] text-sm mb-6 line-clamp-2 leading-relaxed flex-1">
                  {project.description}
                </p>
                
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 mb-6">
                  <div>
                    <div className="text-[10px] font-mono text-[#566575] uppercase tracking-wider mb-1">Repositories</div>
                    <div className="text-[#F4F7FA] text-sm font-mono flex items-center gap-1.5">
                      <FolderGit2 size={14} className="text-[#8A98A8]" />
                      {project.repos}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#566575] uppercase tracking-wider mb-1">Last Analyzed</div>
                    <div className="text-[#F4F7FA] text-sm font-mono flex items-center gap-1.5">
                      <Activity size={14} className="text-[#8A98A8]" />
                      {project.lastAnalyzed}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#566575] uppercase tracking-wider mb-1">Arch Changes</div>
                    <div className="text-[#FFB020] text-sm font-mono font-bold flex items-center gap-1.5">
                      <GitCommit size={14} />
                      {project.changes}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#566575] uppercase tracking-wider mb-1">Analysis Status</div>
                    <div className="text-[#20C997] text-[11px] font-mono font-bold flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#20C997]"></div>
                      {project.status}
                    </div>
                  </div>
                </div>
                
                <button className="w-full h-10 bg-[#0E151D] hover:bg-[#1A2A37] border border-[#1A2A37] group-hover:border-[#19C8F3]/50 text-[#F4F7FA] group-hover:text-[#19C8F3] font-mono font-bold text-xs rounded transition-colors flex items-center justify-center gap-2 mt-auto">
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
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-[#070A0F]/80 backdrop-blur-sm"
            ></motion.div>
            
            {/* Modal Dialog */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-[#0B1017] border border-[#1A2A37] rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[#1A2A37] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] shadow-[0_0_5px_#19C8F3]"></div>
                  <h2 className="text-[#F4F7FA] font-bold tracking-tight uppercase text-sm font-mono tracking-widest">Create Project</h2>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-[#566575] hover:text-[#F4F7FA] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-wider block">Project Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Identity Service"
                    className="w-full h-10 bg-[#0E151D] border border-[#1A2A37] rounded-md px-3 text-sm text-[#F4F7FA] placeholder:text-[#566575] focus:outline-none focus:border-[#19C8F3]/50 focus:ring-1 focus:ring-[#19C8F3]/20 transition-all"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-wider block">Description <span className="text-[#566575]">(Optional)</span></label>
                  <textarea 
                    placeholder="Brief architectural context..."
                    className="w-full h-20 bg-[#0E151D] border border-[#1A2A37] rounded-md px-3 py-2 text-sm text-[#F4F7FA] placeholder:text-[#566575] focus:outline-none focus:border-[#19C8F3]/50 focus:ring-1 focus:ring-[#19C8F3]/20 transition-all resize-none"
                  ></textarea>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-wider block">Repository Provider</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#0E151D] border border-[#1A2A37] rounded-md cursor-pointer hover:border-[#8A98A8] transition-colors has-[:checked]:border-[#19C8F3] has-[:checked]:bg-[#19C8F3]/5 group">
                      <input type="radio" name="provider" className="sr-only" defaultChecked />
                      <Icon icon="mdi:github" width="18" height="18" className="text-[#F4F7FA] group-has-[:checked]:text-[#19C8F3]" />
                      <span className="text-xs font-bold text-[#F4F7FA] group-has-[:checked]:text-[#19C8F3]">GitHub</span>
                    </label>
                    <label className="flex items-center justify-center gap-2 h-10 bg-[#0E151D] border border-[#1A2A37] rounded-md cursor-pointer hover:border-[#8A98A8] transition-colors has-[:checked]:border-[#19C8F3] has-[:checked]:bg-[#19C8F3]/5 group">
                      <input type="radio" name="provider" className="sr-only" />
                      <Icon icon="mdi:gitlab" width="18" height="18" className="text-[#FC6D26] group-has-[:checked]:text-[#19C8F3]" />
                      <span className="text-xs font-bold text-[#F4F7FA] group-has-[:checked]:text-[#19C8F3]">GitLab</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[#8A98A8] uppercase tracking-wider block">Repository URL</label>
                  <input 
                    type="text" 
                    placeholder="https://github.com/organization/repo"
                    className="w-full h-10 bg-[#0E151D] border border-[#1A2A37] rounded-md px-3 text-sm font-mono text-[#F4F7FA] placeholder:text-[#566575] focus:outline-none focus:border-[#19C8F3]/50 focus:ring-1 focus:ring-[#19C8F3]/20 transition-all"
                  />
                </div>
              </div>
              
              <div className="p-6 pt-0">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-full h-10 bg-[#19C8F3] hover:bg-[#19C8F3]/90 text-[#070A0F] font-bold text-xs rounded-md transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(25,200,243,0.15)]"
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
