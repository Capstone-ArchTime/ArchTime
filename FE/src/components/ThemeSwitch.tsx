import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, Palette } from 'lucide-react';
import { SELECTABLE_THEMES } from '@/theme/registry';
import { setThemeChoice, useThemeChoice } from '@/features/ui-theme';
import { useLanguage, useT } from '@/i18n';

/**
 * The theme picker for pages a signed-out visitor sees (landing, sign-in), beside the language switch: signed-in people
 * pick in the account menu. Each theme shows a swatch of its own floor and main action, its name and a hint. Plain
 * HTML, no antd: the landing page must stay small. The choice is kept in this browser and applies at once.
 */
export default function ThemeSwitch({ className = '' }: { className?: string }) {
  const t = useT();
  const language = useLanguage();
  const choice = useThemeChoice();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Closes on a click outside or Escape (focus goes back to the button).
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // The current theme gets the focus, so arrow keys start from it.
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const pick = (id: string) => {
    setThemeChoice(id);
    setOpen(false);
    button.current?.focus();
  };

  return <div ref={root} className={`relative ${className}`}>
    <button ref={button} type="button" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      aria-label={t('layout.theme')} title={t('layout.theme')}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--at-line)] bg-[var(--at-panel)]/70 text-[var(--at-muted)] transition-colors hover:text-[var(--at-text-strong)]">
      <Palette size={15} aria-hidden="true" />
    </button>
    {open && <div id={menuId} role="menu" aria-label={t('layout.theme')} onKeyDown={onMenuKey}
      className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--at-overlay-edge)] bg-[var(--at-solid)] p-1.5 text-left shadow-[var(--at-shadow-overlay)]">
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--at-muted)]">{t('layout.theme')}</p>
      {SELECTABLE_THEMES.map(theme => {
        const active = theme.id === choice;
        return <button key={theme.id} type="button" role="menuitemradio" aria-checked={active} onClick={() => pick(theme.id)}
          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--at-hover)] focus-visible:bg-[var(--at-hover)] ${active ? 'bg-[var(--at-hover)]' : ''}`}>
          {/* A swatch in the theme's own colours: its floor, with its main action as a dot. */}
          <span aria-hidden="true" className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--at-line)]" style={{ background: theme.tokens['floor-color'] }}>
            <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full" style={{ background: theme.tokens.fill, boxShadow: `0 0 0 2px ${theme.tokens['floor-color']}` }} />
            <span className="absolute left-1.5 top-1.5 h-1 w-3 rounded-full" style={{ background: theme.tokens.text, opacity: 0.8 }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--at-text)]">{theme.label[language]}</span>
            <span className="block text-xs leading-snug text-[var(--at-muted)]">{theme.hint[language]}</span>
          </span>
          {active && <Check size={15} aria-hidden="true" className="shrink-0 text-[var(--at-text-strong)]" />}
        </button>;
      })}
    </div>}
  </div>;
}
