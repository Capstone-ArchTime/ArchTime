import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import type { MyPath } from '@/features/onboarding-api';
import { learningHref } from '@/features/onboarding-context';
import { kindLabel, progressText } from '@/features/onboarding-view';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  continueIn: 'Continue learning · {name}', workspace: 'Workspace', progress: 'Your progress', next: 'Next:',
  more: 'You have {count} more paths to finish in {link}.', more_one: 'You have 1 more path to finish in {link}.', myLearning: 'My learning', start: 'Start', continue: 'Continue',
}, {
  continueIn: 'Học tiếp · {name}', workspace: 'Không gian làm việc', progress: 'Tiến độ của bạn', next: 'Tiếp theo:',
  more: 'Bạn còn {count} lộ trình nữa cần hoàn thành trong {link}.', myLearning: 'Việc học của tôi', start: 'Bắt đầu', continue: 'Học tiếp',
});

/** Where the newcomer left off: one path not finished yet, its progress and the next step, with a button straight to it. */
export default function ContinueLearning({ path, others }: { path: MyPath; others: number }) {
  const next = path.nextStep;
  const m = useMessages(MSG);
  if (!next) return null;
  return <section aria-labelledby="continue-learning-title" className="bg-[var(--at-panel)] border border-[var(--at-line)] p-5 flex flex-col md:flex-row md:items-center gap-4">
    <GraduationCap size={28} className="shrink-0 text-[var(--at-link)]" aria-hidden="true" />
    <div className="flex-1 min-w-0 space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--at-muted)]">{m('continueIn', { name: path.projectName ?? m('workspace') })}</p>
      <h3 id="continue-learning-title" className="text-lg font-bold text-[var(--at-text)] truncate">{path.title}</h3>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 max-w-xs bg-[var(--at-line)]" role="progressbar" aria-label={m('progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={path.percent}>
          <div className="h-full bg-[var(--at-accent)]" style={{ width: `${path.percent}%` }} />
        </div>
        <span className="text-xs text-[var(--at-muted)]">{progressText(path)}</span>
      </div>
      <p className="text-sm text-slate-300 truncate">{m('next')} <span className="text-[var(--at-text)]">{next.index + 1}. {next.title}</span> <span className="text-xs text-[var(--at-muted)]">({kindLabel(next.kind)})</span></p>
      {others > 0 && <p className="text-xs text-[var(--at-muted)]">{m.rich('more', { count: others, link: <Link key="l" to="/learning" className="text-[var(--at-link)] hover:text-[var(--at-link-hover)] hover:underline">{m('myLearning')}</Link> })}</p>}
    </div>
    <Link to={learningHref(path.projectId, path.pathId, next.id)} className="shrink-0 h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-xs flex items-center justify-center gap-2">
      {path.done === 0 ? m('start') : m('continue')} <ArrowRight size={14} aria-hidden="true" />
    </Link>
  </section>;
}
