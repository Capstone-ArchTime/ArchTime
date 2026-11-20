import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { App, Button, Input, Modal, Tooltip } from 'antd';
import { Target } from 'lucide-react';
import { getReference, saveReference } from '@/features/architecture/api';
import type { ReferenceComponent, ViewQuality } from '@/features/architecture/api';
import { formatReference, isTodaysGrouping, parseReference, suggest } from '@/features/architecture/reference';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load the reference.', saved: 'Reference saved. Views are now scored against it.', removed: 'Reference removed.', saveFailed: 'Could not save the reference.',
  todayTitle: "Save today's grouping as the reference?", todayBody: "This is today's grouping, so every future grouping will be compared to it, not to your intended design. Edit it to describe the architecture you intend, or save anyway.",
  saveAnyway: 'Save anyway', keepEditing: 'Keep editing', quality: 'Architecture quality',
  grounded: 'Grounded names', groundedHint: 'Share of component names that the file paths inside support. Low values mean invented or vague names.',
  noCycles: 'No cycles', noCyclesHint: 'Share of components not caught in a dependency loop with other components.',
  layering: 'Layering', layeringHint: 'Share of dependencies between layered roles that point down (controller → service → entity → repository).',
  balance: 'Balance', balanceHint: 'How evenly files are spread over components; low when one component holds most files.',
  matches: 'Matches reference', matchesHint: 'Adjusted Rand index against your reference architecture over {n} files. 100% = same grouping.', matchesNone: 'Set a reference architecture to score this.',
  stable: 'Stable vs previous', stableHint: "Adjusted Rand index against the previous snapshot's components over {n} files.", stableNone: 'No earlier snapshot has components yet.',
  reference: 'Reference architecture', save: 'Save', cancel: 'Cancel',
  editorHelp: 'How your team sees the system: one component per line, {format}. Files go to the component with the longest matching prefix; files no prefix matches are not scored. Leave it empty to remove the reference. The suggestion below is today\'s grouping; edit it to describe the architecture you intend.',
}, {
  loadFailed: 'Không tải được kiến trúc tham chiếu.', saved: 'Đã lưu kiến trúc tham chiếu. Từ giờ các sơ đồ được chấm điểm theo nó.', removed: 'Đã xoá kiến trúc tham chiếu.', saveFailed: 'Không lưu được kiến trúc tham chiếu.',
  todayTitle: 'Lưu cách nhóm hiện tại làm tham chiếu?', todayBody: 'Đây là cách nhóm hiện tại, nên mọi cách nhóm sau này sẽ được so với nó, chứ không phải với thiết kế bạn dự định. Hãy sửa để mô tả kiến trúc bạn muốn, hoặc vẫn lưu.',
  saveAnyway: 'Vẫn lưu', keepEditing: 'Tiếp tục sửa', quality: 'Chất lượng kiến trúc',
  grounded: 'Tên có căn cứ', groundedHint: 'Tỉ lệ tên thành phần được đường dẫn tệp bên trong hỗ trợ. Giá trị thấp nghĩa là tên bị bịa hoặc mơ hồ.',
  noCycles: 'Không có vòng', noCyclesHint: 'Tỉ lệ thành phần không nằm trong vòng phụ thuộc với thành phần khác.',
  layering: 'Phân tầng', layeringHint: 'Tỉ lệ phụ thuộc giữa các vai trò có tầng đi theo chiều xuống (controller → service → entity → repository).',
  balance: 'Cân bằng', balanceHint: 'Các tệp được chia đều giữa các thành phần đến đâu; thấp khi một thành phần chứa phần lớn tệp.',
  matches: 'Khớp tham chiếu', matchesHint: 'Chỉ số Adjusted Rand so với kiến trúc tham chiếu trên {n} tệp. 100% = cách nhóm giống hệt.', matchesNone: 'Đặt kiến trúc tham chiếu để chấm điểm mục này.',
  stable: 'Ổn định so với trước', stableHint: 'Chỉ số Adjusted Rand so với các thành phần của ảnh chụp trước trên {n} tệp.', stableNone: 'Chưa có ảnh chụp trước nào có thành phần.',
  reference: 'Kiến trúc tham chiếu', save: 'Lưu', cancel: 'Huỷ',
  editorHelp: 'Cách nhóm bạn nhìn hệ thống: mỗi dòng một thành phần, {format}. Tệp thuộc về thành phần có tiền tố khớp dài nhất; tệp không khớp tiền tố nào thì không được chấm điểm. Để trống để xoá tham chiếu. Gợi ý bên dưới là cách nhóm hiện tại; hãy sửa để mô tả kiến trúc bạn dự định.',
});

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (x: number) => (x >= 0.8 ? 'text-[var(--at-success)]' : x >= 0.5 ? 'text-[var(--at-warn)]' : 'text-[var(--at-danger)]');

