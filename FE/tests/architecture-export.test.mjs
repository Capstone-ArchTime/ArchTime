import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PNG_SCALE, escapeHtml, exportCaption, exportFileBase, isoDay, pngScale, slug, standaloneHtml } from '../src/features/architecture/export-file.ts';
import { getFixture } from '../src/features/architecture/fixtures.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const meta = { workspace: 'Shop Backend', hash: 'A1B2C3D4E5F6A7B8', date: '2026-10-28T09:15:00.000Z', commitTitle: 'Merge pull request #44 from acme/feature/checkout' };

test('the file is named after the workspace, the short commit hash and the day, not the commit title', () => {
  assert.equal(exportFileBase(meta, NOW), 'shop-backend-a1b2c3d-2026-10-28');
  const name = exportFileBase(meta, NOW);
  assert.doesNotMatch(name, /pull|request|44|merge/);
});

test('names are made of safe characters, accents and Vietnamese letters transliterated', () => {
  assert.equal(slug('Hệ thống Quản lý Đơn hàng'), 'he-thong-quan-ly-don-hang');
  assert.equal(slug('ĐẠI HỌC / FPT: "nhóm" #5'), 'dai-hoc-fpt-nhom-5');
  assert.equal(exportFileBase({ ...meta, workspace: 'Quản lý Đồ án' }, NOW), 'quan-ly-do-an-a1b2c3d-2026-10-28');
  for (const workspace of ['a/b\\c:d*e?f"g<h>i|j', '../../etc/passwd', 'x'.repeat(300), '  spaced   out  ', 'emoji 🚀 name', '日本語']) {
    const name = exportFileBase({ ...meta, workspace }, NOW);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, name);
    assert.ok(name.length <= 80, `${name.length}`);
  }
});

test('a very long workspace name is cut, and the hash and date still end the name', () => {
  const name = exportFileBase({ ...meta, workspace: 'a'.repeat(200) }, NOW);
  assert.equal(name, `${'a'.repeat(40)}-a1b2c3d-2026-10-28`);
  // With a long inner-view name too, the workspace gives way and the file still ends with hash, day and detail.
  const both = exportFileBase({ ...meta, workspace: 'a'.repeat(200), detail: 'd'.repeat(100) }, NOW);
  assert.ok(both.length <= 80, `${both.length}`);
  assert.match(both, /^a+-a1b2c3d-2026-10-28-inside-d{24}$/);
  // The cut never leaves a dangling dash.
  assert.equal(slug('abcdefghij-klmnop', 10), 'abcdefghij');
  assert.equal(slug('abcdefghi-klmnop', 10), 'abcdefghi');
});

test('missing pieces fall back sensibly instead of leaving gaps or empty names', () => {
  assert.equal(exportFileBase({}, NOW), 'architecture-2026-10-30');
  assert.equal(exportFileBase({ workspace: '', hash: '', date: '' }, NOW), 'architecture-2026-10-30');
  assert.equal(exportFileBase({ workspace: '!!!' }, NOW), 'architecture-2026-10-30');
  assert.equal(exportFileBase({ workspace: 'Shop Backend', hash: 'abc' }, NOW), 'shop-backend-abc-2026-10-30');
  assert.equal(exportFileBase({ workspace: 'Shop', hash: 'a1b2c3d', date: 'not a date' }, NOW), 'shop-a1b2c3d-2026-10-30');
  assert.equal(exportFileBase({ workspace: 'Shop', hash: '--//--' }, NOW), 'shop-2026-10-30');
});

test('a sample has no commit: it is marked "sample" and dated by the export day', () => {
  const sample = getFixture('shophub');
  const workspace = sample.label.split(':')[0];
  assert.equal(exportFileBase({ workspace, sample: true }, NOW), 'shophub-sample-2026-10-30');
  assert.deepEqual(exportCaption({ workspace, sample: true }, NOW), { title: 'ShopHub · Sample · 2026-10-30' });
});

test('the inner view of a component adds its name last', () => {
  assert.equal(exportFileBase({ ...meta, detail: 'Order Management' }, NOW), 'shop-backend-a1b2c3d-2026-10-28-inside-order-management');
  assert.equal(exportCaption({ ...meta, detail: 'Order Management', commitTitle: '' }, NOW).title, 'Shop Backend · a1b2c3d · 2026-10-28 · inside Order Management');
});

