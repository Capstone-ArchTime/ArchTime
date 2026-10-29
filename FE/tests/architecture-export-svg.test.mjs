import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getFixture } from '../src/features/architecture/fixtures.ts';
import { componentScene } from '../src/features/architecture/scene.ts';
import { layoutGraph } from '../src/features/architecture/layout.ts';
import { THEMES } from '../src/features/architecture/theme.ts';
import { captionHeight } from '../src/features/architecture/export-file.ts';
const { default: DiagramSvg } = await import('../src/components/architecture/DiagramSvg.tsx');

const view = getFixture('ledger').view;
const scene = componentScene(view);
const layout = layoutGraph(scene.nodes.map(n => ({ id: n.id, width: n.width, height: n.height, layer: n.layer })), scene.edges);
const render = props => renderToStaticMarkup(createElement(DiagramSvg, { scene, layout, theme: THEMES.dark, interactive: false, showWeights: true, idPrefix: 'export', ...props }));

test('the caption band takes room above the diagram and the diagram moves down by exactly that much', () => {
  assert.equal(captionHeight(null), 0);
  assert.equal(captionHeight(undefined), 0);
  assert.equal(captionHeight({ subtitle: undefined }), 40);
  assert.equal(captionHeight({ subtitle: 'x' }), 58);
  const caption = { title: 'Ledger · a1b2c3d · 2026-10-28', subtitle: 'Fix the ledger' };
  const svg = render({ title: caption.title, caption });
  assert.match(svg, new RegExp(`<svg[^>]* height="${layout.height + 58}"`));
  assert.match(svg, new RegExp(`viewBox="0 0 ${layout.width} ${layout.height + 58}"`));
  assert.match(svg, /<g transform="translate\(0,58\)">/);
  assert.match(svg, />Ledger · a1b2c3d · 2026-10-28<\/text>/);
  assert.match(svg, />Fix the ledger<\/text>/);
});

test('without a caption the picture is exactly the diagram, as before', () => {
  const svg = render({ title: 'Ledger' });
  assert.match(svg, new RegExp(`<svg[^>]* height="${layout.height}"`));
  assert.doesNotMatch(svg, /translate\(0,/);
  assert.doesNotMatch(svg, /<line /);
});

test('a title with #, /, :, quotes and markup is escaped and cannot break the picture', () => {
  const nasty = 'Merge pull request #44 from a/b: "x" <img src=x onerror=1> & \'y\'';
  const svg = render({ title: nasty, caption: { title: nasty, subtitle: nasty } });
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /<title>Merge pull request #44 from a\/b: &quot;x&quot; &lt;img src=x onerror=1&gt; &amp; &#x27;y&#x27;<\/title>/);
  // Every "<" in the output opens a known SVG element or closes one.
  for (const [, name] of svg.matchAll(/<\/?([a-zA-Z]+)/g)) assert.ok(['svg', 'title', 'defs', 'marker', 'path', 'rect', 'g', 'text', 'line'].includes(name), name);
});

test('a title longer than the picture is wide is cut with an ellipsis instead of running off it', () => {
  const long = 'W'.repeat(300);
  const svg = render({ title: long, caption: { title: long } });
  const drawn = /<text x="16" y="26"[^>]*>([^<]*)<\/text>/.exec(svg)[1];
  assert.ok(drawn.length < long.length && drawn.endsWith('…'), drawn.length);
  assert.ok(drawn.length * 8.6 <= layout.width - 32 + 9, 'fits the width');
});