function Measure({ label, value, hint }: { label: string; value: number | undefined; hint: string }) {
  return <Tooltip title={hint}>
    <div className="min-w-0">
      <p className="text-[11px] uppercase leading-tight tracking-wider text-[var(--at-muted)]">{label}</p>
      <p className={`font-mono text-lg ${value === undefined ? 'text-[var(--at-muted)]' : tone(value)}`}>{value === undefined ? '–' : pct(Math.max(0, value))}</p>
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
  const m = useMessages(MSG);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = editing === null ? null : parseReference(editing);

  async function open() {
    try {
      const current = await getReference(projectId);
      setEditing(formatReference(current.length ? current : suggest(view)));
    } catch (cause) { message.error(cause instanceof Error ? cause.message : m('loadFailed')); }
  }
  async function persist(components: ReferenceComponent[]) {
    setSaving(true);
    try { await saveReference(projectId, components); setEditing(null); message.success(components.length ? m('saved') : m('removed')); onSaved(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : m('saveFailed')); }
    finally { setSaving(false); }
  }
  function save() {
    if (!parsed || parsed.errors.length) return;
    // The editor starts from the current drawing; saved unedited it would only describe today's grouping and score 100% by construction.
    if (isTodaysGrouping(parsed.components, view)) {
      modal.confirm({
        title: m('todayTitle'),
        content: m('todayBody'),
        okText: m('saveAnyway'), cancelText: m('keepEditing'),
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
  return <section className="rounded border border-[var(--at-line)] bg-[var(--at-panel)] px-3 py-3" aria-label={m('quality')}>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <Measure label={m('grounded')} value={q.grounding.score} hint={m('groundedHint')} />
      <Measure label={m('noCycles')} value={q.acyclicity.score} hint={m('noCyclesHint')} />
      <Measure label={m('layering')} value={q.layering.score} hint={m('layeringHint')} />
      <Measure label={m('balance')} value={q.balance} hint={m('balanceHint')} />
      <Measure label={m('matches')} value={q.agreement?.score} hint={q.agreement ? m('matchesHint', { n: q.agreement.common }) : m('matchesNone')} />
      <Measure label={m('stable')} value={q.stability?.score} hint={q.stability ? m('stableHint', { n: q.stability.common }) : m('stableNone')} />
    </div>
    {canEdit && <Button size="small" className="mt-3" block icon={<Target size={13} />} onClick={() => void open()}>{m('reference')}</Button>}
    <Modal open={editing !== null} title={m('reference')} okText={m('save')} cancelText={m('cancel')} confirmLoading={saving} okButtonProps={{ disabled: !!parsed?.errors.length }} onOk={save} onCancel={() => setEditing(null)} width={680} destroyOnHidden>
      <p className="text-sm text-[var(--at-muted)] mb-2">{m.rich('editorHelp', { format: <code key="f">Name: path/prefix, other/prefix</code> })}</p>
      <Input.TextArea value={editing ?? ''} onChange={e => setEditing(e.target.value)} autoSize={{ minRows: 8, maxRows: 18 }} className="font-mono text-xs" aria-label={m('reference')} />
      {parsed?.errors.length ? <ul className="mt-2 text-xs text-red-400">{parsed.errors.slice(0, 5).map(e => <li key={e}>{e}</li>)}</ul> : null}
    </Modal>
  </section>;
}
