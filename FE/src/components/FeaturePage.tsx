import type { ReactNode } from 'react';
import { Alert } from 'antd';
import DashboardLayout from './layout/DashboardLayout';
import PageHeader from './PageHeader';
import { useT } from '@/i18n';

export const featurePanel = 'border border-[var(--at-line)] bg-[var(--at-panel)] p-5';
export function DemoNotice() {
  const t = useT();
  return <Alert type="info" showIcon title={t('common.demoTitle')} description={t('common.demoBody')} />;
}
/** `description` is one short line under the title; `details` holds the longer explanation, folded behind "Details". */
export default function FeaturePage({ title, description, details, children, actions, error, demo = false }: { title: string; description: ReactNode; details?: ReactNode; children: ReactNode; actions?: ReactNode; error?: string | null; demo?: boolean }) {
  return <DashboardLayout><div className="max-w-[1400px] mx-auto space-y-6">
    <PageHeader title={title} summary={description} details={details} actions={actions} />
    {demo && <DemoNotice />}
    {error && <Alert type="error" showIcon title={error} />}
    {children}
  </div></DashboardLayout>;
}
