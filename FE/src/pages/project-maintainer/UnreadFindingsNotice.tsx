import { Link } from 'react-router-dom';
import { Alert } from 'antd';
import { unreadMessage, useUnreadFindings } from '@/features/unread-findings';
import { useMessages } from '@/i18n/define';
import { MAINT } from './messages';

/** MSG26 on the maintainer overview: new conformance findings, with a link to each workspace that has some. */
export function UnreadFindingsNotice() {
  // Only shown on maintainer pages, so the person maintains at least one workspace.
  const unread = useUnreadFindings(true);
  const text = unreadMessage(unread);
  const m = useMessages(MAINT);
  if (!text) return null;
  return <Alert type="warning" showIcon role="status" title={text}
    description={<ul className="flex flex-wrap gap-x-4 gap-y-1">
      {unread.projects.map(p => <li key={p.projectId}>
        <Link to={`/project-maintainer/conformance?project=${encodeURIComponent(p.projectId)}`}>{m('newCount', { name: p.projectName, count: p.count })}</Link>
      </li>)}
    </ul>} />;
}
