import { Check, Circle } from 'lucide-react';
import { passwordRequirements } from '@/features/profile-validation';

/** The server's password rules under a new-password field, each ticked off as it is met. */
export default function PasswordRequirements({ id, password }: { id: string; password: string }) {
  const rules = passwordRequirements(password);
  const met = rules.filter(rule => rule.met).length;
  return <div id={id} className="mt-2 rounded border border-[#242527] bg-[#11161b] p-3">
    <div className="mb-2 flex gap-1" aria-hidden="true">
      {rules.map((rule, index) => <div key={rule.label} className={`h-1 flex-1 transition-colors ${index < met ? (met === rules.length ? 'bg-green-400' : 'bg-amber-400') : 'bg-[#242527]'}`} />)}
    </div>
    <p className="mb-1.5 text-xs text-slate-300">Your password needs:</p>
    <ul className="grid gap-1 sm:grid-cols-2">
      {rules.map(rule => <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.met ? 'text-green-300' : 'text-slate-400'}`}>
        {rule.met ? <Check size={13} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" />}
        <span>{rule.label}<span className="sr-only">{rule.met ? ' (done)' : ' (missing)'}</span></span>
      </li>)}
    </ul>
  </div>;
}
