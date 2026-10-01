import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/lib/pagination.ts';

const items = Array.from({ length: 23 }, (_, i) => i + 1);
test('pages cover the collection without duplicates or omissions', () => {
  const pages = [1, 2, 3].flatMap(page => paginate(items, page, 10).items);
  assert.deepEqual(pages, items);
  assert.deepEqual(paginate(items, 3, 10).items, [21, 22, 23]);
  assert.equal(items.length, 23);
});
test('empty lists and deleting the last page keep pagination in range', () => {
  assert.deepEqual(paginate([], 3, 10), { items: [], current: 1, pageSize: 10, total: 0 });
  assert.equal(paginate(items.slice(0, 20), 3, 10).current, 2);
  assert.deepEqual(paginate(items.slice(0, 2), 3, 10).items, [1, 2]);
});
test('invalid page values are normalized and page sizes change the slice', () => {
  assert.equal(paginate(items, -1, 5).current, 1);
  assert.equal(paginate(items, 99, 5).current, 5);
  assert.equal(paginate(items, NaN, NaN).pageSize, 10);
  assert.equal(paginate(items, 1, 0).pageSize, 1);
  assert.deepEqual(paginate(items, 2, 5).items, [6, 7, 8, 9, 10]);
});
