import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { App, Button, Drawer, Dropdown, Input, Modal } from 'antd';
import { ArrowUpRight, ChevronDown, LogOut, Menu, Search, User } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { accountMenuItems, navGroupsFor, navHeadingByRole } from './navigation';
import type { NavGroup } from './navigation';
import { useMaintainsWorkspaces } from '@/hooks/useMaintainsWorkspaces';
import { matchNavItem } from './nav-match';

const OPEN_GROUPS_KEY = 'archtime.nav.openGroups';
function readOpenGroups(): Record<string, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, open]) => typeof open === 'boolean')) as Record<string, boolean>;
  } catch { return {}; }
}

/** `title` names a page that has no item of its own in the navigation (one workspace, for example). */
export default function DashboardLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { user, signOut } = useAuth();
  const { modal } = App.useApp();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const maintains = useMaintainsWorkspaces(user?.id, user?.role === 'developer-analyst');
  const groups = user ? navGroupsFor(user.role, { maintains, pathname }) : [];
  // Every page the account can jump to: the sidebar plus the account menu (for the page title and Ctrl+K search).
  const items = [...groups.flatMap(group => group.items), ...(user ? accountMenuItems[user.role] : [])];
  const homePath = items[0]?.path ?? '/';
  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  const currentItem = matchNavItem(items, pathname);
  const currentPage = title ?? currentItem?.label ?? 'Workspace detail';

  useEffect(() => {
    document.title = `${currentPage} · ArchTime`;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, currentPage]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!user) return null;
  /** A folded group stays as the person left it; one they never touched opens while it holds the current page. */
  const isOpen = (group: NavGroup) => openGroups[group.label ?? ''] ?? group.items.some(item => item.path === currentItem?.path);
  const toggleGroup = (label: string, open: boolean) => {
    const next = { ...openGroups, [label]: open };
    setOpenGroups(next);
    try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* storage blocked: the choice lasts for this page only */ }
  };
  const closeNavigation = () => { setMenuOpen(false); setSearchOpen(false); setQuery(''); };
  const logout = () => modal.confirm({
    title: 'Sign out of ArchTime?', content: 'Save any edits before signing out. Unsaved changes will be lost.',
    okText: 'Sign out', cancelText: 'Stay signed in', onOk: signOut,
  });
  const linkClass = (active: boolean) => `flex items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${active ? 'border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#93c5fd]' : 'border-transparent text-[#94a3b8] hover:bg-[#161d24] hover:text-white'}`;
  const renderLink = (item: NavGroup['items'][number]) => {
    const active = currentItem?.path === item.path;
    const Icon = item.icon;
    return <Link key={item.path} to={item.path} onClick={closeNavigation} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
      <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
    </Link>;
  };
  const navigation = <nav aria-label="Workspace navigation" className="space-y-1">
    {groups.map((group, index) => {
      if (!group.label) return <div key={index} className="space-y-1">{group.items.map(renderLink)}</div>;
      const label = group.label;
      const open = isOpen(group);
      const holdsCurrent = group.items.some(item => item.path === currentItem?.path);
      const GroupIcon = group.icon;
      return <div key={label} role="group" aria-label={label} className="space-y-1">
        <button type="button" aria-expanded={open} onClick={() => toggleGroup(label, !open)}
          className={`flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors hover:bg-[#161d24] hover:text-white ${holdsCurrent && !open ? 'text-[#93c5fd]' : 'text-[#94a3b8]'}`}>
          {GroupIcon && <GroupIcon size={17} aria-hidden="true" />}<span>{label}</span>
          <ChevronDown size={15} aria-hidden="true" className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="space-y-1 pl-4">{group.items.map(renderLink)}</div>}
      </div>;
    })}
  </nav>;

  return <div className="workspace-shell flex h-dvh bg-[#080b0e] text-[#f4f4f6] overflow-hidden">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <aside className="hidden lg:flex w-64 flex-col shrink-0 border-r border-[#242527] bg-[#0c1015]">
      <Link to={homePath} className="px-6 pt-7 pb-6 block" aria-label="ArchTime workspace home">
        <span className="text-xl font-semibold tracking-tight">Arch<span className="text-[#93c5fd]">Time</span></span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-[#94a3b8] mt-2">Architecture Observatory</span>
      </Link>
      <div className="px-3 py-4 flex-1 overflow-y-auto"><p className="px-3 mb-3 text-[10px] uppercase tracking-widest text-[#94a3b8]">{navHeadingByRole[user.role]}</p>{navigation}</div>
      <div className="border-t border-[#242527] p-4">
        <p className="truncate text-sm font-medium" title={user.name}>{user.name}</p><p className="truncate text-xs text-[#94a3b8] mt-1" title={user.email}>{user.email}</p>
        <button type="button" onClick={logout} className="flex items-center gap-2 text-xs text-[#94a3b8] hover:text-white mt-4 py-2"><LogOut size={15} aria-hidden="true" />Sign out</button>
      </div>
    </aside>
    <div className="flex flex-1 min-w-0 flex-col">
      <header className="h-16 border-b border-[#242527] flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen} className="lg:hidden w-10 h-10 flex items-center justify-center rounded border border-[#242527]"><Menu size={20} /></button>
          <div className="min-w-0"><p className="text-[10px] text-[#94a3b8] uppercase tracking-wider truncate">{navHeadingByRole[user.role]}</p><p className="text-sm font-medium truncate mt-1">{currentPage}</p></div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search workspace pages" aria-keyshortcuts="Control+k Meta+k" className="flex items-center gap-3 border border-[#242527] bg-[#11161b] rounded h-10 px-3 text-[#94a3b8] hover:border-[#3b82f6]/50">
            <Search size={16} aria-hidden="true" /><span className="hidden sm:inline text-xs">Find a page…</span><kbd className="hidden md:inline text-[10px]">Ctrl K</kbd>
          </button>
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
            ...accountMenuItems[user.role].map(item => ({ key: item.path, label: <Link to={item.path}>{item.label}</Link> })),
            { type: 'divider' as const },
            { key: 'sign-out', label: 'Sign out', onClick: logout },
          ] }}>
            <button type="button" aria-label="Account menu" className="h-10 w-10 flex items-center justify-center rounded-full bg-[#161d24] border border-[#242527] text-[#93c5fd]"><User size={18} /></button>
          </Dropdown>
        </div>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 xl:p-9 focus:outline-none">
        <h1 className="sr-only">{currentPage}</h1>{children}
      </main>
    </div>
    <Drawer title="ArchTime workspace" placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} size={300}>
      {navigation}<div className="mt-6 pt-5 border-t border-[#242527]"><p className="text-sm mb-3 truncate">{user.name}</p><Button icon={<LogOut size={15} />} onClick={logout}>Sign out</Button></div>
    </Drawer>
    <Modal title="Find a workspace page" open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null}>
      <Input autoFocus aria-label="Search page names" placeholder="Search page names…" value={query} onChange={event => setQuery(event.target.value)} allowClear />
      <nav aria-label="Page search results" className="mt-4 space-y-1 max-h-[50dvh] overflow-y-auto">
        {items.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase())).map(item => <Link key={item.path} to={item.path} onClick={closeNavigation} className="flex justify-between items-center gap-3 rounded px-3 py-3 text-sm hover:bg-[#242527]"><span>{item.label}</span><ArrowUpRight size={15} aria-hidden="true" /></Link>)}
        {!items.some(item => item.label.toLowerCase().includes(query.trim().toLowerCase())) && <p role="status" className="p-4 text-sm text-[#94a3b8]">No matching page. Try another name.</p>}
      </nav>
    </Modal>
  </div>;
}
