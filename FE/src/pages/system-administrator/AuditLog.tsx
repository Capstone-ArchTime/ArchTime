import { useState } from 'react';
import { Empty, Input, Select, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { useAdminDemo } from '@/features/admin-demo';

export default function AuditLog() {
  const { data, error } = useAdminDemo();
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const invalidRange = !!from && !!to && from > to;
  const rows = data.events.filter(e => !invalidRange && (type === 'all' || e.type === type) && `${e.actor} ${e.description}`.toLowerCase().includes(query.toLowerCase()) && (!from || new Date(e.at) >= new Date(`${from}T00:00:00`)) && (!to || new Date(e.at) <= new Date(`${to}T23:59:59.999`)));
  return <FeaturePage title="Audit Log" description="Review the local history of administrative actions. This demo history is not a server security audit." error={error}>
    <div className="flex flex-wrap items-end gap-3"><Input.Search className="max-w-sm" aria-label="Search audit events" placeholder="Actor or description" value={query} onChange={e => setQuery(e.target.value)} allowClear /><Select aria-label="Event type" className="min-w-44" value={type} onChange={setType} options={['all', 'invitation', 'role_change', 'security', 'configuration'].map(value => ({ value, label: value === 'all' ? 'All events' : value.replace('_', ' ') }))} /><label className="text-xs text-[#94a3b8]">From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs text-[#94a3b8]">To<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    {invalidRange && <p role="alert" className="text-red-400">The end date must be on or after the start date.</p>}
    <Table rowKey="id" dataSource={rows} scroll={{ x: 700 }} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty description={data.events.length ? 'No matching events' : 'No local events yet. Try inviting a demo user or saving settings.'} /> }} columns={[
      { title: 'Time', dataIndex: 'at', render: at => new Date(at).toLocaleString() }, { title: 'Event', dataIndex: 'type', render: type => <Tag>{type}</Tag> }, { title: 'Actor', dataIndex: 'actor' }, { title: 'Description', dataIndex: 'description' },
    ]} />
  </FeaturePage>;
}
