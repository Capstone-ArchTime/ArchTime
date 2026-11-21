import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteConfirmed } from '../src/features/delete-workspace.ts';

test('a workspace is only deleted once its name is typed', () => {
  assert.equal(deleteConfirmed('', 'acme-web'), false);
  assert.equal(deleteConfirmed('acme', 'acme-web'), false);
  assert.equal(deleteConfirmed('acme-web', 'acme-web'), true);
  assert.equal(deleteConfirmed('  ACME-Web ', 'acme-web'), true, 'case and surrounding spaces do not matter');
  assert.equal(deleteConfirmed('', '   '), false, 'a blank name never confirms');
});
