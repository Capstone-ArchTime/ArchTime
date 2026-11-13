import type { ReactNode } from 'react';
import { Alert } from 'antd';
import DashboardLayout from './layout/DashboardLayout';

export const featurePanel = 'border border-[var(--at-line)] bg-[var(--at-panel)] p-5';
export function DemoNotice() {
  return <Alert type="info" showIcon title="Local demo" description="Changes are saved in this browser for your account only. Invitations are not sent and server data is not changed." />;
}
export default function FeaturePage({ title, description, children, actions, error, demo = false }: { title: string; description: string; children: ReactNode; actions?: ReactNode; error?: string | null; demo?: boolean }) {
  return <DashboardLayout><div className="max-w-[1400px] mx-auto space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--at-line)] pb-6"><div><h2 className="text-3xl font-bold mb-2">{title}</h2><p className="text-sm text-[var(--at-muted)] max-w-2xl">{description}</p></div>{actions}</header>
    {demo && <DemoNotice />}
    {error && <Alert type="error" showIcon title={error} />}
    {children}
  </div></DashboardLayout>;
}
