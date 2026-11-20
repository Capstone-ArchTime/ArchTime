import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Segmented, Switch } from 'antd';
import { Globe, LayoutPanelLeft, UserRound } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PageHeader from '@/components/PageHeader';
import { LANGUAGES, setLanguage, translate, useLanguage, useT, type Language } from '@/i18n';
import { readDiagramTheme, readSidebarCollapsed, resetDiagramPanels, writeDiagramTheme, writeSidebarCollapsed, type DiagramTheme } from '@/features/display-prefs';

/** One block of the page: an icon, a heading and its controls. */
function Section({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="rounded-2xl border border-[var(--at-line)] bg-[var(--at-panel)] p-6">
    <h3 id={id} className="mb-5 flex items-center gap-2 text-base font-semibold text-[var(--at-text)]">{icon}{title}</h3>
    <div className="space-y-6">{children}</div>
  </section>;
}

/** A setting: its name and a line of help on the left, the control on the right (below on narrow screens). */
function Row({ label, help, htmlFor, children }: { label: string; help: string; htmlFor?: string; children: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
    <div className="min-w-0">
      {htmlFor ? <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--at-text)]">{label}</label> : <p className="text-sm font-medium text-[var(--at-text)]">{label}</p>}
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--at-muted)]">{help}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>;
}

/**
 * Personal settings: how ArchTime looks for this person in this browser. Who they are (name, password, sign-in methods)
 * stays on the profile page.
 */
export default function Settings() {
  const t = useT();
  const language = useLanguage();
  const { message } = App.useApp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [diagramTheme, setDiagramTheme] = useState<DiagramTheme>(readDiagramTheme);

  const chooseLanguage = async (next: Language) => {
    await setLanguage(next);
    message.success(translate('settings.language.changed', undefined, next));
  };

  return <DashboardLayout>
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('settings.title')} summary={t('settings.summary')} />

      <Section id="settings-language" icon={<Globe size={17} aria-hidden="true" className="text-[var(--at-link)]" />} title={t('settings.language.title')}>
        <Row label={t('language.label')} help={t('settings.language.help')}>
          <Segmented<Language> value={language} onChange={value => void chooseLanguage(value)} aria-label={t('language.label')}
            options={LANGUAGES.map(option => ({ value: option.code, label: <span lang={option.code}>{option.name}</span> }))} />
        </Row>
        {language === 'vi' && <Alert type="info" showIcon title={t('settings.language.notYet')} />}
      </Section>

      <Section id="settings-display" icon={<LayoutPanelLeft size={17} aria-hidden="true" className="text-[var(--at-link)]" />} title={t('settings.display.title')}>
        <Row label={t('settings.display.sidebar')} help={t('settings.display.sidebarHelp')} htmlFor="settings-sidebar">
          <Switch id="settings-sidebar" checked={sidebarCollapsed} onChange={checked => { writeSidebarCollapsed(checked); setSidebarCollapsed(checked); }} />
        </Row>
        <Row label={t('settings.display.diagram')} help={t('settings.display.diagramHelp')}>
          <Segmented<DiagramTheme> value={diagramTheme} aria-label={t('settings.display.diagram')}
            onChange={value => { writeDiagramTheme(value); setDiagramTheme(value); }}
            options={[{ value: 'dark', label: t('settings.display.dark') }, { value: 'light', label: t('settings.display.light') }]} />
        </Row>
        <Row label={t('settings.display.resetLayout')} help={t('settings.display.resetLayoutHelp')}>
          <Button onClick={() => { resetDiagramPanels(); message.success(t('settings.display.resetDone')); }}>{t('settings.display.resetLayout')}</Button>
        </Row>
      </Section>

      <Section id="settings-account" icon={<UserRound size={17} aria-hidden="true" className="text-[var(--at-link)]" />} title={t('settings.account.title')}>
        <p className="text-sm text-[var(--at-muted)]">
          {t('settings.account.body')} <Link to="/profile" className="text-[var(--at-link)] hover:underline">{t('settings.account.link')}</Link>
        </p>
      </Section>
    </div>
  </DashboardLayout>;
}
