import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import type { MyPath } from '@/features/onboarding-api';
import { learningHref } from '@/features/onboarding-context';
import { kindLabel, progressText } from '@/features/onboarding-view';

/** Where the newcomer left off: one path not finished yet, its progress and the next step, with a button straight to it. */
export default function ContinueLearning({ path, others }: { path: MyPath; others: number }) {
  const next = path.nextStep;
  if (!next) return null;
  return <section aria-labelledby="continue-learning-title" className="bg-[#11161b] border border-[#242527] p-5 flex flex-col md:flex-row md:items-center gap-4">
    <GraduationCap size={28} className="shrink-0 text-[#93c5fd]" aria-hidden="true" />
    <div className="flex-1 min-w-0 space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-widest text-[#94a3b8]">Continue learning · {path.projectName ?? 'Workspace'}</p>
      <h3 id="continue-learning-title" className="text-lg font-bold text-[#f4f4f6] truncate">{path.title}</h3>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 max-w-xs bg-[#242527]" role="progressbar" aria-label="Your progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={path.percent}>
          <div className="h-full bg-[#3b82f6]" style={{ width: `${path.percent}%` }} />
        </div>
        <span className="text-xs text-[#94a3b8]">{progressText(path)}</span>
      </div>
      <p className="text-sm text-slate-300 truncate">Next: <span className="text-[#f4f4f6]">{next.index + 1}. {next.title}</span> <span className="text-xs text-[#94a3b8]">({kindLabel(next.kind)})</span></p>
      {others > 0 && <p className="text-xs text-[#94a3b8]">You have {others} more path{others === 1 ? '' : 's'} to finish in <Link to="/learning" className="text-[#93c5fd] hover:text-[#bfdbfe] hover:underline">My learning</Link>.</p>}
    </div>
    <Link to={learningHref(path.projectId, path.pathId, next.id)} className="shrink-0 h-10 px-5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold text-xs flex items-center justify-center gap-2">
      {path.done === 0 ? 'Start' : 'Continue'} <ArrowRight size={14} aria-hidden="true" />
    </Link>
  </section>;
}
