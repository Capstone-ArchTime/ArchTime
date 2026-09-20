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
  Bell
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/projects', label: 'Projects', icon: FolderKanban },
    { path: '/history', label: 'Architecture History', icon: History },
    { path: '/compare', label: 'Compare', icon: GitCompare },
    { path: '/evidence', label: 'Changes & Evidence', icon: FileSearch },
    { path: '/insights', label: 'AI Insights', icon: Sparkles },
    { path: '/reports', label: 'Reports', icon: FileBarChart },
  ];

  return (
    <div className="flex h-screen bg-[#070A0F] text-[#F4F7FA] font-sans overflow-hidden selection:bg-[#19C8F3]/20 selection:text-[#19C8F3]">
      
      {/* SIDEBAR */}
      <aside className="hidden md:flex flex-col w-60 bg-[#090E14] border-r border-[#1A2A37] h-full shrink-0">
        
        {/* Branding */}
        <div className="p-6 pb-4">
          <Link to="/dashboard" className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0B1017] flex items-center justify-center border border-[#1A2A37] shadow-lg">
              <div className="w-4 h-4 relative">
                <div className="w-1.5 h-1.5 rounded-full bg-[#19C8F3] absolute top-0 left-0 shadow-[0_0_8px_#19C8F3]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-[#1687FF] absolute bottom-0 right-0"></div>
                <div className="w-[1px] h-2.5 bg-[#8A98A8]/50 rotate-45 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[#F4F7FA] leading-none">ArchTime</h1>
          </Link>
          <p className="text-[9px] text-[#19C8F3] font-mono tracking-widest uppercase ml-11 font-semibold">Architecture Observatory</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-8 scrollbar-hide">
          
          {/* CORE NAVIGATION */}
          <div>
            <h3 className="text-[10px] font-mono font-semibold text-[#566575] uppercase tracking-wider px-3 mb-3">Core Navigation</h3>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const IconComp = item.icon;
                const isActive = currentPath.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-all focus:outline-none ${
                      isActive 
                        ? 'bg-[#19C8F3]/10 text-[#F4F7FA] border-l-2 border-[#19C8F3] -ml-[2px] pl-[14px]' 
                        : 'text-[#8A98A8] hover:text-[#F4F7FA] hover:bg-[#0B1017] rounded-md border-l-2 border-transparent'
                    }`}
                  >
                    <IconComp size={16} className={isActive ? "text-[#19C8F3]" : "text-[#566575] group-hover:text-[#8A98A8]"} />
                    <span className={isActive ? "font-medium" : ""}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* RECENT PROJECTS */}
          <div>
            <h3 className="text-[10px] font-mono font-semibold text-[#566575] uppercase tracking-wider px-3 mb-3">Recent Projects</h3>
            <div className="space-y-0.5">
              {['E-Commerce Platform', 'Payment Platform', 'Healthcare Connect'].map((proj, i) => {
                if (proj === 'E-Commerce Platform') {
                  return (
                    <Link
                      key={i}
                      to="/project"
                      className="flex items-center gap-3 px-3 py-2 text-sm text-[#8A98A8] hover:text-[#F4F7FA] hover:bg-[#1A2A37]/50 rounded-lg transition-colors group"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#FFB020] opacity-70 group-hover:opacity-100 transition-opacity"></div>
                      <span className="truncate">{proj}</span>
                    </Link>
                  );
                }
                return (
                  <button key={i} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#8A98A8] hover:text-[#F4F7FA] hover:bg-[#0B1017] rounded-md transition-colors group">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#566575] group-hover:bg-[#1687FF] transition-colors"></div>
                    <span className="truncate">{proj}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ACCOUNT */}
        <div className="p-4 border-t border-[#1A2A37]">
           <h3 className="text-[10px] font-mono font-semibold text-[#566575] uppercase tracking-wider px-2 mb-3">Account</h3>
           <div className="space-y-0.5">
             <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-[#8A98A8] hover:text-[#F4F7FA] hover:bg-[#0B1017] rounded-md transition-colors">
                <User size={16} className="text-[#566575]" />
                Profile
             </button>
             <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-[#8A98A8] hover:text-[#F4F7FA] hover:bg-[#0B1017] rounded-md transition-colors">
                <Settings size={16} className="text-[#566575]" />
                Settings
             </button>
           </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* TOP BAR */}
        <header className="h-14 border-b border-[#1A2A37] bg-[#070A0F] flex items-center justify-between px-6 shrink-0 z-10">
          
          {/* Breadcrumb */}
          <div className="flex items-center text-sm font-mono text-[#566575]">
            <span className="hover:text-[#F4F7FA] cursor-pointer transition-colors">ArchTime</span>
            <span className="mx-2">/</span>
            <span className="text-[#F4F7FA] capitalize">
              {currentPath.replace('/', '') || 'Dashboard'}
            </span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-6">
            
            {/* Search */}
            <div className="hidden lg:flex items-center relative group">
              <Search size={14} className="absolute left-3 text-[#566575] group-focus-within:text-[#19C8F3] transition-colors" />
              <input 
                type="text" 
                placeholder="Search projects, commits, insights..."
                className="w-64 h-8 bg-[#0B1017] border border-[#1A2A37] rounded-md pl-9 pr-14 text-xs text-[#F4F7FA] placeholder:text-[#566575] focus:outline-none focus:border-[#19C8F3]/50 focus:ring-1 focus:ring-[#19C8F3]/20 transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-[#566575] bg-[#070A0F] border border-[#1A2A37] rounded">⌘</kbd>
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-[#566575] bg-[#070A0F] border border-[#1A2A37] rounded">K</kbd>
              </div>
            </div>

            <button className="text-[#566575] hover:text-[#F4F7FA] transition-colors relative">
              <Bell size={18} />
              <div className="absolute top-0 right-0 w-2 h-2 bg-[#19C8F3] rounded-full border border-[#070A0F]"></div>
            </button>

            <button className="h-8 px-4 bg-[#19C8F3] hover:bg-[#19C8F3]/90 text-[#070A0F] font-semibold text-xs rounded-md transition-all flex items-center gap-2 shadow-[0_0_10px_rgba(25,200,243,0.15)]">
              ANALYZE REPOSITORY
            </button>

            <div className="w-8 h-8 rounded-full bg-[#1A2A37] flex items-center justify-center border border-[#566575] cursor-pointer overflow-hidden">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=1A2A37" alt="User" className="w-full h-full object-cover" />
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
