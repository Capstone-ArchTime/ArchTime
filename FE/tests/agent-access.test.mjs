import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPIRY_CHOICES, contextCommand, sortTokens } from '../src/features/agent-access.ts';

test('the example command reads the token from an environment variable and encodes the file', () => {
  assert.equal(contextCommand('https://archtime.example/api/', 'BE/src/a b.ts'),
    'curl -H "Authorization: Bearer $ARCHTIME_AGENT_TOKEN" "https://archtime.example/api/agent/context?file=BE/src/a%20b.ts"');
});

test('expiry choices never pass the 90-day limit', () => {
  assert.ok(EXPIRY_CHOICES.every(d => d >= 1 && d <= 90));
});

test('active tokens come first, then the newest', () => {
  const t = (id, status, createdAt) => ({ id, status, createdAt });
  assert.deepEqual(sortTokens([t('a', 'revoked', '2026-11-03'), t('b', 'active', '2026-11-01'), t('c', 'expired', '2026-11-04'), t('d', 'active', '2026-11-02')]).map(x => x.id), ['d', 'b', 'c', 'a']);
});
