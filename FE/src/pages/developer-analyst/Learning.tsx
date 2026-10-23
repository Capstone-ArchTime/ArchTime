import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import FeaturePage from '@/components/FeaturePage';
import ManagePaths from './learning/ManagePaths';
import MyPaths from './learning/MyPaths';

/** Learning paths: the ones given to you, and, for the workspaces you maintain, the ones you write and give to others. */
export default function Learning() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'manage' ? 'manage' : 'mine';
  return <FeaturePage title="Learning" description="Follow the learning paths your mentors wrote for you, or write them for the workspaces you maintain." demo={false}>
    <Tabs
      activeKey={tab}
      onChange={key => setParams(key === 'manage' ? { tab: 'manage' } : {})}
      items={[
        { key: 'mine', label: 'My learning', children: <MyPaths /> },
        { key: 'manage', label: 'Manage paths', children: <ManagePaths /> },
      ]}
    />
  </FeaturePage>;
}
