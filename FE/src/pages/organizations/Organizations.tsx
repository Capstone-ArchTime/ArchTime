import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Empty, Form, Input, Modal, Skeleton, Tag } from 'antd';
import { Building2, Plus } from 'lucide-react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { DESCRIPTION_MAX, NAME_MAX, checkDescription, checkOrganizationName, createOrganization, listOrganizations } from '@/features/organizations-api';
import type { Organization } from '@/features/organizations-api';

/** The organizations the signed-in account belongs to, and a way to start one. */
export default function Organizations() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string; description?: string }>();

  useEffect(() => {
    const controller = new AbortController();
    listOrganizations(controller.signal)
      .then(list => setOrganizations([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load your organizations.'); });
    return () => controller.abort();
  }, [attempt]);

  async function create(values: { name: string; description?: string }) {
    setSaving(true);
    try {
      const org = await createOrganization({ name: values.name.trim(), description: values.description?.trim() || undefined });
      message.success(`${org.name} created. You are its owner.`);
      setCreating(false);
      form.resetFields();
      navigate(`/organizations/${encodeURIComponent(org.id)}`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not create the organization.');
    } finally {
      setSaving(false);
    }
  }

  const retry = () => { setError(null); setOrganizations(null); setAttempt(a => a + 1); };

  return (
    <FeaturePage
      title="Organizations"
      description="Share workspaces and repository credentials with a team. Owners add members and workspaces; members see the workspaces they are given a role in."
      demo={false}
      actions={<Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New organization</Button>}
    >
      {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={retry}>Retry</Button>} />
        : !organizations ? <Skeleton active paragraph={{ rows: 3 }} />
        : !organizations.length ? (
          <div className={featurePanel}>
            <Empty description="You do not belong to an organization yet. Start one to share workspaces and credentials with your team, or ask an owner to add you by your email.">
              <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New organization</Button>
            </Empty>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map(o => (
              <Link key={o.id} to={`/organizations/${encodeURIComponent(o.id)}`} className={`${featurePanel} block hover:border-[#3b82f6]/60 transition-colors`} aria-label={o.name}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-semibold break-words"><Building2 size={16} className="text-[#93c5fd] shrink-0" />{o.name}</h3>
                  <Tag color={o.myRole === 'owner' ? 'blue' : undefined}>{o.myRole === 'owner' ? 'Owner' : 'Member'}</Tag>
                </div>
                {o.description && <p className="mt-2 text-sm text-[#94a3b8] line-clamp-2">{o.description}</p>}
                <p className="mt-3 text-xs text-[#94a3b8]">{o.memberCount} {o.memberCount === 1 ? 'member' : 'members'}</p>
              </Link>
            ))}
          </div>
        )}

      <Modal title="New organization" open={creating} onCancel={() => setCreating(false)} onOk={() => form.submit()} okText="Create" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={create} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ validator: (_, v) => { const p = checkOrganizationName(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input maxLength={NAME_MAX} placeholder="e.g. Acme Software" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)" rules={[{ validator: (_, v) => { const p = checkDescription(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input.TextArea rows={3} maxLength={DESCRIPTION_MAX} showCount placeholder="What the team works on" />
          </Form.Item>
          <p className="text-xs text-[#94a3b8]">You become the owner. You can add members by the email of their ArchTime account.</p>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
