import { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AlertTriangle, Compass, Home, LogIn, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';

/**
 * The page for an address that matches no route: "You've wandered off the timeline". It wears the frost look of
 * DESIGN.md for every visitor (the `at-frost-scope` class carries the palette and the sparkle floor whatever theme is on
 * <html>). The scene is the picture public/not-found-bg.webp, kept at its own proportions so the light layers on top of
 * it stay on the portal and the lantern: the portal glow breathes, the lantern flickers, the mist drifts and the picture
 * drifts closer very slowly. Everything stands still for visitors who ask for reduced motion (index.css, .at-404-*).
 */
export default function NotFound() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const home = !user ? '/' : user.role === 'system-administrator' ? '/system-administrator' : '/dashboard';
  const explore = user ? '/projects' : '/#modules';
  const nav = user
    ? [{ to: home, label: 'Home' }, { to: '/projects', label: 'Workspaces' }, { to: '/compare', label: 'Compare' }]
    : [{ to: '/', label: 'Home' }, { to: '/#modules', label: 'Explore' }, { to: '/#architecture', label: 'About' }];

  useEffect(() => { document.title = 'Page not found · ArchTime'; }, []);

  return (
    <div className="at-frost-scope at-404 relative min-h-screen overflow-hidden">
      <div className="at-404-bg" aria-hidden="true">
        <div className="at-404-art">
          <span className="at-404-portal-glow" />
          <span className="at-404-lantern-glow" />
          <span className="at-404-star" style={{ left: '62%', top: '14%' }} />
          <span className="at-404-star" style={{ left: '46%', top: '30%', animationDelay: '1.2s' }} />
          <span className="at-404-star" style={{ left: '93%', top: '37%', animationDelay: '2.1s' }} />
        </div>
        <div className="at-404-veil" />
      </div>
      <div className="at-404-mist at-404-mist-1" aria-hidden="true" />
      <div className="at-404-mist at-404-mist-2" aria-hidden="true" />
      <div className="at-404-mist at-404-mist-3" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 sm:px-10">
        <Link to={home} className="flex items-center gap-2.5 text-lg font-bold text-[var(--at-text)]" aria-label="ArchTime home">
          <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
            <defs><linearGradient id="at404-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#9db3dc" /></linearGradient></defs>
            <path d="M16 3 L29 28 L22.5 28 L16 15 L9.5 28 L3 28 Z" fill="url(#at404-logo)" />
            <path d="M11 23 Q16 19 21 23" stroke="#1b2228" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </svg>
          ArchTime
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {nav.map(item => (
            <NavLink key={item.label} to={item.to} end className="at-404-nav text-sm text-[var(--at-muted)] hover:text-[var(--at-text)]">{item.label}</NavLink>
          ))}
        </nav>
        {user ? (
          <Link to="/profile" className="at-404-avatar flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold" aria-label={`Profile of ${user.name}`}>
            {initials(user.name) || <UserRound size={18} aria-hidden="true" />}
          </Link>
        ) : (
          <Link to="/login" className="at-404-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"><LogIn size={14} aria-hidden="true" />Sign in</Link>
        )}
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1400px] items-center gap-6 px-6 pb-[60vw] pt-6 sm:px-10 lg:min-h-[calc(100vh-88px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-10">
        <section aria-labelledby="not-found-title" className="max-w-xl">
          <p className="at-404-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--at-text)]">
            <AlertTriangle size={15} aria-hidden="true" />404 · Page Not Found
          </p>
          <h1 id="not-found-title" className="mt-7 font-bold">
            <span className="at-404-oops block">Oops!</span>
            <span className="at-404-headline mt-2 block">You’ve wandered off the <span className="at-404-gradient">timeline</span>…</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--at-muted)]">
            The page you’re looking for might have been moved, deleted, or never existed. Nothing you mined, drew or wrote is affected.
          </p>
          <p className="mt-4 max-w-md truncate font-mono text-xs text-[var(--at-muted)]" title={pathname}>{pathname}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to={home} className="at-404-pearl inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold">
              <Home size={17} aria-hidden="true" />{user ? 'Go Back to Dashboard' : 'Go Back Home'}
            </Link>
            <Link to={explore} className="at-404-glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px]">
              <Compass size={17} aria-hidden="true" />{user ? 'Open Workspaces' : 'Explore More'}
            </Link>
          </div>
        </section>

        <div className="hidden lg:block" aria-hidden="true" />
      </main>
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
// The illustration is the background picture public/not-found-bg.webp (robot, portal, clock ring, 404 sign).
