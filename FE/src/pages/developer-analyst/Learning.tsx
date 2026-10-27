import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import FeaturePage from '@/components/FeaturePage';
import { useAuth } from '@/auth/auth-context';
import { useMaintainsWorkspaces } from '@/hooks/useMaintainsWorkspaces';
import ManagePaths from './learning/ManagePaths';
import MyPaths from './learning/MyPaths';

/** Learning paths: the ones given to you, and, for the workspaces you maintain, the ones you write and give to others. */
export default function Learning() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const maintains = useMaintainsWorkspaces(user?.id, !!user);
  // Until the server answers, the tab shows only when it was asked for, so a link to it does not open on the wrong tab.
  // Hiding it is presentation only: the server checks every request.
  const showManage = maintains ?? params.get('tab') === 'manage';
  const tab = showManage && params.get('tab') === 'manage' ? 'manage' : 'mine';
  return <FeaturePage
    title="Learning"
    description={showManage ? 'Follow the learning paths your mentors wrote for you, or write them for the workspaces you maintain.' : 'Follow the learning paths your mentors wrote for you.'}
    demo={false}
  >
    <Tabs
      activeKey={tab}
      onChange={key => setParams(key === 'manage' ? { tab: 'manage' } : {})}
      items={[
        { key: 'mine', label: 'My learning', children: <MyPaths /> },
        ...(showManage ? [{ key: 'manage', label: 'Manage paths', children: <ManagePaths /> }] : []),
      ]}
    />
  </FeaturePage>;
}
