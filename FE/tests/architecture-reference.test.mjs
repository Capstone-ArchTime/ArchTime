import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReference, isTodaysGrouping, parseReference, suggest } from '../src/features/architecture/reference.ts';

const view = {
  components: [
    { name: 'Orders', memberIds: ['src/orders/a.ts', 'src/orders/b.ts'] },
    { name: 'Store', memberIds: ['src/store/db/x.ts', 'src/store/cache/y.ts'] },
    { name: 'Misc', memberIds: ['main.ts'] },
    { name: 'Empty', memberIds: [] },
  ],
};

test('the suggestion is each non-empty component with the folder its files share', () => {
  assert.deepEqual(suggest(view), [
    { name: 'Orders', prefixes: ['src/orders/'] },
    { name: 'Store', prefixes: ['src/store/'] },
    { name: 'Misc', prefixes: ['main.ts'] },
  ]);
});

test('the editor text round-trips through the parser', () => {
  const text = formatReference(suggest(view));
  assert.equal(text, 'Orders: src/orders/\nStore: src/store/\nMisc: main.ts');
  assert.deepEqual(parseReference(text), { components: suggest(view), errors: [] });
});

test('the parser reports lines that are not "Name: prefix" and ignores comments and blanks', () => {
  const out = parseReference('# my design\n\nOrders: a/, b/\nnonsense\nEmpty:\n: x/');
  assert.deepEqual(out.components, [{ name: 'Orders', prefixes: ['a/', 'b/'] }]);
  assert.equal(out.errors.length, 3);
  assert.match(out.errors[0], /^Line 2:/);
});

test('saving the suggestion unedited is recognised as today\'s grouping', () => {
  assert.equal(isTodaysGrouping(parseReference(formatReference(suggest(view))).components, view), true);
});

test('windows line endings and padding in the text do not hide it', () => {
  const text = `  ${formatReference(suggest(view)).split('\n').join('  \r\n')}\r\n\r\n`;
  assert.equal(isTodaysGrouping(parseReference(text).components, view), true);
});

test('any edit makes it the team\'s own reference: a changed prefix, name, extra prefix, removed or added component, or other order', () => {
  const today = suggest(view);
  const edited = [
    today.map((c, i) => (i === 0 ? { ...c, prefixes: ['src/orders/core/'] } : c)),
    today.map((c, i) => (i === 1 ? { ...c, name: 'Storage' } : c)),
    today.map((c, i) => (i === 2 ? { ...c, prefixes: [...c.prefixes, 'lib/'] } : c)),
    today.slice(0, 2),
    [...today, { name: 'Extra', prefixes: ['extra/'] }],
    [today[1], today[0], today[2]],
  ];
  for (const components of edited) assert.equal(isTodaysGrouping(components, view), false, JSON.stringify(components));
});

test('an empty list removes the reference, which is never today\'s grouping, even for a view with no components', () => {
  assert.equal(isTodaysGrouping([], view), false);
  assert.equal(isTodaysGrouping([], { components: [] }), false);
  assert.equal(isTodaysGrouping([], { components: [{ name: 'Empty', memberIds: [] }] }), false);
});

test('a reference that matches a different view is not today\'s grouping', () => {
  const other = { components: [{ name: 'Orders', memberIds: ['src/orders/a.ts'] }] };
  assert.equal(isTodaysGrouping(suggest(view), other), false);
});
