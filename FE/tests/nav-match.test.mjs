import test from 'node:test';
import assert from 'node:assert/strict';
import { matchNavItem } from '../src/components/layout/nav-match.ts';

const items = [{ path: '/projects' }, { path: '/learning' }, { path: '/project-maintainer' }, { path: '/project-maintainer/team' }];

test('a page belongs to the item for exactly its path', () => {
  assert.equal(matchNavItem(items, '/learning').path, '/learning');
  assert.equal(matchNavItem(items, '/project-maintainer/team').path, '/project-maintainer/team');
});

test('a page inside an item belongs to it, and the deepest item wins', () => {
  assert.equal(matchNavItem(items, '/learning/66f0/aa11').path, '/learning');
  assert.equal(matchNavItem(items, '/learning/manage/66f0/new').path, '/learning');
  assert.equal(matchNavItem(items, '/project-maintainer/team/anything').path, '/project-maintainer/team');
  assert.equal(matchNavItem(items, '/project-maintainer/other').path, '/project-maintainer');
});

test('a path only counts as a parent at a slash, and unknown pages belong to nothing', () => {
  assert.equal(matchNavItem(items, '/project'), undefined, '/project is not inside /projects');
  assert.equal(matchNavItem(items, '/projectsabc'), undefined);
  assert.equal(matchNavItem(items, '/learningx/y'), undefined);
  assert.equal(matchNavItem(items, '/workspace/abc'), undefined);
  assert.equal(matchNavItem([], '/learning'), undefined);
});
