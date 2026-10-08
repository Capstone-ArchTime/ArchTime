import type { ReactNode } from 'react';
import { Alert } from 'antd';
import DashboardLayout from './layout/DashboardLayout';

export const featurePanel = 'border border-[#242527] bg-[#11161b] p-5';
export function DemoNotice() {
  return <Alert type="info" showIcon title="Local demo" description="Changes are saved in this browser for your account only. Invitations are not sent and server data is not changed." />;
}
export default function FeaturePage({ title, description, children, actions, error, demo = true }: { title: string; description: string; children: ReactNode; actions?: ReactNode; error?: string | null; demo?: boolean }) {
  return <DashboardLayout><div className="max-w-[1400px] mx-auto space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#242527] pb-6"><div><h2 className="text-3xl font-bold mb-2">{title}</h2><p className="text-sm text-[#94a3b8] max-w-2xl">{description}</p></div>{actions}</header>
    {demo && <DemoNotice />}
    {error && <Alert type="error" showIcon title={error} />}
    {children}
  </div></DashboardLayout>;
}
