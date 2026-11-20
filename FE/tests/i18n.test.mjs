import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/messages/en.ts';
import { vi } from '../src/i18n/messages/vi.ts';
import { getLanguage, localeTag, localizeServerMessage, localizeStage, preferredLanguage, setLanguage, translate, translateOr, translateRich } from '../src/i18n/index.ts';
import { formatDate, formatNumber } from '../src/i18n/format.ts';
import { mockGlobal } from './mock-global.mjs';

const storage = () => { const v = new Map(); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, String(x)), removeItem: k => v.delete(k) }; };

// Vietnamese is a lazily loaded chunk: load it once, then go back to English as a fresh page would start.
test.before(async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true, writable: true });
  await setLanguage('vi');
  await setLanguage('en');
  if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete globalThis.localStorage;
});

test('the starting language: the saved choice, else a Vietnamese browser, else English', () => {
  assert.equal(preferredLanguage('vi', ['en-US']), 'vi');
  assert.equal(preferredLanguage('en', ['vi-VN']), 'en');
  assert.equal(preferredLanguage(null, ['vi-VN', 'en']), 'vi');
  assert.equal(preferredLanguage(null, ['fr-FR', 'vi']), 'vi');
  assert.equal(preferredLanguage(null, ['en-GB']), 'en');
  assert.equal(preferredLanguage('de', []), 'en', 'an unknown saved value is ignored');
});

test('every English text has a Vietnamese translation (the English-only _one plural forms aside)', () => {
  const needed = Object.keys(en).filter(key => !key.endsWith('_one'));
  const missing = needed.filter(key => typeof vi[key] !== 'string' || !vi[key].trim());
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(vi).filter(key => !(key in en)), [], 'no Vietnamese key without an English one');
});

test('placeholders are kept: every {name} of the English text appears in the Vietnamese one', () => {
  const names = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const wrong = Object.keys(vi).filter(key => names(vi[key]).join() !== names(en[key]).join());
  assert.deepEqual(wrong, []);
});

test('translate fills placeholders and picks the English singular for one', () => {
  assert.equal(translate('ws.commits', { count: 1 }, 'en'), '1 commit');
  assert.equal(translate('ws.commits', { count: 3 }, 'en'), '3 commits');
  assert.equal(translate('ws.commits', { count: 1 }, 'vi'), '1 commit');
  assert.equal(translate('delete.title', { name: 'acme' }, 'vi'), 'Xoá acme?');
  assert.equal(translate('layout.backTo', {}, 'en'), 'Back to {label}', 'a missing value leaves the placeholder visible');
});

test('run-time keys fall back to the given English text', () => {
  assert.equal(translateOr('nav:/dashboard', 'Dashboard'), en['nav:/dashboard']);
  assert.equal(translateOr('nav:/no-such-page', 'Fallback'), 'Fallback');
});

test('rich text keeps the word order of each language around an element', () => {
  const bold = { type: 'strong' };
  assert.deepEqual(translateRich('delete.typeName', { name: bold }, 'en'), ['Type ', bold, ' to confirm']);
  assert.deepEqual(translateRich('delete.typeName', { name: bold }, 'vi'), ['Gõ ', bold, ' để xác nhận']);
});

test('switching language loads Vietnamese, remembers it, and dates and numbers follow', async t => {
  mockGlobal(t, 'localStorage', storage());
  await setLanguage('vi');
  assert.equal(getLanguage(), 'vi');
  assert.equal(localStorage.getItem('archtime.language'), 'vi');
  assert.equal(localeTag(), 'vi-VN');
  assert.equal(translate('common.signOut'), 'Đăng xuất');
  assert.equal(formatNumber(1234567), (1234567).toLocaleString('vi-VN'));
  assert.equal(formatDate('2026-11-20T10:00:00Z', { timeZone: 'UTC' }), new Date('2026-11-20T10:00:00Z').toLocaleDateString('vi-VN', { timeZone: 'UTC' }));
  await setLanguage('en');
  assert.equal(translate('common.signOut'), 'Sign out');
  assert.equal(formatDate('not a date'), '', 'an invalid date is empty, not "Invalid Date"');
  assert.equal(formatNumber(null), '');
});

test('job stages and server sentences with a number in them are translated; English stays as sent', () => {
  assert.equal(localizeStage('Batch 2/5 saved', 'en'), 'Batch 2/5 saved');
  assert.equal(localizeStage('Batch 2/5 saved', 'vi'), 'Đã lưu đợt 2/5');
  assert.equal(localizeStage('Batch 3/7 - a1b2c3d', 'vi'), 'Đợt 3/7 - a1b2c3d');
  assert.equal(localizeStage('Reading commit history', 'vi'), 'Đang đọc lịch sử commit');
  assert.equal(localizeStage('Checked 1 commit: 4 findings', 'vi'), 'Đã kiểm tra 1 commit: 4 phát hiện');
  // A failure keeps the error, translated on its own when it can be.
  assert.equal(localizeStage('Failed: Workspace not found.', 'vi'), 'Thất bại: Không tìm thấy không gian làm việc.');
  assert.equal(localizeStage('Failed: git exited with 128', 'vi'), 'Thất bại: git exited with 128');
  assert.equal(localizeServerMessage('Invalid OTP code. 2 tries left.', 'OTP_INVALID', 'vi'), 'Mã OTP không đúng. Còn 2 lần thử.');
  assert.equal(localizeServerMessage('A model with key "groq-llama" already exists.', undefined, 'vi'), 'Đã có mô hình với khoá "groq-llama".');
  assert.equal(localizeServerMessage('Something the map does not know', undefined, 'vi'), 'Something the map does not know');
});
