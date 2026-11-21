import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_THEME, SELECTABLE_THEMES, THEMES, getTheme } from '../src/theme/registry.ts';
import { themeCss, themesStylesheet } from '../src/theme/css.ts';

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a, b) {
  const lum = hex => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const isHex = value => /^#[0-9a-f]{6}$/i.test(value);

test('theme ids are unique and the picker offers at least two looks', () => {
  const ids = THEMES.map(theme => theme.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SELECTABLE_THEMES.length >= 2);
  assert.ok(!SELECTABLE_THEMES.includes(BASE_THEME), 'the base theme is not offered');
  assert.equal(getTheme('no-such-theme'), BASE_THEME);
});

test('every theme gives every token the base theme gives', () => {
  const names = Object.keys(BASE_THEME.tokens).sort();
  for (const theme of THEMES) assert.deepEqual(Object.keys(theme.tokens).sort(), names, theme.id);
});

test('every theme has a label and a hint in both languages', () => {
  for (const theme of THEMES) for (const field of ['label', 'hint']) for (const lang of ['en', 'vi']) assert.ok(theme[field][lang]?.trim(), `${theme.id} ${field}.${lang}`);
});

test('text and secondary text keep 7:1, and text on the main action 4.5:1 (DESIGN.md, Seven-to-One Rule)', () => {
  for (const { id, tokens: t } of THEMES) {
    for (const name of ['text', 'muted', 'solid', 'fill', 'on-fill']) assert.ok(isHex(t[name]), `${id}: ${name} must be a solid #rrggbb to be checked`);
    assert.ok(contrast(t.text, t.solid) >= 7, `${id}: text on solid ${contrast(t.text, t.solid).toFixed(2)}`);
    assert.ok(contrast(t.muted, t.solid) >= 7, `${id}: muted on solid ${contrast(t.muted, t.solid).toFixed(2)}`);
    assert.ok(contrast(t['on-fill'], t.fill) >= 4.5, `${id}: on-fill on fill ${contrast(t['on-fill'], t.fill).toFixed(2)}`);
  }
});

test('the base theme writes :root; the others their own html[data-theme] block with the floor', () => {
  assert.match(themeCss(BASE_THEME), /^:root \{/);
  assert.doesNotMatch(themeCss(BASE_THEME), /background-image/);
  for (const theme of THEMES.filter(t => t !== BASE_THEME)) {
    const css = themeCss(theme);
    assert.ok(css.startsWith(`html[data-theme="${theme.id}"]`), theme.id);
    assert.match(css, /--at-text: /);
    assert.match(css, /background-image: var\(--at-floor-image\);/);
    assert.doesNotMatch(css, /:scope/, `${theme.id}: :scope must be replaced by the theme's root`);
  }
  const sheet = themesStylesheet();
  for (const theme of THEMES) assert.ok(sheet.includes(theme === BASE_THEME ? ':root {' : `html[data-theme="${theme.id}"]`));
});

test('a theme scope (the 404 page) wears that theme', () => {
  assert.match(themeCss(getTheme('frost')), /^html\[data-theme="frost"\], \.at-frost-scope \{/);
});

test('every theme names diagram colours for both viewer modes, with a grid', () => {
  for (const theme of THEMES) for (const mode of ['dark', 'light']) assert.ok(theme.diagram[mode]?.grid, `${theme.id} ${mode}`);
});
