import { useEffect, useState } from 'react';
import { Button, Empty, Input, Select, Spin, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { tablePanel } from './admin-ui';
import { getAdminAuditLogs } from '@/features/admin-api';
import type { AdminAuditLog } from '@/features/admin-api';
import { AUDIT_TYPES } from '@/features/admin-audit';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  title: 'Audit Log', intro: 'Review the history of administrative actions.', refresh: 'Refresh', search: 'Search audit events', searchPlaceholder: 'Actor or description', type: 'Event type',
  allEvents: 'All events', from: 'From', to: 'To', badRange: 'The end date must be on or after the start date.', loading: 'Loading audit logs...', noMatch: 'No matching events',
  none: 'No audit events recorded.', time: 'Time', event: 'Event', actor: 'Actor', description: 'Description',
}, {
  title: 'Nhật ký kiểm toán', intro: 'Xem lịch sử các thao tác quản trị.', refresh: 'Làm mới', search: 'Tìm sự kiện', searchPlaceholder: 'Người thực hiện hoặc mô tả', type: 'Loại sự kiện',
  allEvents: 'Mọi sự kiện', from: 'Từ', to: 'Đến', badRange: 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.', loading: 'Đang tải nhật ký...', noMatch: 'Không có sự kiện nào khớp',
  none: 'Chưa ghi nhận sự kiện nào.', time: 'Thời gian', event: 'Sự kiện', actor: 'Người thực hiện', description: 'Mô tả',
});

const typeLabel = (type: string) => type.replace('_', ' ');

export default function AuditLog() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [revision, setRevision] = useState(0);
  const m = useMessages(MSG);

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
      title={m('title')}
      description={m('intro')}
      error={error}
      actions={<Button loading={loading} onClick={() => setRevision(v => v + 1)}>{m('refresh')}</Button>}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Input.Search
          className="max-w-sm"
          aria-label={m('search')}
          placeholder={m('searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          allowClear
        />
        <Select
          aria-label={m('type')}
          className="min-w-44"
          value={type}
          onChange={setType}
          options={['all', ...AUDIT_TYPES].map(value => ({
            value,
            label: value === 'all' ? m('allEvents') : typeLabel(value),
          }))}
        />
        <label className="text-xs text-[var(--at-muted)]">
          {m('from')}
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-[var(--at-muted)]">
          {m('to')}
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </label>
      </div>

      {invalidRange && (
        <p role="alert" className="text-[var(--at-danger)]">
          {m('badRange')}
        </p>
      )}

      {loading && !logs.length ? (
        <div className="p-12 text-center">
          <Spin />
          <p className="mt-3 text-[var(--at-muted)]">{m('loading')}</p>
        </div>
      ) : (
        <div className={tablePanel}>
          <Table
            rowKey="id"
            dataSource={logs}
            loading={loading}
            scroll={{ x: 700 }}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
            locale={{
              emptyText: <Empty description={query.trim() || type !== 'all' || from || to ? m('noMatch') : m('none')} />,
            }}
            columns={[
              {
                title: m('time'),
                dataIndex: 'timestamp',
                render: (at: string) => (at && !Number.isNaN(Date.parse(at)) ? formatDateTime(at) : '—'),
                width: 180,
              },
              {
                title: m('event'),
                dataIndex: 'type',
                render: (t: string, log: AdminAuditLog) => <Tag title={log.action}>{typeLabel(t)}</Tag>,
                width: 140,
              },
              {
                title: m('actor'),
                dataIndex: 'actor',
                width: 150,
              },
              {
                title: m('description'),
                dataIndex: 'description',
              },
            ]}
          />
        </div>
      )}
    </FeaturePage>
  );
}
