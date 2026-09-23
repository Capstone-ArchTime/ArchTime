import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  History,
  GitCompare,
  FileSearch,
  Sparkles,
  FileBarChart,
  User,
  Settings,
  Search,
  Bell,
  FileText,
  KeyRound,
  Activity,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const fontFamily = {
  sans: '"Space Grotesk", sans-serif',
  mono: '"JetBrains Mono", monospace',
};

const navItemsByRole = {
  'developer-analyst': [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/projects', label: 'Projects', icon: FolderKanban },
    { path: '/history', label: 'Architecture History', icon: History },
    { path: '/compare', label: 'Compare', icon: GitCompare },
    { path: '/evidence', label: 'Changes & Evidence', icon: FileSearch },
    { path: '/insights', label: 'AI Insights', icon: Sparkles },
    { path: '/reports', label: 'Reports', icon: FileBarChart },
  ],
  'project-maintainer': [
    { path: '/project-maintainer', label: 'Documentation', icon: LayoutDashboard },
    { path: '/project-maintainer/reports', label: 'Evolution Reports', icon: FileText },
  ],
  'system-administrator': [
    { path: '/system-administrator', label: 'Platform Health', icon: LayoutDashboard },
    { path: '/system-administrator/settings', label: 'Repository & Extraction Config', icon: KeyRound },
    { path: '/system-administrator/mining-jobs', label: 'Mining Jobs Monitor', icon: Activity },
  ],
} as const;

