import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Skeleton, Table } from 'antd';
import type { Dayjs } from 'dayjs';
import { featurePanel } from '@/components/FeaturePage';
import { getAiCost } from '@/features/organizations-api';
import type { AiCostReport, Organization } from '@/features/organizations-api';

/**
 * UC-30: AI tokens and cost of the organization, per workspace, for a period. Every AI run in the organization's workspaces
 * is charged to it. There is deliberately no per-member view: roles only control access.
 */
export default function AiCostTab({ organization }: { organization: Organization }) {
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [report, setReport] = useState<AiCostReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const day = (d: Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : undefined);
    getAiCost(organization.id, { from: day(range?.[0]), to: day(range?.[1]) }, controller.signal)
      .then(r => { setError(null); setReport(r); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the AI cost.'); });
    return () => controller.abort();
  }, [organization.id, range, attempt]);

  const money = (amount: number, currency: string) => `${amount.toFixed(4)} ${currency}`;
  const tokens = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--at-muted)]">Every AI run in this organization's workspaces is charged to it. Costs are shown per workspace, never per member.</p>
        <DatePicker.RangePicker allowEmpty={[true, true]} onChange={v => setRange(v ? [v[0], v[1]] : null)} aria-label="Period" />
      </div>
      {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setAttempt(a => a + 1)}>Retry</Button>} />
        : !report ? <Skeleton active paragraph={{ rows: 3 }} />
        : !report.projects.length ? <div className={featurePanel}><Empty description="No AI runs in this period." /></div>
        : (
          <div className={featurePanel}>
            <Table
              size="small" rowKey="projectId" pagination={false} dataSource={report.projects}
              columns={[
                { title: 'Workspace', dataIndex: 'projectName' },
                { title: 'Runs', dataIndex: 'runs', align: 'right' },
                { title: 'Input tokens', dataIndex: 'inputTokens', align: 'right', render: tokens },
                { title: 'Output tokens', dataIndex: 'outputTokens', align: 'right', render: tokens },
                { title: 'Cost', key: 'cost', align: 'right', render: (_, r) => money(r.cost, r.currency) },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">{report.total.runs}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">{tokens(report.total.inputTokens)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">{tokens(report.total.outputTokens)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><b>{money(report.total.cost, report.total.currency)}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        )}
    </div>
  );
}
