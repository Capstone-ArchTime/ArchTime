import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Select, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { projects as fallbackDemoProjects } from './workspace-store';
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
  const [project, setProject] = useState(requested || fallbackDemoProjects[0]);
  const [dirty, setDirty] = useState(false);
  const { modal } = App.useApp();

  useEffect(() => {
    let active = true;
    getProjects()
      .then((list) => {
        if (active && list.length) {
          setServerProjects(list);
          if (!requested) {
            setProject(list[0].id);
          }
        }
      })
      .catch(() => {
        // Demo or offline fallback
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

  const isServerProject =
    /^[0-9a-fA-F]{24}$/.test(project) || serverProjects.some((p) => p.id === project);

  const selectOptions = [
    ...serverProjects.map((p) => ({ value: p.id, label: `${p.name} (Cloud)` })),
    ...fallbackDemoProjects
      .filter((d) => !serverProjects.some((sp) => sp.name.toLowerCase() === d.toLowerCase()))
      .map((p) => ({ value: p, label: `${p} (Sample)` })),
  ];

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
              value={project}
              onChange={changeProject}
              options={selectOptions.length ? selectOptions : fallbackDemoProjects.map((p) => ({ value: p, label: p }))}
            />
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#94a3b8]">
          {isServerProject ? (
            <>
              <Tag color="green">API Synchronized</Tag>
              Persistent architecture workspace with Optimistic Concurrency Control (OCC revision tracking).
            </>
          ) : (
            <>
              <Tag color="blue">Local workspace</Tag>
              Sample diagram to get started. Changes are saved in this browser only.
            </>
          )}
        </div>
        <div key={project}>{children(project, setDirty)}</div>
      </div>
    </DashboardLayout>
  );
}

export function StorageError({ visible, message, onRetry }: { visible: boolean; message?: string | null; onRetry?: () => void }) {
  if (!visible) return null;
  return message ? (
    <Alert
      type="error"
      showIcon
      title="This workspace could not be loaded from the server. Editing is disabled until it loads."
      description={message}
      action={onRetry && <Button size="small" onClick={onRetry}>Retry</Button>}
      className="mb-5"
    />
  ) : (
    <Alert
      type="error"
      showIcon
      title="Saved workspace could not be loaded. Saving is disabled to protect existing data."
      className="mb-5"
    />
  );
}

/** Shown after a save was rejected because the workspace changed since it was loaded. Loading the latest version discards the draft. */
export function ConflictAlert({ error, dirty, onReload }: { error: string | null; dirty?: boolean; onReload: () => void }) {
  const { modal } = App.useApp();
  if (!error) return null;
  const reload = () => dirty
    ? modal.confirm({
      title: 'Load the latest version?',
      content: 'Your unsaved changes will be discarded. Copy anything you want to keep before continuing.',
      okText: 'Discard and load latest',
      okButtonProps: { danger: true },
      onOk: onReload,
    })
    : onReload();
  return (
    <Alert
      type="error"
      showIcon
      title="Not saved: this workspace was changed by someone else"
      description={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
          <span>{error} Your changes were kept here but not saved.</span>
          <Button size="small" danger onClick={reload}>Load latest version</Button>
        </div>
      }
    />
  );
}
