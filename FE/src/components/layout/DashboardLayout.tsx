import { useEffect, useRef, useState } from 'react';
import type { ElementType, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Dropdown, Input, Modal, Tooltip } from 'antd';
import { ArrowLeft, ArrowUpRight, LogOut, Menu, PanelLeftClose, Search } from 'lucide-react';
import { readBack } from './back-link';
import { useAuth } from '@/auth/auth-context';
import { accountMenuItems, navGroupsFor, navHeadingByRole } from './navigation';
import { useMaintainsWorkspaces } from '@/hooks/useMaintainsWorkspaces';
import { matchNavItem } from './nav-match';
import BackgroundJobs from './BackgroundJobs';
import { unreadMessage, useUnreadFindings } from '@/features/unread-findings';

const CONFORMANCE_PATH = '/project-maintainer/conformance';

const COLLAPSED_KEY = 'archtime.sidebar.collapsed';
/** How long the light runs across the name (.at-brand-glint in index.css), and when it starts after the sidebar unfolds. */
const GLINT_MS = 700;
/** A sidebar entry under the pointer (or keyboard focus): its name lights up, glows and leans in; its icon brightens. */
const HOVER_LABEL = 'inline-block transition-[color,text-shadow,transform] duration-200 ease-out group-hover:translate-x-1 group-hover:text-white group-hover:[text-shadow:0_0_14px_rgb(214_228_255/0.65)] group-focus-visible:translate-x-1 group-focus-visible:text-white';
const HOVER_ICON = 'shrink-0 transition-[color,transform] duration-200 ease-out group-hover:scale-110 group-hover:text-[var(--at-link-hover)] group-focus-visible:text-[var(--at-link-hover)]';
const GLINT_UNFOLD_DELAY_MS = 180;
/** The names shown beside the icons of the folded sidebar: light text on a dark surface, like the other floating panels. */
const NAV_TIP = { color: '#27303a', styles: { container: { color: '#eef2f8', border: '1px solid rgb(225 234 248 / 0.22)' } } } as const;
function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

/** The workspace chosen on one page of a group, kept when moving to another page of the same group. */
function carriedWorkspace(search: string): string {
  const current = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ['projectId', 'project']) { const value = current.get(key); if (value) kept.set(key, value); }
  const query = kept.toString();
  return query ? `?${query}` : '';
}

