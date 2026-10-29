import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { App, Button, Input, Modal, Tooltip } from 'antd';
import { Target } from 'lucide-react';
import { getReference, saveReference } from '@/features/architecture/api';
import type { ReferenceComponent, ViewQuality } from '@/features/architecture/api';
import { formatReference, isTodaysGrouping, parseReference, suggest } from '@/features/architecture/reference';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (x: number) => (x >= 0.8 ? 'text-[#4ade80]' : x >= 0.5 ? 'text-[#facc15]' : 'text-[#f87171]');

function Measure({ label, value, hint }: { label: string; value: number | undefined; hint: string }) {
  return <Tooltip title={hint}>
    <div className="min-w-0">
      <p className="text-[11px] uppercase leading-tight tracking-wider text-[#94a3b8]">{label}</p>
      <p className={`font-mono text-lg ${value === undefined ? 'text-[#94a3b8]' : tone(value)}`}>{value === undefined ? '–' : pct(Math.max(0, value))}</p>
    </div>
  </Tooltip>;
}

/**
 * How meaningful the drawing is: names supported by the paths, no dependency loops, layers respected, sizes balanced,
 * and, when known, agreement with the team's reference architecture and stability against the previous snapshot.
 */
export default function QualityPanel({ projectId, quality, view, onSaved, canEdit = true, openEditorRef }: {
  projectId: string; quality: ViewQuality; view: { components: { name: string; memberIds: string[] }[] }; onSaved: () => void;
  /** Saving the reference architecture is maintainer work (the server refuses it to members who only read). */
  canEdit?: boolean;
  /** Lets an issue card ("Review reference") open the editor that this panel owns. */
  openEditorRef?: MutableRefObject<(() => void) | null>;
}) {
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = editing === null ? null : parseReference(editing);

  async function open() {
    try {
      const current = await getReference(projectId);
      setEditing(formatReference(current.length ? current : suggest(view)));
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not load the reference.'); }
  }
  async function persist(components: ReferenceComponent[]) {
    setSaving(true);
    try { await saveReference(projectId, components); setEditing(null); message.success(components.length ? 'Reference saved. Views are now scored against it.' : 'Reference removed.'); onSaved(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not save the reference.'); }
    finally { setSaving(false); }
  }
  function save() {
    if (!parsed || parsed.errors.length) return;
    // The editor starts from the current drawing; saved unedited it would only describe today's grouping and score 100% by construction.
    if (isTodaysGrouping(parsed.components, view)) {
      modal.confirm({
        title: "Save today's grouping as the reference?",
        content: "This is today's grouping, so every future grouping will be compared to it, not to your intended design. Edit it to describe the architecture you intend, or save anyway.",
        okText: 'Save anyway', cancelText: 'Keep editing',
        onOk: () => persist(parsed.components),
      });
      return;
    }
    void persist(parsed.components);
  }

  useEffect(() => {
    if (!openEditorRef || !canEdit) return;
    openEditorRef.current = () => void open();
    return () => { openEditorRef.current = null; };
  });

  const q = quality;
  // What the measures found is told by the issue cards above; this panel only shows the scores.
  return <section className="rounded border border-[#242527] bg-[#11161b] px-3 py-3" aria-label="Architecture quality">
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <Measure label="Grounded names" value={q.grounding.score} hint="Share of component names that the file paths inside support. Low values mean invented or vague names." />
      <Measure label="No cycles" value={q.acyclicity.score} hint="Share of components not caught in a dependency loop with other components." />
      <Measure label="Layering" value={q.layering.score} hint="Share of dependencies between layered roles that point down (controller → service → entity → repository)." />
      <Measure label="Balance" value={q.balance} hint="How evenly files are spread over components; low when one component holds most files." />
      <Measure label="Matches reference" value={q.agreement?.score} hint={q.agreement ? `Adjusted Rand index against your reference architecture over ${q.agreement.common} files. 100% = same grouping.` : 'Set a reference architecture to score this.'} />
      <Measure label="Stable vs previous" value={q.stability?.score} hint={q.stability ? `Adjusted Rand index against the previous snapshot's components over ${q.stability.common} files.` : 'No earlier snapshot has components yet.'} />
    </div>
    {canEdit && <Button size="small" className="mt-3" block icon={<Target size={13} />} onClick={() => void open()}>Reference architecture</Button>}
    <Modal open={editing !== null} title="Reference architecture" okText="Save" confirmLoading={saving} okButtonProps={{ disabled: !!parsed?.errors.length }} onOk={save} onCancel={() => setEditing(null)} width={680} destroyOnHidden>
      <p className="text-sm text-[#94a3b8] mb-2">How your team sees the system: one component per line, <code>Name: path/prefix, other/prefix</code>. Files go to the component with the longest matching prefix; files no prefix matches are not scored. Leave it empty to remove the reference. The suggestion below is today's grouping; edit it to describe the architecture you intend.</p>
      <Input.TextArea value={editing ?? ''} onChange={e => setEditing(e.target.value)} autoSize={{ minRows: 8, maxRows: 18 }} className="font-mono text-xs" aria-label="Reference architecture" />
      {parsed?.errors.length ? <ul className="mt-2 text-xs text-red-400">{parsed.errors.slice(0, 5).map(e => <li key={e}>{e}</li>)}</ul> : null}
    </Modal>
  </section>;
}
