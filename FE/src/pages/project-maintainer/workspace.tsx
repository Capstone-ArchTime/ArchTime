import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Empty, Select, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useSearchParams } from 'react-router-dom';
import { getProjects, type ProjectSummary } from '@/features/project-data';

export function WorkspacePage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (project: string, onDirtyChange: (dirty: boolean) => void) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('project') || params.get('projectId');
  const [serverProjects, setServerProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [project, setProject] = useState(requested ?? '');
  const [dirty, setDirty] = useState(false);
  const { modal } = App.useApp();

  useEffect(() => {
    let active = true;
    getProjects()
      .then((list) => {
        if (!active) return;
        setServerProjects(list);
        setStatus('ready');
        if (!requested && list.length) setProject(list[0].id);
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [requested]);

  function changeProject(next: string) {
    const proceed = () => {
      setDirty(false);
      setProject(next);
      setParams({ project: next });
    };
    if (!dirty) {
      proceed();
      return;
    }
    modal.confirm({
      title: 'Switch workspace without saving?',
      content: 'The current diagram has unsaved changes.',
      okText: 'Discard and switch',
      cancelText: 'Keep editing',
      okButtonProps: { danger: true },
      onOk: proceed,
    });
  }

  const options = serverProjects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-[#242527] pb-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#3b82f6] mb-3">
              Project maintainer / Architecture governance
            </p>
            <h2 className="text-3xl font-bold mb-2">{title}</h2>
            <p className="text-sm text-[#94a3b8] max-w-2xl">{description}</p>
          </div>
          <div className="w-full lg:w-64 shrink-0">
            <label htmlFor="maintainer-project" className="block text-xs text-[#94a3b8] mb-2">
              Workspace
            </label>
            <Select
              id="maintainer-project"
              className="w-full"
              value={project || undefined}
              onChange={changeProject}
              options={options}
              loading={status === 'loading'}
              disabled={!options.length}
              placeholder={status === 'loading' ? 'Loading workspaces…' : 'No workspaces'}
            />
          </div>
        </header>
        {status === 'error' && (
          <Alert type="error" showIcon title="Workspaces could not be loaded. Check your connection and reload the page." />
        )}
        {status === 'ready' && !project && (
          <Empty description="No workspaces yet. A workspace appears here once a repository has been registered." />
        )}
        {project && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#94a3b8]">
              <Tag color="green">API Synchronized</Tag>
              Persistent architecture workspace with Optimistic Concurrency Control (OCC revision tracking).
            </div>
            <div key={project}>{children(project, setDirty)}</div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export function StorageError({ visible }: { visible: boolean }) {
  return visible ? (
    <Alert
      type="error"
      showIcon
      title="Saved workspace could not be loaded. Saving is disabled to protect existing data."
      className="mb-5"
    />
  ) : null;
}
