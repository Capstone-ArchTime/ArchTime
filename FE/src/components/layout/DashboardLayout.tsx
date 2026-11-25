import { useEffect, useRef, useState } from 'react';
import type { ElementType, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Dropdown, Input, Modal, Tooltip } from 'antd';
import { ArrowLeft, ArrowUpRight, Check, LogOut, Menu, Search } from 'lucide-react';
import { readBack } from './back-link';
import { useAuth } from '@/auth/auth-context';
import { accountMenuItems, navGroupsFor, navHeadingByRole } from './navigation';
import { useMaintainsWorkspaces } from '@/hooks/useMaintainsWorkspaces';
import { matchNavItem } from './nav-match';
import BackgroundJobs from './BackgroundJobs';
import NotificationBell from './NotificationBell';
import { unreadMessage, useUnreadFindings } from '@/features/unread-findings';
import { readSidebarCollapsed, SIDEBAR_EVENT, writeSidebarCollapsed } from '@/features/display-prefs';
import { useLanguage, useT } from '@/i18n';
import type { NavItem } from './navigation';
import { setThemeChoice, useThemeChoice } from '@/features/ui-theme';
import { SELECTABLE_THEMES } from '@/theme/registry';

const CONFORMANCE_PATH = '/project-maintainer/conformance';

/** How long the light runs across the name (.at-brand-glint in index.css), and when it starts after the sidebar unfolds. */
const GLINT_MS = 700;
/** A sidebar entry under the pointer (or keyboard focus): its name lights up, glows and leans in; its icon brightens. */
const HOVER_LABEL = 'inline-block transition-[color,text-shadow,transform] duration-200 ease-out group-hover:translate-x-1 group-hover:text-[var(--at-text-strong)] group-hover:[text-shadow:0_0_14px_color-mix(in_srgb,var(--at-glow)_65%,transparent)] group-focus-visible:translate-x-1 group-focus-visible:text-[var(--at-text-strong)]';
const HOVER_ICON = 'shrink-0 transition-[color,transform] duration-200 ease-out group-hover:scale-110 group-hover:text-[var(--at-link-hover)] group-focus-visible:text-[var(--at-link-hover)]';
const GLINT_UNFOLD_DELAY_MS = 180;
/**
 * One timing for everything that moves when the sidebar folds (width, paddings, the name), so it all moves together:
 * a soft start and a long settle. `at-sidebar-motion` keeps a short version of it with reduced motion (index.css).
 */
