import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRows, getComponentMatch, hasStructuralChange, linkStrength } from '../src/features/component-matching.ts';
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const side = (hash, components) => ({ snapshot: { id: `id-${hash}`, hash, title: hash, date: '2026-01-01' }, stale: false, components });
const c = (id, name, files) => ({ id, name, role: 'service', files });
const result = {
  before: side('aaa', [c('shop', 'Shop', 6), c('users', 'Users', 3), c('old', 'Legacy', 2)]),
  after: side('bbb', [c('cart', 'Cart', 2), c('catalog', 'Catalog', 4), c('accounts', 'Users', 3), c('api', 'API', 5)]),
  matching: {
    links: [
      { before: 'shop', after: 'cart', shared: ['a', 'b'], forward: 0.3333, backward: 1 },
      { before: 'shop', after: 'catalog', shared: ['c', 'd', 'e', 'f'], forward: 0.6667, backward: 1 },
      { before: 'users', after: 'accounts', shared: ['u', 'v', 'w'], forward: 1, backward: 1 },
    ],
    changes: [
      { kind: 'removed', before: ['old'], after: [], reason: 'deleted' },
      { kind: 'split', before: ['shop'], after: ['cart', 'catalog'] },
      { kind: 'kept', before: ['users'], after: ['accounts'] },
      { kind: 'added', before: [], after: ['api'], reason: 'new-files' },
    ],
    successor: { shop: 'catalog', users: 'accounts', old: null },
    moves: [],
    files: { common: 9, added: 5, removed: 2, moved: 0 },
    summary: { kept: 1, renamed: 0, split: 1, merged: 0, restructured: 0, removed: 1, added: 1 },
  },
};

test('rows put structural changes first, with names and the links behind them', () => {
  const rows = changeRows(result);
  assert.deepEqual(rows.map(r => r.kind), ['split', 'added', 'removed', 'kept']);
  const split = rows[0];
  assert.deepEqual(split.after.map(a => a.name), ['Cart', 'Catalog']);
  assert.deepEqual(split.links.map(l => `${l.beforeName}>${l.afterName}`), ['Shop>Catalog', 'Shop>Cart']);
  assert.equal(split.explanation, 'Shop was split into Cart, Catalog.');
  assert.equal(rows[1].explanation, 'Made of files that did not exist before.');
  assert.equal(rows[2].explanation, 'Its files were deleted.');
  assert.equal(rows[3].structural, false);
  assert.equal(rows[3].explanation, 'Same component: 3 shared files.');
});

test('link strength reads from both ends', () => {
  assert.equal(linkStrength({ forward: 0.6667, backward: 1, beforeName: 'Shop', afterName: 'Catalog' }), '67% of the remaining files of Shop · 100% of the files of Catalog');
});

test('only kept components is no structural change', () => {
  assert.equal(hasStructuralChange(result.matching.summary), true);
  assert.equal(hasStructuralChange({ kept: 4, renamed: 0, split: 0, merged: 0, restructured: 0, removed: 0, added: 0 }), false);
});

test('the request passes both revisions and surfaces the server reason', async t => {
  t.mock.property(globalThis, 'sessionStorage', storage({ accessToken: 'token' }));
  t.mock.property(globalThis, 'localStorage', storage());
  let url;
  t.mock.method(globalThis, 'fetch', async u => { url = u; return Response.json({ success: true, data: result }); });
  const got = await getComponentMatch('p1', 'b1', 't1');
  assert.match(url, /\/projects\/p1\/architecture\/match\?baseId=b1&targetId=t1$/);
  assert.equal(got.after.components.length, 4);

  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Snapshot bbb has no components yet. Generate its architecture first.' } }, { status: 400 }));
  await assert.rejects(getComponentMatch('p1', 'b1', 't1'), /has no components yet/);
});