/** `title` names a page that has no item of its own in the navigation (one workspace, for example). */
export default function DashboardLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { user, signOut } = useAuth();
  const { modal } = App.useApp();
  const { pathname, search, state } = useLocation();
  // Opened from a workspace's tabs: a way back to it, kept while moving between the tabs of a group.
  const back = readBack(state);
  const [menuOpen, setMenuOpen] = useState(false);
  // The wide-screen sidebar folds to its icons when the ArchTime name is clicked; the choice is remembered.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const setSidebar = (fold: boolean) => {
    try { localStorage.setItem(COLLAPSED_KEY, fold ? '1' : '0'); } catch { /* storage blocked: the choice lasts for this page only */ }
    setCollapsed(fold);
  };
  // A streak of light runs across the name first (a new key restarts it); folding waits for it, unfolding starts with it.
  const [glint, setGlint] = useState(0);
  const glintTimer = useRef<number | undefined>(undefined);
  const busyUntil = useRef(0);
  useEffect(() => () => window.clearTimeout(glintTimer.current), []);
  const toggleSidebar = () => {
    if (Date.now() < busyUntil.current) return; // already on its way
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { setSidebar(!collapsed); return; }
    busyUntil.current = Date.now() + GLINT_MS + GLINT_UNFOLD_DELAY_MS;
    if (collapsed) {
      setSidebar(false);
      glintTimer.current = window.setTimeout(() => setGlint(n => n + 1), GLINT_UNFOLD_DELAY_MS);
    } else {
      // Fold at once; the light runs across the name while it narrows, so the click never waits for the animation.
      setGlint(n => n + 1);
      setSidebar(true);
    }
  };
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The highlighted search result: arrow keys move it, Enter opens it.
  const [activeResult, setActiveResult] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const maintains = useMaintainsWorkspaces(user?.id, user?.role === 'developer-analyst');
  const unread = useUnreadFindings(!!maintains);
  const groups = user ? navGroupsFor(user.role, { maintains, pathname }) : [];
  // Every page the account can jump to: the sidebar plus the account menu (for the page title and Ctrl+K search).
  const items = [...groups.flatMap(group => group.items), ...(user ? accountMenuItems[user.role] : [])];
  const currentItem = matchNavItem(items, pathname);
  // A labelled group (Analyze, Maintain) is one sidebar link; its pages are tabs under the header.
  const currentGroup = groups.find(group => group.label && group.items.some(item => item.path === currentItem?.path));
  const currentPage = title ?? currentItem?.label ?? 'Workspace detail';

  useEffect(() => {
    document.title = `${currentPage} · ArchTime`;
    mainRef.current?.focus({ preventScroll: true });
    // On a narrow screen the tab bar scrolls sideways: bring the current tab into view.
    const tabs = tabsRef.current;
    const current = tabs?.querySelector<HTMLElement>('[aria-current="page"]');
    if (tabs && current) tabs.scrollLeft = current.offsetLeft - (tabs.clientWidth - current.offsetWidth) / 2;
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
  const closeNavigation = () => { setMenuOpen(false); setSearchOpen(false); setQuery(''); setActiveResult(0); };
  const results = items.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const onSearchKey = (event: ReactKeyboardEvent) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveResult(i => (i + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[Math.min(activeResult, results.length - 1)];
      closeNavigation();
      navigate(target.path);
    }
  };
  const logout = () => modal.confirm({
    title: 'Sign out of ArchTime?', content: 'Save any edits before signing out. Unsaved changes will be lost.',
    okText: 'Sign out', cancelText: 'Stay signed in', onOk: signOut,
  });
  const linkClass = (active: boolean) => `relative flex items-center gap-3 rounded-md border px-[14px] py-3 text-sm transition-colors ${active ? 'border-[var(--at-accent)]/30 bg-[var(--at-accent)]/10 text-[var(--at-link)]' : 'border-transparent text-[var(--at-muted)] hover:bg-[var(--at-panel-2)] hover:text-white'}`;
  const unreadOf = (path: string) => (path === CONFORMANCE_PATH ? unread.total : 0);
  // What hides when the sidebar folds: it fades and slides out fast, and on unfolding waits for the width before coming back.
  const fade = (compact: boolean) => `whitespace-nowrap transition-[opacity,transform] ease-out ${compact ? 'opacity-0 -translate-x-2 duration-150' : 'opacity-100 translate-x-0 duration-300 delay-100'}`;
  /** A count beside the label, or a dot on the icon while the sidebar is folded. */
  const badge = (count: number, compact: boolean) => count <= 0 ? null : compact
    ? <span className="absolute left-[30px] top-2 h-2 w-2 rounded-full bg-[var(--at-fill)] ring-2 ring-[var(--at-sidebar)]" aria-label={`${count} unread`} />
    : <span className="ml-auto min-w-5 rounded-full bg-[var(--at-fill)] px-1.5 text-center text-xs font-semibold leading-5 text-[var(--at-on-fill)]" aria-label={`${count} unread`}>{count > 99 ? '99+' : count}</span>;
  /** One sidebar entry; folded, its name shows in a tooltip to the right. */
  const navLink = ({ to, label, icon: Icon, active, current, count, title }: { to: string; label: string; icon?: ElementType; active: boolean; current: 'page' | 'true'; count: number; title?: string }, compact: boolean) =>
    <Tooltip key={to} title={compact ? label : undefined} placement="right" mouseEnterDelay={0.15} {...NAV_TIP}>
      <Link to={to} onClick={closeNavigation} aria-current={active ? current : undefined} className={`group ${linkClass(active)}`} title={title}>
        {Icon && <Icon size={17} aria-hidden="true" className={HOVER_ICON} />}
        <span className={fade(compact)}><span className={HOVER_LABEL}>{label}</span></span>{badge(count, compact)}
      </Link>
    </Tooltip>;
  const renderNav = (compact: boolean) => <nav aria-label="Workspace navigation" className="space-y-1">
    {groups.map((group, index) => {
      if (!group.label) return <div key={index} className="space-y-1">{group.items.map(item => navLink({
        to: item.path, label: item.label, icon: item.icon, active: currentItem?.path === item.path, current: 'page', count: unreadOf(item.path),
        title: item.path === CONFORMANCE_PATH ? unreadMessage(unread) ?? undefined : undefined,
      }, compact))}</div>;
      return navLink({ to: group.items[0].path, label: group.label, icon: group.icon, active: group === currentGroup, current: 'true', count: group.items.reduce((n, item) => n + unreadOf(item.path), 0) }, compact);
    })}
  </nav>;
  // "Arch" and "Time" fold into the monogram "AT": the letters between narrow to nothing.
  const squeeze = `inline-block overflow-hidden align-bottom transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[3.4ch] opacity-100'}`;
  const brandWord = <>A<span className={squeeze}>rch</span><span className="text-[var(--at-link)]">T</span><span className={`${squeeze} text-[var(--at-link)]`}>ime</span></>;
  const initials =user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

  return <div className="workspace-shell flex h-dvh bg-[var(--at-page)] text-[var(--at-text)] overflow-hidden">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <aside id="app-sidebar" data-collapsed={collapsed}
      className={`hidden lg:flex flex-col shrink-0 overflow-hidden border-r border-[var(--at-line)] bg-[var(--at-sidebar)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? 'w-[70px]' : 'w-64'}`}>
      <button type="button" onClick={toggleSidebar} aria-expanded={!collapsed} aria-controls="app-sidebar" title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        className={`group relative block w-full pt-7 pb-6 text-left transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? 'px-[18px]' : 'px-6'}`}>
        <span className="sr-only">{collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}</span>
        <span aria-hidden="true" className="relative inline-flex items-baseline whitespace-nowrap text-xl font-semibold tracking-tight">
          {brandWord}
          {glint > 0 && <span key={glint} className="at-brand-glint flex items-baseline" onAnimationEnd={() => setGlint(0)}>{brandWord}</span>}
        </span>
        <span aria-hidden="true" className={`block overflow-hidden whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-[var(--at-muted)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? 'mt-0 max-h-0 opacity-0' : 'mt-2 max-h-6 opacity-100'}`}>Architecture Observatory</span>
        <PanelLeftClose size={16} aria-hidden="true" className={`absolute right-4 top-8 text-[var(--at-muted)] transition-opacity duration-200 group-hover:text-white ${collapsed ? 'opacity-0' : 'opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100'}`} />
      </button>
      <div className="px-3 py-4 flex-1 overflow-y-auto overflow-x-hidden">
        <p className={`px-3 mb-3 text-[10px] uppercase tracking-widest text-[var(--at-muted)] ${fade(collapsed)}`}>{navHeadingByRole[user.role]}</p>
        {renderNav(collapsed)}
      </div>
      <div className={`border-t border-[var(--at-line)] py-4 transition-[padding] duration-300 ${collapsed ? 'px-[15px]' : 'px-4'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--at-panel-2)] text-xs font-semibold text-[var(--at-link)]" title={collapsed ? `${user.name} · ${user.email}` : undefined}>{initials}</span>
          <div className={`min-w-0 ${fade(collapsed)}`}>
            <p className="truncate text-sm font-medium" title={user.name}>{user.name}</p><p className="truncate text-xs text-[var(--at-muted)]" title={user.email}>{user.email}</p>
          </div>
        </div>
        <Tooltip title={collapsed ? 'Sign out' : undefined} placement="right" {...NAV_TIP}>
          <button type="button" onClick={logout} aria-label="Sign out" className="mt-3 flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-[var(--at-muted)] hover:bg-[var(--at-panel-2)] hover:text-white">
            <LogOut size={15} aria-hidden="true" className="shrink-0" /><span className={fade(collapsed)}>Sign out</span>
          </button>
        </Tooltip>
      </div>
    </aside>
    <div className="flex flex-1 min-w-0 flex-col">
      <header className="h-[72px] border-b border-[var(--at-line)] flex items-center justify-between gap-3 px-4 sm:px-6 xl:px-9 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen} className="lg:hidden w-10 h-10 flex items-center justify-center rounded border border-[var(--at-line)]"><Menu size={20} /></button>
          {back && <Link to={back.to} aria-label={`Back to ${back.label}`} title={`Back to ${back.label}`}
            className="flex h-10 max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-[var(--at-line)] px-3.5 text-sm text-[var(--at-text)] hover:bg-[var(--at-panel-2)]">
            <ArrowLeft size={16} aria-hidden="true" className="shrink-0" /><span className="truncate">{back.label}</span>
          </Link>}
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--at-muted)] uppercase tracking-[0.14em] truncate">{currentGroup?.label ?? navHeadingByRole[user.role]}</p>
            <p className="text-lg font-semibold leading-tight text-[var(--at-text)] truncate mt-0.5">{currentPage}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <BackgroundJobs userId={user.id} />
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search workspace pages" aria-keyshortcuts="Control+k Meta+k" className="flex items-center gap-3 rounded-full border border-[var(--at-line)] bg-[var(--at-panel)] h-11 pl-4 pr-2.5 text-[var(--at-muted)] hover:border-[var(--at-accent)]/50 hover:text-[var(--at-text)] transition-colors">
            <Search size={18} aria-hidden="true" /><span className="hidden sm:inline text-sm sm:min-w-32 text-left">Find a page…</span>
            <kbd className="hidden md:inline-flex items-center rounded-md border border-[var(--at-line)] bg-[var(--at-panel-2)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--at-muted)]">Ctrl K</kbd>
          </button>
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
            { key: 'who', disabled: true, label: <span className="block max-w-56 py-0.5"><span className="block truncate text-sm font-medium text-[var(--at-text)]">{user.name}</span><span className="block truncate text-xs text-[var(--at-muted)]">{user.email}</span></span> },
            { type: 'divider' as const },
            ...accountMenuItems[user.role].map(item => ({ key: item.path, label: <Link to={item.path}>{item.label}</Link> })),
            { type: 'divider' as const },
            { key: 'sign-out', icon: <LogOut size={15} aria-hidden="true" />, label: 'Sign out', onClick: logout },
          ] }}>
            <button type="button" aria-label="Account menu" title={user.name}
              className="h-11 w-11 flex items-center justify-center rounded-full bg-[var(--at-fill)] text-sm font-semibold text-[var(--at-on-fill)] hover:bg-[var(--at-fill-hover)] transition-colors">{initials}</button>
          </Dropdown>
        </div>
      </header>
      {currentGroup && <nav ref={tabsRef} aria-label={`${currentGroup.label} pages`} className="relative shrink-0 border-b border-[var(--at-line)] px-4 sm:px-6 xl:px-9 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-stretch gap-1 h-12">
          {currentGroup.items.map(item => {
            const active = item.path === currentItem?.path;
            const count = unreadOf(item.path);
            return <Link key={item.path} to={`${item.path}${carriedWorkspace(search)}`} state={back ? { back } : undefined} aria-current={active ? 'page' : undefined}
              title={item.path === CONFORMANCE_PATH ? unreadMessage(unread) ?? undefined : undefined}
              className={`relative flex items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors ${active ? 'text-white font-medium' : 'text-[var(--at-muted)] hover:text-white'}`}>
              <span>{item.tab ?? item.label}</span>{badge(count, false)}
              {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--at-link)]" />}
            </Link>;
          })}
        </div>
      </nav>}
      <main id="main-content" ref={mainRef} tabIndex={-1} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 xl:p-9 focus:outline-none">
        <h1 className="sr-only">{currentPage}</h1>{children}
      </main>
    </div>
    <Drawer title="ArchTime workspace" placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} size={300}>
      {renderNav(false)}<div className="mt-6 pt-5 border-t border-[var(--at-line)]"><p className="text-sm mb-3 truncate">{user.name}</p><Button icon={<LogOut size={15} />} onClick={logout}>Sign out</Button></div>
    </Drawer>
    <Modal title="Find a workspace page" open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null}>
      <Input autoFocus aria-label="Search page names" aria-describedby="page-search-hint" placeholder="Search page names…" value={query}
        onChange={event => { setQuery(event.target.value); setActiveResult(0); }} onKeyDown={onSearchKey} allowClear />
      <p id="page-search-hint" className="mt-2 text-xs text-[var(--at-muted)]">↑ ↓ to move, Enter to open</p>
      <nav aria-label="Page search results" className="mt-3 space-y-1 max-h-[50dvh] overflow-y-auto">
        {results.map((item, index) => {
          const highlighted = index === Math.min(activeResult, results.length - 1);
          return <Link key={item.path} to={item.path} onClick={closeNavigation} onMouseEnter={() => setActiveResult(index)} aria-current={highlighted ? 'true' : undefined}
            className={`flex justify-between items-center gap-3 rounded-[10px] px-3 py-3 text-sm ${highlighted ? 'bg-[var(--at-panel-2)] text-[var(--at-link)]' : 'hover:bg-[var(--at-line)]'}`}>
            <span>{item.label}</span><ArrowUpRight size={15} aria-hidden="true" />
          </Link>;
        })}
        {!results.length && <p role="status" className="p-4 text-sm text-[var(--at-muted)]">No matching page. Try another name.</p>}
      </nav>
    </Modal>
  </div>;
}
