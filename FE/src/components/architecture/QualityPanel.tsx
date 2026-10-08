import { useState } from 'react';
import { App, Button, Input, Modal, Tooltip } from 'antd';
import { Target } from 'lucide-react';
import { getReference, saveReference } from '@/features/architecture/api';
import type { ReferenceComponent, ViewQuality } from '@/features/architecture/api';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (x: number) => (x >= 0.8 ? 'text-[#4ade80]' : x >= 0.5 ? 'text-[#facc15]' : 'text-[#f87171]');

/** "Name: prefix, prefix" per line, the format of the reference editor. */
function formatReference(components: ReferenceComponent[]) {
  return components.map(c => `${c.name}: ${c.prefixes.join(', ')}`).join('\n');
}
function parseReference(text: string): { components: ReferenceComponent[]; errors: string[] } {
  const components: ReferenceComponent[] = [];
  const errors: string[] = [];
  text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).forEach((line, i) => {
    const at = line.indexOf(':');
    const name = at > 0 ? line.slice(0, at).trim() : '';
    const prefixes = at > 0 ? line.slice(at + 1).split(',').map(p => p.trim()).filter(Boolean) : [];
    if (!name || !prefixes.length) errors.push(`Line ${i + 1}: write "Name: path/prefix, other/prefix".`);
    else components.push({ name, prefixes });
  });
  return { components, errors };
}

/** A starting point: each current component with the folder its files share. */
function suggest(view: { components: { name: string; memberIds: string[] }[] }) {
  const common = (paths: string[]) => {
    const parts = paths.map(p => p.split('/').slice(0, -1));
    const out: string[] = [];
    for (let i = 0; parts.length && parts.every(p => p[i] !== undefined && p[i] === parts[0][i]); i++) out.push(parts[0][i]);
    return out.length ? `${out.join('/')}/` : '';
  };
  return view.components.filter(c => c.memberIds.length).map(c => ({ name: c.name, prefixes: [common(c.memberIds) || c.memberIds[0]] }));
}

function Measure({ label, value, hint }: { label: string; value: number | undefined; hint: string }) {
  return <Tooltip title={hint}>
    <div className="min-w-24">
      <p className="text-[11px] uppercase tracking-wider text-[#94a3b8]">{label}</p>
      <p className={`font-mono text-lg ${value === undefined ? 'text-[#94a3b8]' : tone(value)}`}>{value === undefined ? '–' : pct(Math.max(0, value))}</p>
    </div>
  </Tooltip>;
}

/**
 * How meaningful the drawing is: names supported by the paths, no dependency loops, layers respected, sizes balanced,
 * and, when known, agreement with the team's reference architecture and stability against the previous snapshot.
 */
export default function QualityPanel({ projectId, quality, view, onSaved }: {
  projectId: string; quality: ViewQuality; view: { components: { name: string; memberIds: string[] }[] }; onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = editing === null ? null : parseReference(editing);

  async function open() {
    try {
      const current = await getReference(projectId);
      setEditing(formatReference(current.length ? current : suggest(view)));
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not load the reference.'); }
  }
  async function save() {
    if (!parsed || parsed.errors.length) return;
    setSaving(true);
    try { await saveReference(projectId, parsed.components); setEditing(null); message.success(parsed.components.length ? 'Reference saved. Views are now scored against it.' : 'Reference removed.'); onSaved(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not save the reference.'); }
    finally { setSaving(false); }
  }

  const q = quality;
  return <section className="rounded border border-[#242527] bg-[#11161b] px-4 py-3" aria-label="Architecture quality">
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <Measure label="Grounded names" value={q.grounding.score} hint="Share of component names that the file paths inside support. Low values mean invented or vague names." />
      <Measure label="No cycles" value={q.acyclicity.score} hint="Share of components not caught in a dependency loop with other components." />
      <Measure label="Layering" value={q.layering.score} hint="Share of dependencies between layered roles that point down (controller → service → entity → repository)." />
      <Measure label="Balance" value={q.balance} hint="How evenly files are spread over components; low when one component holds most files." />
      <Measure label="Matches reference" value={q.agreement?.score} hint={q.agreement ? `Adjusted Rand index against your reference architecture over ${q.agreement.common} files. 100% = same grouping.` : 'Set a reference architecture to score this.'} />
      <Measure label="Stable vs previous" value={q.stability?.score} hint={q.stability ? `Adjusted Rand index against the previous snapshot's components over ${q.stability.common} files.` : 'No earlier snapshot has components yet.'} />
      <Button size="small" className="ml-auto self-center" icon={<Target size={13} />} onClick={() => void open()}>Reference architecture</Button>
    </div>
    {(q.grounding.ungrounded.length > 0 || q.acyclicity.cycles.length > 0 || q.layering.violations.length > 0) && <ul className="mt-2 list-disc pl-5 text-xs text-[#94a3b8] space-y-0.5">
      {q.grounding.ungrounded.length > 0 && <li>Names the paths do not support: {q.grounding.ungrounded.map(n => `"${n}"`).join(', ')}</li>}
      {q.acyclicity.cycles.length > 0 && <li>{q.acyclicity.cycles.length} dependency loop{q.acyclicity.cycles.length > 1 ? 's' : ''} between components</li>}
      {q.layering.violations.length > 0 && <li>{q.layering.violations.length} dependenc{q.layering.violations.length > 1 ? 'ies point' : 'y points'} up the layers</li>}
    </ul>}
    <Modal open={editing !== null} title="Reference architecture" okText="Save" confirmLoading={saving} okButtonProps={{ disabled: !!parsed?.errors.length }} onOk={() => void save()} onCancel={() => setEditing(null)} width={680} destroyOnHidden>
      <p className="text-sm text-[#94a3b8] mb-2">How your team sees the system: one component per line, <code>Name: path/prefix, other/prefix</code>. Files go to the component with the longest matching prefix; files no prefix matches are not scored. Leave it empty to remove the reference. The suggestion below comes from the current drawing; edit it to match reality.</p>
      <Input.TextArea value={editing ?? ''} onChange={e => setEditing(e.target.value)} autoSize={{ minRows: 8, maxRows: 18 }} className="font-mono text-xs" aria-label="Reference architecture" />
      {parsed?.errors.length ? <ul className="mt-2 text-xs text-red-400">{parsed.errors.slice(0, 5).map(e => <li key={e}>{e}</li>)}</ul> : null}
    </Modal>
  </section>;
}
