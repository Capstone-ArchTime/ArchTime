import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Select, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { projects } from './workspace-store';
import { useSearchParams } from 'react-router-dom';

export function WorkspacePage({ title, description, children }: { title: string; description: string; children: (project: string, onDirtyChange: (dirty: boolean) => void) => ReactNode }) {
  const [params] = useSearchParams();
  const requested = params.get('project');
  const [project, setProject] = useState(requested && projects.includes(requested) ? requested : projects[0]);
  const [dirty, setDirty] = useState(false);
  const { modal } = App.useApp();
  function changeProject(next: string) {
    const proceed = () => { setDirty(false); setProject(next); };
    if (!dirty) { proceed(); return; }
    modal.confirm({ title: 'Switch project without saving?', content: 'The current diagram has unsaved changes.', okText: 'Discard and switch', cancelText: 'Keep editing', okButtonProps: { danger: true }, onOk: proceed });
  }
  return <DashboardLayout><div className="max-w-[1400px] mx-auto space-y-6">
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-[#222c37] pb-6">
      <div><p className="text-xs uppercase tracking-widest text-[#38bdf8] mb-3">Project maintainer / Architecture governance</p><h2 className="text-3xl font-bold mb-2">{title}</h2><p className="text-sm text-[#94a3b8] max-w-2xl">{description}</p></div>
      <div className="w-full lg:w-64 shrink-0"><label htmlFor="maintainer-project" className="block text-xs text-[#94a3b8] mb-2">Project</label><Select id="maintainer-project" className="w-full" value={project} onChange={changeProject} options={projects.map(p => ({ value: p, label: p }))} /></div>
    </header>
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#94a3b8]"><Tag color="blue">Local workspace</Tag>Sample diagram to get started. Changes are saved in this browser only.</div>
    <div key={project}>{children(project, setDirty)}</div>
  </div></DashboardLayout>;
}

export function StorageError({ visible }: { visible: boolean }) {
  return visible ? <Alert type="error" showIcon title="Saved workspace could not be loaded. Saving is disabled to protect existing data." className="mb-5" /> : null;
}
