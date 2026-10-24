import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryBaseline, groupByDirectory } from '../src/domain/architecture/baseline.ts';

const groups = components => Object.fromEntries(components.map(c => [c.id, c.memberIds.length]));

test('a single chain of folders at the top is the root, not a level', () => {
  const files = [
    'src/main/java/com/acme/order/OrderService.java',
    'src/main/java/com/acme/order/OrderRepo.java',
    'src/main/java/com/acme/user/User.java',
    'src/main/java/com/acme/user/auth/Login.java',
    'src/main/java/com/acme/App.java',
  ];
  assert.deepEqual(groups(groupByDirectory(files, 1)), {
    'src/main/java/com/acme': 1,
    'src/main/java/com/acme/order': 2,
    'src/main/java/com/acme/user': 2,
  });
  assert.deepEqual(groups(groupByDirectory(files, 2)), {
    'src/main/java/com/acme': 1,
    'src/main/java/com/acme/order': 2,
    'src/main/java/com/acme/user': 1,
    'src/main/java/com/acme/user/auth': 1,
  });
});

test('pass-through folders below the root do not count as levels either', () => {
  const files = ['BE/src/domain/A.ts', 'BE/src/domain/B.ts', 'BE/src/infra/C.ts', 'FE/src/pages/D.tsx', 'FE/src/lib/E.ts'];
  assert.deepEqual(groups(groupByDirectory(files, 1)), { 'BE/src': 3, 'FE/src': 2 });
  assert.deepEqual(groups(groupByDirectory(files, 2)), { 'BE/src/domain': 2, 'BE/src/infra': 1, 'FE/src/pages': 1, 'FE/src/lib': 1 });
});

test('names are the last folder, and files at the top of the repository get a root group', () => {
  const comps = groupByDirectory(['README.java', 'core/A.java', 'web/B.java'], 1);
  assert.deepEqual(comps.map(c => [c.id, c.name]), [['(root)', '(root)'], ['core', 'core'], ['web', 'web']]);
});

test('the automatic depth gets as close as it can to the target component count', () => {
  const files = [];
  for (const area of ['a', 'b', 'c']) for (const mod of ['m1', 'm2', 'm3', 'm4']) files.push(`src/${area}/${mod}/X.java`, `src/${area}/${mod}/Y.java`);
  const auto = directoryBaseline(files);
  assert.equal(auto.depth, 2);
  assert.equal(auto.components.length, 12);
  assert.equal(directoryBaseline(files, { minComponents: 2, maxComponents: 4 }).depth, 1);
  assert.equal(directoryBaseline(files, { depth: 1 }).components.length, 3);
});

test('every file is placed exactly once', () => {
  const files = ['x/a/1.ts', 'x/a/2.ts', 'x/b/3.ts', 'y/4.ts', 'y/c/d/5.ts', 'x/a/1.ts'];
  for (const depth of [1, 2, 3]) {
    const placed = groupByDirectory(files, depth).flatMap(c => c.memberIds);
    assert.deepEqual(placed.sort(), [...new Set(files)].sort());
  }
});
