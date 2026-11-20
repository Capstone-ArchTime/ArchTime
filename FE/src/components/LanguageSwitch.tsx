import { useAuth } from '@/auth/auth-context';
import { saveAccountLanguage } from '@/features/profile-api';
import { LANGUAGES, setLanguage, useLanguage, useT, type Language } from '@/i18n';

/**
 * EN | VI, for pages a signed-out visitor sees (landing, sign-in), where the Settings page cannot be reached. Each
 * option is written in its own language and marked as pressed when current. Someone still signed in has the choice
 * saved to their account too, as on the Settings page.
 */
export default function LanguageSwitch({ className = '' }: { className?: string }) {
  const language = useLanguage();
  const t = useT();
  const { user, updateUser } = useAuth();
  const choose = async (next: Language) => {
    await setLanguage(next);
    if (!user) return;
    try { await saveAccountLanguage(next); updateUser({ language: next }); } catch { /* kept in this browser; Settings can save it later */ }
  };
  return <div role="group" aria-label={t('language.switchTo')} className={`inline-flex rounded-full border border-[var(--at-line)] bg-[var(--at-panel)]/70 p-0.5 text-[11px] font-semibold tracking-widest ${className}`}>
    {LANGUAGES.map(option => {
      const active = option.code === language;
      return <button key={option.code} type="button" lang={option.code} aria-pressed={active} title={option.name}
        onClick={() => { if (!active) void choose(option.code); }}
        className={`rounded-full px-2.5 py-1 transition-colors ${active ? 'bg-[var(--at-fill)] text-[var(--at-on-fill)]' : 'text-[var(--at-muted)] hover:text-white'}`}>
        <span aria-hidden="true">{option.short}</span><span className="sr-only">{option.name}</span>
      </button>;
    })}
  </div>;
}
