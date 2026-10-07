import { useEffect, useState } from 'react';
import { Button, Empty, Input, Select, Spin, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { getAdminAuditLogs } from '@/features/admin-api';
import type { AdminAuditLog } from '@/features/admin-api';

export default function AuditLog() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [revision, setRevision] = useState(0);

  const invalidRange = !!from && !!to && from > to;

  useEffect(() => {
    if (invalidRange) return;
    const controller = new AbortController();
    setLoading(true);
    getAdminAuditLogs(
      {
        query: query.trim() || undefined,
        type: type !== 'all' ? type : undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 100,
      },
      controller.signal
    )
      .then(res => {
        setLogs(res.data.logs);
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, type, query, from, to, invalidRange]);

  return (
    <FeaturePage
      title="Audit Log"
      description="Review the history of administrative actions."
      error={error}
      actions={<Button loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh</Button>}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Input.Search
          className="max-w-sm"
          aria-label="Search audit events"
          placeholder="Actor or description"
          value={query}
          onChange={e => setQuery(e.target.value)}
          allowClear
        />
        <Select
          aria-label="Event type"
          className="min-w-44"
          value={type}
          onChange={setType}
          options={['all', 'invitation', 'role_change', 'security', 'configuration', 'login', 'logout'].map(value => ({
            value,
            label: value === 'all' ? 'All events' : value.replace('_', ' '),
          }))}
        />
        <label className="text-xs text-[#94a3b8]">
          From
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-[#94a3b8]">
          To
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </label>
      </div>

      {invalidRange && (
        <p role="alert" className="text-red-400">
          The end date must be on or after the start date.
        </p>
      )}

      {loading && !logs.length ? (
        <div className="p-12 text-center">
          <Spin />
          <p className="mt-3 text-[#94a3b8]">Loading audit logs...</p>
        </div>
      ) : (
        <Table
          rowKey="id"
          dataSource={logs}
          loading={loading}
          scroll={{ x: 700 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
          locale={{
            emptyText: <Empty description={logs.length === 0 ? 'No audit events recorded.' : 'No matching events'} />,
          }}
          columns={[
            {
              title: 'Time',
              dataIndex: 'timestamp',
              render: at => new Date(at).toLocaleString(),
              width: 180,
            },
            {
              title: 'Event',
              dataIndex: 'type',
              render: t => <Tag>{t}</Tag>,
              width: 140,
            },
            {
              title: 'Actor',
              dataIndex: 'actor',
              width: 150,
            },
            {
              title: 'Description',
              dataIndex: 'description',
            },
          ]}
        />
      )}
    </FeaturePage>
  );
}
