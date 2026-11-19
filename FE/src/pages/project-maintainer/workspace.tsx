import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Select } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PageHeader from '@/components/PageHeader';
import { useSearchParams } from 'react-router-dom';
import type { ProjectSummary } from '@/features/project-data';
import { ManagedWorkspaces } from './managed';
import { pickWorkspace } from './managed-access';

/** `description` is one short line under the title; `details` holds the longer explanation, folded behind "Details". */
export function WorkspacePage(props: {
  title: string;
  description: string;
  details?: ReactNode;
  children: (project: string, onDirtyChange: (dirty: boolean) => void) => ReactNode;
}) {
  return <ManagedWorkspaces title={props.title}>{projects => <WorkspaceView {...props} projects={projects} />}</ManagedWorkspaces>;
}

function WorkspaceView({
  title,
  description,
  details,
  children,
  projects,
}: {
  title: string;
  description: string;
  details?: ReactNode;
  children: (project: string, onDirtyChange: (dirty: boolean) => void) => ReactNode;
  projects: ProjectSummary[];
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('project') || params.get('projectId');
  const [project, setProject] = useState(() => pickWorkspace(projects, requested));
  const [dirty, setDirty] = useState(false);
  const { modal } = App.useApp();
  const notMaintained = !!requested && !projects.some(p => p.id === requested);

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

  const options = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6">
        <PageHeader title={title} summary={description} details={details} actions={
          <div className="w-full lg:w-64">
            <label htmlFor="maintainer-project" className="block text-xs text-[var(--at-muted)] mb-2">
              Workspace
            </label>
            <Select
              id="maintainer-project"
              className="w-full"
              value={project}
              onChange={changeProject}
              options={options}
            />
          </div>
        } />
        {notMaintained && project !== requested && (
          <Alert type="warning" showIcon title="You do not maintain the workspace in this link, so one you maintain is shown instead." />
        )}
        <div key={project}>{children(project, setDirty)}</div>
      </div>
    </DashboardLayout>
  );
}

export function StorageError({ visible, message, onRetry }: { visible: boolean; message?: string | null; onRetry?: () => void }) {
  if (!visible) return null;
  return (
    <Alert
      type="error"
      showIcon
      title="This workspace could not be loaded from the server. Editing is disabled until it loads."
      description={message ?? undefined}
      action={onRetry && <Button size="small" onClick={onRetry}>Retry</Button>}
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