test('the snapshot day is read from its own text, so the time zone cannot shift it', () => {
  assert.equal(isoDay('2026-10-28T23:30:00+07:00', NOW), '2026-10-28');
  assert.equal(isoDay('2026-10-28', NOW), '2026-10-28');
  assert.equal(isoDay('2026-10-28 08:00:00', NOW), '2026-10-28');
  assert.equal(isoDay('Wed, 28 Oct 2026 08:00:00 GMT', NOW), '2026-10-28');
  assert.equal(isoDay('2026-13-45', NOW), '2026-10-30');
  assert.equal(isoDay(undefined, NOW), '2026-10-30');
});

test('the image title is workspace, hash and date; the commit line is only a subtitle, and only when it fits', () => {
  assert.deepEqual(exportCaption(meta, NOW), { title: 'Shop Backend · a1b2c3d · 2026-10-28', subtitle: 'Merge pull request #44 from acme/feature/checkout' });
  // Only the first line of a multi-line message.
  assert.equal(exportCaption({ ...meta, commitTitle: 'Fix login\n\nLong body here' }, NOW).subtitle, 'Fix login');
  // Too long to fit: dropped, never truncated into nonsense and never the title.
  const long = exportCaption({ ...meta, commitTitle: 'x'.repeat(200) }, NOW);
  assert.equal(long.subtitle, undefined);
  assert.equal(long.title, 'Shop Backend · a1b2c3d · 2026-10-28');
  assert.equal(exportCaption({ ...meta, commitTitle: '   ' }, NOW).subtitle, undefined);
  assert.equal(exportCaption({ ...meta, commitTitle: 'a\u0007b\tc' }, NOW).subtitle, 'a b c', 'control characters are removed');
});

test('the title is never empty and never absurdly long', () => {
  assert.equal(exportCaption({}, NOW).title, 'Architecture · 2026-10-30');
  assert.equal(exportCaption({ workspace: '   ' }, NOW).title, 'Architecture · 2026-10-30');
  const huge = exportCaption({ ...meta, workspace: 'W'.repeat(500), detail: 'D'.repeat(500) }, NOW).title;
  assert.ok(huge.length <= 100, `${huge.length}`);
  assert.match(huge, /a1b2c3d · 2026-10-28/, 'the identifying parts survive');
  assert.match(huge, /…/);
  assert.ok(exportCaption({ ...meta, workspace: 'W'.repeat(500) }, NOW).title.length <= 90);
});

test('large diagrams get a PNG scale that keeps the canvas inside browser limits', () => {
  assert.equal(pngScale(1000, 800), 2);
  assert.equal(pngScale(0, 0), 2);
  assert.equal(pngScale(10_000, 500), 1.6384, 'no side over 16384 pixels');
  const big = pngScale(8000, 8000);
  assert.ok(big < 2 && 8000 * big * 8000 * big <= 64_000_001, `${big}`);
  assert.ok(pngScale(100_000, 100_000) < MIN_PNG_SCALE, 'a diagram this size cannot be a PNG and the caller says so');
});

test('the standalone page escapes a title full of #, /, :, quotes and markup, and keeps its data readable', () => {
  const view = structuredClone(getFixture('ledger').view);
  view.classes[0].name = 'Evil</script><script>alert(1)</script>';
  view.title = 'Merge pull request #44 from a/b: "x" <b>&\'';
  const title = 'Shop <Backend> "Quotes" & \'more\' #44: a/b';
  const html = standaloneHtml('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>\n', view, '#080b0e', title);
  assert.match(html, /<title>Shop &lt;Backend&gt; &quot;Quotes&quot; &amp; &#39;more&#39; #44: a\/b<\/title>/);
  assert.doesNotMatch(html, /<title>[^<]*<b>/);
  assert.equal((html.match(/<script/g) ?? []).length, 1, 'data cannot open another script');
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1, 'data cannot close the script early');
  const data = /<script type="application\/json" id="archtime-view">([\s\S]*?)<\/script>/.exec(html);
  assert.deepEqual(JSON.parse(data[1]), view, 'the embedded data parses back to exactly the view');
  assert.doesNotMatch(html, /^<\?xml/m, 'the XML declaration is not repeated inside the page');
});

test('without an explicit title the page falls back to the view title, escaped', () => {
  const view = structuredClone(getFixture('ledger').view);
  view.title = 'A "B" <C>';
  assert.match(standaloneHtml('<svg></svg>', view, '#fff'), /<title>A &quot;B&quot; &lt;C&gt;<\/title>/);
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