const SIDEBAR_MOTION = 'at-sidebar-motion duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)]';
/** The names shown beside the icons of the folded sidebar: light text on a dark surface, like the other floating panels. */
const NAV_TIP = { color: 'var(--at-solid)', styles: { container: { color: 'var(--at-text)', border: '1px solid var(--at-overlay-edge)' } } } as const;

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
  const t = useT();
  const language = useLanguage();
  // Page names follow the language; navigation.ts keeps the English ones (keys are built from the path).
  const navLabel = (item: NavItem) => t.or(`nav:${item.path}`, item.label);
  const tabLabel = (item: NavItem) => t.or(`navTab:${item.path}`, item.tab ?? navLabel(item));
  const groupLabel = (label: string) => t.or(`navGroup:${label}`, label);
  const { pathname, search, state } = useLocation();
  // Opened from a workspace's tabs: a way back to it, kept while moving between the tabs of a group.
  const back = readBack(state);
  const [menuOpen, setMenuOpen] = useState(false);
  // The wide-screen sidebar folds to its icons when the ArchTime name is clicked; the choice is remembered.
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const setSidebar = (fold: boolean) => { writeSidebarCollapsed(fold); setCollapsed(fold); };
  // The Settings page can change it while this sidebar is on screen.
  useEffect(() => {
    const follow = (event: Event) => setCollapsed((event as CustomEvent<boolean>).detail);
    window.addEventListener(SIDEBAR_EVENT, follow);
    return () => window.removeEventListener(SIDEBAR_EVENT, follow);
  }, []);
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
  const themeChoice = useThemeChoice();
  const maintains = useMaintainsWorkspaces(user?.id, user?.role === 'developer-analyst');
  const unread = useUnreadFindings(!!maintains);
  const groups = user ? navGroupsFor(user.role, { maintains, pathname }) : [];
  // Every page the account can jump to: the sidebar plus the account menu (for the page title and Ctrl+K search).
  const items = [...groups.flatMap(group => group.items), ...(user ? accountMenuItems[user.role] : [])];
  const currentItem = matchNavItem(items, pathname);
  // A labelled group (Analyze, Maintain) is one sidebar link; its pages are tabs under the header.
  const currentGroup = groups.find(group => group.label && group.items.some(item => item.path === currentItem?.path));
  const currentPage = title ?? (currentItem ? navLabel(currentItem) : t('layout.workspaceDetail'));

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
  const results = items.filter(item => navLabel(item).toLowerCase().includes(query.trim().toLowerCase()));
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
    title: t('layout.signOutTitle'), content: t('layout.signOutBody'),
    okText: t('common.signOut'), cancelText: t('layout.staySignedIn'), onOk: signOut,
  });
  const linkClass = (active: boolean) => `relative flex items-center gap-3 rounded-md border px-[14px] py-3 text-sm transition-colors ${active ? 'border-[var(--at-accent)]/30 bg-[var(--at-accent)]/10 text-[var(--at-link)]' : 'border-transparent text-[var(--at-muted)] hover:bg-[var(--at-panel-2)] hover:text-[var(--at-text-strong)]'}`;
  const unreadOf = (path: string) => (path === CONFORMANCE_PATH ? unread.total : 0);
  // What hides when the sidebar folds: it fades out fast, and on unfolding waits for most of the width before fading back in.
  const fade = (compact: boolean) => `at-sidebar-motion whitespace-nowrap transition-opacity ease-out ${compact ? 'opacity-0 duration-150' : 'opacity-100 duration-300 delay-150'}`;
  /** A count beside the label, or a dot on the icon while the sidebar is folded. */
  const badge = (count: number, compact: boolean) => count <= 0 ? null : compact
    ? <span className="absolute left-[30px] top-2 h-2 w-2 rounded-full bg-[var(--at-fill)] ring-2 ring-[var(--at-sidebar)]" aria-label={t('layout.unread', { count })} />
    : <span className="ml-auto min-w-5 rounded-full bg-[var(--at-fill)] px-1.5 text-center text-xs font-semibold leading-5 text-[var(--at-on-fill)]" aria-label={t('layout.unread', { count })}>{count > 99 ? '99+' : count}</span>;
  /** One sidebar entry; folded, its name shows in a tooltip to the right. */
  const navLink = ({ to, label, icon: Icon, active, current, count, title }: { to: string; label: string; icon?: ElementType; active: boolean; current: 'page' | 'true'; count: number; title?: string }, compact: boolean) =>
    <Tooltip key={to} title={compact ? label : undefined} placement="right" mouseEnterDelay={0.15} {...NAV_TIP}>
      <Link to={to} onClick={closeNavigation} aria-current={active ? current : undefined} className={`group ${linkClass(active)}`} title={title}>
        {Icon && <Icon size={17} aria-hidden="true" className={HOVER_ICON} />}
        <span className={fade(compact)}><span className={HOVER_LABEL}>{label}</span></span>{badge(count, compact)}
      </Link>
    </Tooltip>;
  const renderNav = (compact: boolean) => <nav aria-label={t('layout.navigation')} className="space-y-1">
    {groups.map((group, index) => {
      if (!group.label) return <div key={index} className="space-y-1">{group.items.map(item => navLink({
        to: item.path, label: navLabel(item), icon: item.icon, active: currentItem?.path === item.path, current: 'page', count: unreadOf(item.path),
        title: item.path === CONFORMANCE_PATH ? unreadMessage(unread) ?? undefined : undefined,
      }, compact))}</div>;
      return navLink({ to: group.items[0].path, label: groupLabel(group.label), icon: group.icon, active: group === currentGroup, current: 'true', count: group.items.reduce((n, item) => n + unreadOf(item.path), 0) }, compact);
    })}
  </nav>;
  // "Arch" and "Time" fold into the monogram "AT": the letters between narrow to nothing.
  const squeeze = `inline-block overflow-hidden align-bottom transition-[max-width,opacity] ${SIDEBAR_MOTION} ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[3.4ch] opacity-100'}`;
  const brandWord = <>A<span className={squeeze}>rch</span><span className="text-[var(--at-link)]">T</span><span className={`${squeeze} text-[var(--at-link)]`}>ime</span></>;
  const initials =user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

  return <div className="workspace-shell flex h-dvh bg-[var(--at-page)] text-[var(--at-text)] overflow-hidden">
    <a href="#main-content" className="skip-link">{t('layout.skipToContent')}</a>
    <aside id="app-sidebar" data-collapsed={collapsed}
      className={`hidden lg:flex flex-col shrink-0 overflow-hidden border-r border-[var(--at-line)] bg-[var(--at-sidebar)] transition-[width] ${SIDEBAR_MOTION} ${collapsed ? 'w-[70px]' : 'w-64'}`}>
      <button type="button" onClick={toggleSidebar} aria-expanded={!collapsed} aria-controls="app-sidebar" title={collapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
        className={`group relative block w-full pt-7 pb-6 text-left transition-[padding] ${SIDEBAR_MOTION} ${collapsed ? 'px-[18px]' : 'px-6'}`}>
        <span className="sr-only">{collapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}</span>
        <span aria-hidden="true" className="relative inline-flex items-baseline whitespace-nowrap text-xl font-semibold tracking-tight">
          {brandWord}
          {glint > 0 && <span key={glint} className="at-brand-glint flex items-baseline" onAnimationEnd={() => setGlint(0)}>{brandWord}</span>}
        </span>
        {/* Only fades: keeping its height means the links below never jump up or down while the sidebar folds. */}
        <span aria-hidden="true" className={`mt-2 block overflow-hidden whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-[var(--at-muted)] ${fade(collapsed)}`}>{t('layout.tagline')}</span>
      </button>
      <div className="px-3 py-4 flex-1 overflow-y-auto overflow-x-hidden">
        <p className={`px-3 mb-3 text-[10px] uppercase tracking-widest text-[var(--at-muted)] ${fade(collapsed)}`}>{t.or(`navHeading:${user.role}`, navHeadingByRole[user.role])}</p>
        {renderNav(collapsed)}
      </div>
      <div className={`border-t border-[var(--at-line)] py-4 transition-[padding] ${SIDEBAR_MOTION} ${collapsed ? 'px-[15px]' : 'px-4'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--at-panel-2)] text-xs font-semibold text-[var(--at-link)]" title={collapsed ? `${user.name} · ${user.email}` : undefined}>{initials}</span>
          <div className={`min-w-0 ${fade(collapsed)}`}>
            <p className="truncate text-sm font-medium" title={user.name}>{user.name}</p><p className="truncate text-xs text-[var(--at-muted)]" title={user.email}>{user.email}</p>
          </div>
        </div>
      </div>
    </aside>
    <div className="flex flex-1 min-w-0 flex-col">
      <header className="h-[72px] border-b border-[var(--at-line)] flex items-center justify-between gap-3 px-4 sm:px-6 xl:px-9 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('layout.openNavigation')} aria-expanded={menuOpen} className="lg:hidden w-10 h-10 flex items-center justify-center rounded border border-[var(--at-line)]"><Menu size={20} /></button>
          {back && <Link to={back.to} aria-label={t('layout.backTo', { label: back.label })} title={t('layout.backTo', { label: back.label })}
            className="flex h-10 max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-[var(--at-line)] px-3.5 text-sm text-[var(--at-text)] hover:bg-[var(--at-panel-2)]">
            <ArrowLeft size={16} aria-hidden="true" className="shrink-0" /><span className="truncate">{back.label}</span>
          </Link>}
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--at-muted)] uppercase tracking-[0.14em] truncate">{currentGroup?.label ? groupLabel(currentGroup.label) : t.or(`navHeading:${user.role}`, navHeadingByRole[user.role])}</p>
            <p className="text-lg font-semibold leading-tight text-[var(--at-text)] truncate mt-0.5">{currentPage}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <BackgroundJobs userId={user.id} />
          <NotificationBell userId={user.id} />
          <button type="button" onClick={() => setSearchOpen(true)} aria-label={t('layout.searchPages')} aria-keyshortcuts="Control+k Meta+k" className="flex items-center gap-3 rounded-full border border-[var(--at-line)] bg-[var(--at-panel)] h-11 pl-4 pr-2.5 text-[var(--at-muted)] hover:border-[var(--at-accent)]/50 hover:text-[var(--at-text)] transition-colors">
            <Search size={18} aria-hidden="true" /><span className="hidden sm:inline text-sm sm:min-w-32 text-left">{t('layout.findPage')}</span>
            <kbd className="hidden md:inline-flex items-center rounded-md border border-[var(--at-line)] bg-[var(--at-panel-2)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--at-muted)]">Ctrl K</kbd>
          </button>
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
            { key: 'who', disabled: true, label: <span className="block max-w-56 py-0.5"><span className="block truncate text-sm font-medium text-[var(--at-text)]">{user.name}</span><span className="block truncate text-xs text-[var(--at-muted)]">{user.email}</span></span> },
            { type: 'divider' as const },
            ...accountMenuItems[user.role].map(item => ({ key: item.path, label: <Link to={item.path}>{navLabel(item)}</Link> })),
            { type: 'divider' as const },
            { type: 'group' as const, key: 'theme', label: t('layout.theme'), children: SELECTABLE_THEMES.map(option => ({
              key: `theme:${option.id}`, onClick: () => setThemeChoice(option.id), role: 'menuitemradio', 'aria-checked': themeChoice === option.id,
              label: <span className="flex items-center gap-3"><span className="w-4 shrink-0">{themeChoice === option.id && <Check size={15} aria-hidden="true" />}</span><span><span className="block">{option.label[language]}</span><span className="block text-xs text-[var(--at-muted)]">{option.hint[language]}</span></span></span>,
            })) },
            { type: 'divider' as const },
            { key: 'sign-out', icon: <LogOut size={15} aria-hidden="true" />, label: t('common.signOut'), onClick: logout },
          ] }}>
            <button type="button" aria-label={t('layout.accountMenu')} title={user.name}
              className="h-11 w-11 flex items-center justify-center rounded-full bg-[var(--at-fill)] text-sm font-semibold text-[var(--at-on-fill)] hover:bg-[var(--at-fill-hover)] transition-colors">{initials}</button>
          </Dropdown>
        </div>
      </header>
      {currentGroup && <nav ref={tabsRef} aria-label={t('layout.groupPages', { group: groupLabel(currentGroup.label ?? '') })} className="relative shrink-0 border-b border-[var(--at-line)] px-4 sm:px-6 xl:px-9 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-stretch gap-1 h-12">
          {currentGroup.items.map(item => {
            const active = item.path === currentItem?.path;
            const count = unreadOf(item.path);
            return <Link key={item.path} to={`${item.path}${carriedWorkspace(search)}`} state={back ? { back } : undefined} aria-current={active ? 'page' : undefined}
              title={item.path === CONFORMANCE_PATH ? unreadMessage(unread) ?? undefined : undefined}
              className={`relative flex items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors ${active ? 'text-[var(--at-text-strong)] font-medium' : 'text-[var(--at-muted)] hover:text-[var(--at-text-strong)]'}`}>
              <span>{tabLabel(item)}</span>{badge(count, false)}
              {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--at-link)]" />}
            </Link>;
          })}
        </div>
      </nav>}
      <main id="main-content" ref={mainRef} tabIndex={-1} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 xl:p-9 focus:outline-none">
        <h1 className="sr-only">{currentPage}</h1>{children}
      </main>
    </div>
    <Drawer title={t('layout.drawerTitle')} placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} size={300}>
      {renderNav(false)}<div className="mt-6 pt-5 border-t border-[var(--at-line)]"><p className="text-sm mb-3 truncate">{user.name}</p><Button icon={<LogOut size={15} />} onClick={logout}>{t('common.signOut')}</Button></div>
    </Drawer>
    <Modal title={t('layout.searchTitle')} open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null}>
      <Input autoFocus aria-label={t('layout.searchLabel')} aria-describedby="page-search-hint" placeholder={t('layout.searchPlaceholder')} value={query}
        onChange={event => { setQuery(event.target.value); setActiveResult(0); }} onKeyDown={onSearchKey} allowClear />
      <p id="page-search-hint" className="mt-2 text-xs text-[var(--at-muted)]">{t('layout.searchHint')}</p>
      <nav aria-label={t('layout.searchResults')} className="mt-3 space-y-1 max-h-[50dvh] overflow-y-auto">
        {results.map((item, index) => {
          const highlighted = index === Math.min(activeResult, results.length - 1);
          return <Link key={item.path} to={item.path} onClick={closeNavigation} onMouseEnter={() => setActiveResult(index)} aria-current={highlighted ? 'true' : undefined}
            className={`flex justify-between items-center gap-3 rounded-[10px] px-3 py-3 text-sm ${highlighted ? 'bg-[var(--at-panel-2)] text-[var(--at-link)]' : 'hover:bg-[var(--at-line)]'}`}>
            <span>{navLabel(item)}</span><ArrowUpRight size={15} aria-hidden="true" />
          </Link>;
        })}
        {!results.length && <p role="status" className="p-4 text-sm text-[var(--at-muted)]">{t('layout.searchEmpty')}</p>}
      </nav>
    </Modal>
  </div>;
}
