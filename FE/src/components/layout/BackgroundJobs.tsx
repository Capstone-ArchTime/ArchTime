import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Popover, Progress } from 'antd';
import { LoaderCircle } from 'lucide-react';
import { ACTIVE, configureJobs, jobLink, jobNotice, kindLabel, refreshJobs, useBackgroundJobs } from '@/features/background-jobs';

/**
 * Header indicator of work running on the server (mining, scans, the conformance check, architecture maps), so people
 * can start something long and keep working: it lists what is running, and tells whoever started a job when it ends.
 */
export default function BackgroundJobs({ userId }: { userId: string | undefined }) {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const jobs = useBackgroundJobs();

  useEffect(() => {
    configureJobs(userId, ended => {
      for (const job of ended) {
        const { kind, title, description } = jobNotice(job);
        notification[kind]({
          key: job.id, title, description, placement: 'bottomRight', duration: kind === 'success' ? 8 : 0,
          actions: <Button size="small" onClick={() => { notification.destroy(job.id); navigate(jobLink(job)); }}>Open</Button>,
        });
      }
    });
    void refreshJobs();
    return () => configureJobs(userId, null);
  }, [userId, notification, navigate]);

  const running = jobs.filter(j => ACTIVE.includes(j.status));
  if (!running.length) return null;
  const content = <ul className="w-72 max-w-[80vw] space-y-3" aria-label="Background jobs">
    {running.map(j => <li key={j.id} className="space-y-1">
      <p className="text-sm font-medium break-words">{kindLabel(j.kind)} · <Link to={jobLink(j)}>{j.project}</Link></p>
      <p className="text-xs text-[var(--at-muted)] break-words">{j.status === 'queued' ? 'Waiting to start' : j.stage || 'Running'}</p>
      <Progress percent={Math.round(j.progress)} size="small" status="active" showInfo={false} />
    </li>)}
    <li className="text-xs text-[var(--at-muted)]">These run on the server: keep working, you will be told when yours end.</li>
  </ul>;
  return <Popover content={content} title="Running in the background" trigger="click" placement="bottomRight">
    <button type="button" aria-label={`${running.length} background job${running.length === 1 ? '' : 's'} running`}
      className="flex items-center gap-2 border border-[var(--at-line)] bg-[var(--at-panel)] rounded h-10 px-3 text-xs text-[var(--at-text)] hover:border-[var(--at-accent)]/50">
      <LoaderCircle size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      <span>{running.length} running</span>
    </button>
  </Popover>;
}
