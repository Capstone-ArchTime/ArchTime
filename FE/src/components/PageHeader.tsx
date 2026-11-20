import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/i18n';

/**
 * Text a reader only needs now and then (how a page works, rules, formulas) stays folded behind a small "Details"
 * button, so a page shows what matters first. `label` names the button; `defaultOpen` starts it unfolded.
 */
export function Details({ children, label, defaultOpen = false, className = '', bodyClassName = 'text-sm' }: {
  children: ReactNode; label?: string; defaultOpen?: boolean; className?: string; bodyClassName?: string;
}) {
  const t = useT();
  label ??= t('common.details');
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={className}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}
      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--at-link)] hover:text-[var(--at-link-hover)]">
      {label}<ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <div id={id} hidden={!open} className={`mt-2 max-w-3xl leading-relaxed text-[var(--at-muted)] space-y-2 ${bodyClassName}`}>{children}</div>
  </div>;
}

/**
 * The top of a page: the title, one short line saying what the page is for, and on the right the page's own controls
 * (a workspace picker, a primary button). Longer explanations go in `details`, folded until asked for.
 */
export default function PageHeader({ title, summary, details, actions, className = '' }: {
  title: ReactNode; summary?: ReactNode; details?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return <header className={`flex flex-col gap-4 border-b border-[var(--at-line)] pb-6 lg:flex-row lg:items-end lg:justify-between ${className}`}>
    <div className="min-w-0">
      <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)] break-words">{title}</h2>
      {summary && <p className="mt-2 max-w-2xl text-sm text-[var(--at-muted)]">{summary}</p>}
      {details && <Details className="mt-2">{details}</Details>}
    </div>
    {actions && <div className="flex flex-wrap items-end gap-2 shrink-0">{actions}</div>}
  </header>;
}