function resolveRole(pathname: string): keyof typeof navItemsByRole {
  if (pathname.startsWith('/project-maintainer')) return 'project-maintainer';
  if (pathname.startsWith('/system-administrator')) return 'system-administrator';
  return 'developer-analyst';
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const role = resolveRole(currentPath);
  const navItems = navItemsByRole[role];
  const homePath = navItems[0].path;

  return (
    <div
      className="flex h-screen bg-[#080b0e] text-[#f4f4f6] font-sans overflow-hidden selection:bg-[#38bdf8]/20 selection:text-[#38bdf8]"
      style={{ fontFamily: fontFamily.sans }}
    >

      {/* SIDEBAR */}
      <aside className="hidden md:flex flex-col w-60 bg-[#080b0e] border-r border-[#222c37] h-full shrink-0">
        
        {/* Branding */}
        <div className="p-6 pb-4">
          <Link to="/dashboard" className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-[#11161b] flex items-center justify-center border border-[#222c37] shadow-lg">
              <div className="w-4 h-4 relative">
                <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] absolute top-0 left-0 shadow-[0_0_8px_#38bdf8]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] absolute bottom-0 right-0"></div>
                <div className="w-[1px] h-2.5 bg-[#94a3b8]/50 rotate-45 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[#f4f4f6] leading-none">ArchTime</h1>
          </Link>
          <p className="text-[9px] text-[#38bdf8] font-mono tracking-widest uppercase ml-11 font-semibold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture Observatory</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-8 scrollbar-hide">
          
          {/* CORE NAVIGATION */}
          <div>
            <h3 className="text-[10px] font-mono font-semibold text-[#5f636b] uppercase tracking-wider px-3 mb-3"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Core Navigation</h3>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const IconComp = item.icon;
                const isActive = item.path === homePath
                  ? currentPath === item.path
                  : currentPath.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-all focus:outline-none ${
                      isActive 
                        ? 'bg-[#38bdf8]/10 text-[#f4f4f6] border-l-2 border-[#38bdf8] -ml-[2px] pl-[14px]' 
                        : 'text-[#94a3b8] hover:text-[#f4f4f6] hover:bg-[#11161b] border-l-2 border-transparent'
                    }`}
                  >
                    <IconComp size={16} className={isActive ? "text-[#38bdf8]" : "text-[#5f636b] group-hover:text-[#94a3b8]"} />
                    <span className={isActive ? "font-medium" : ""}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* RECENT PROJECTS */}
          <div>
            <h3 className="text-[10px] font-mono font-semibold text-[#5f636b] uppercase tracking-wider px-3 mb-3"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Recent Projects</h3>
            <div className="space-y-0.5">
              {['E-Commerce Platform', 'Payment Platform', 'Healthcare Connect'].map((proj, i) => {
                if (proj === 'E-Commerce Platform') {
                  return (
                    <Link
                      key={i}
                      to="/project"
                      className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#f4f4f6] hover:bg-[#222c37]/50 transition-colors group"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#ffb03a] opacity-70 group-hover:opacity-100 transition-opacity"></div>
                      <span className="truncate">{proj}</span>
                    </Link>
                  );
                }
                return (
                  <button key={i} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#f4f4f6] hover:bg-[#11161b] transition-colors group">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#5f636b] group-hover:bg-[#38bdf8] transition-colors"></div>
                    <span className="truncate">{proj}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ACCOUNT */}
        <div className="p-4 border-t border-[#222c37]">
           <h3 className="text-[10px] font-mono font-semibold text-[#5f636b] uppercase tracking-wider px-2 mb-3"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Account</h3>
           <div className="space-y-0.5">
             <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-[#94a3b8] hover:text-[#f4f4f6] hover:bg-[#11161b] transition-colors">
                <User size={16} className="text-[#5f636b]" />
                Profile
             </button>
             <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-[#94a3b8] hover:text-[#f4f4f6] hover:bg-[#11161b] transition-colors">
                <Settings size={16} className="text-[#5f636b]" />
                Settings
             </button>
           </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* TOP BAR */}
        <header className="h-14 border-b border-[#222c37] bg-[#080b0e] flex items-center justify-between px-6 shrink-0 z-10">
          
          {/* Breadcrumb */}
          <div className="flex items-center text-sm font-mono text-[#5f636b]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            <span className="hover:text-[#f4f4f6] cursor-pointer transition-colors">ArchTime</span>
            {currentPath.split('/').filter(Boolean).map((segment, i, arr) => (
              <React.Fragment key={i}>
                <span className="mx-2">/</span>
                <span className={i === arr.length - 1 ? "text-[#f4f4f6] capitalize" : "capitalize"}>
                  {segment.replace(/-/g, ' ')}
                </span>
              </React.Fragment>
            ))}
            {currentPath === '/' && (
              <>
                <span className="mx-2">/</span>
                <span className="text-[#f4f4f6] capitalize">Dashboard</span>
              </>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-6">
            
            {/* Search */}
            <div className="hidden lg:flex items-center relative group">
              <Search size={14} className="absolute left-3 text-[#5f636b] group-focus-within:text-[#38bdf8] transition-colors" />
              <input
                type="text"
                aria-label="Search projects, commits, insights"
                placeholder="Search projects, commits, insights..."
                className="w-64 h-8 bg-[#11161b] border border-[#222c37] pl-9 pr-14 text-xs text-[#f4f4f6] placeholder:text-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 focus:ring-1 focus:ring-[#38bdf8]/20 transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-[#5f636b] bg-[#080b0e] border border-[#222c37]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>⌘</kbd>
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-[#5f636b] bg-[#080b0e] border border-[#222c37]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>K</kbd>
              </div>
            </div>

            <button aria-label="Notifications" className="text-[#5f636b] hover:text-[#f4f4f6] transition-colors relative">
              <Bell size={18} />
              <div className="absolute top-0 right-0 w-2 h-2 bg-[#38bdf8] rounded-full border border-[#080b0e]"></div>
            </button>

            <button className="h-8 px-4 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-semibold text-xs transition-all flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.15)]">
              ANALYZE REPOSITORY
            </button>

            <div className="w-8 h-8 rounded-full bg-[#222c37] flex items-center justify-center border border-[#5f636b] cursor-pointer overflow-hidden">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=222c37" alt="User" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        {/* SCROLLABLE SUB-PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 xl:p-10 scrollbar-hide">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
