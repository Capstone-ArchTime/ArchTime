import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEventParser, describeNotification, fetchNotifications, listenForNotifications, markAllNotificationsRead, markNotificationRead,
  parseNotification, reconnectDelay, timeAgo,
} from '../src/features/notifications.ts';
import { mockGlobal } from './mock-global.mjs';

// The bell in the header: notifications come from the server as a kind and its values and are worded here, in the
// reader's language; new ones arrive over a stream of server-sent events, read with the session's token.

function session(t) {
  mockGlobal(t, 'sessionStorage', { getItem: k => ({ accessToken: 'token', refreshToken: 'refresh' })[k] ?? null, setItem() {}, removeItem() {} });
  mockGlobal(t, 'localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
}

const raw = (extra = {}) => ({
  id: 'n1', userId: 'u1', kind: 'conformance.findings', params: { projectId: 'p1', projectName: 'Shop', count: 3 },
  link: '/project-maintainer/conformance?project=p1', createdAt: '2026-11-24T10:00:00.000Z', readAt: null, ...extra,
});

test('a notification is checked for shape; a link outside the app becomes the home page', () => {
  assert.equal(parseNotification(null), null);
  assert.equal(parseNotification({ id: 1 }), null);
  const n = parseNotification(raw());
  assert.equal(n.link, '/project-maintainer/conformance?project=p1');
  assert.equal(parseNotification(raw({ link: 'https://evil.example' })).link, '/');
  assert.equal(parseNotification(raw({ link: '//evil.example' })).link, '/');
  assert.equal(parseNotification(raw({ params: 'x' })).params.projectName, undefined);
});

test('conformance findings read in English and Vietnamese, one or many', () => {
  const many = parseNotification(raw());
  assert.deepEqual(describeNotification(many, 'en'), { title: '3 new conformance findings', body: 'Code in Shop departs from its confirmed component diagram.' });
  assert.equal(describeNotification(parseNotification(raw({ params: { projectName: 'Shop', count: 1 } })), 'en').title, '1 new conformance finding');
  assert.deepEqual(describeNotification(many, 'vi'), { title: '3 phát hiện tuân thủ mới', body: 'Mã nguồn trong Shop lệch khỏi sơ đồ thành phần đã xác nhận.' });
  assert.match(describeNotification(parseNotification(raw({ params: { count: 2 } })), 'en').body, /a workspace/, 'a workspace without a name');
  assert.equal(describeNotification(parseNotification(raw({ kind: 'later.kind' })), 'en').title, 'New activity', 'a kind this app does not know yet');
});

test('times read as "x minutes ago" in the page language', () => {
  const now = Date.parse('2026-11-24T10:05:00.000Z');
  assert.equal(timeAgo('2026-11-24T10:00:00.000Z', now, 'en'), '5 minutes ago');
  assert.equal(timeAgo('2026-11-24T10:04:50.000Z', now, 'en'), 'now');
  assert.equal(timeAgo('2026-11-24T07:05:00.000Z', now, 'en'), '3 hours ago');
  assert.equal(timeAgo('2026-11-22T10:05:00.000Z', now, 'vi'), 'Hôm kia');
  assert.equal(timeAgo('not a date', now, 'en'), '');
});

test('server-sent events are read across chunks; comments and retry lines are skipped', () => {
  const events = [];
  const parse = createEventParser((name, data) => events.push([name, data]));
  parse('retry: 5000\n\n: ping\n\nevent: notification\nda');
  assert.deepEqual(events, []);
  parse('ta: {"id":"n1"}\n\nevent: notification\r\ndata: {"id":"n2"}\r\n\r\ndata: plain\n\n');
  assert.deepEqual(events, [['notification', '{"id":"n1"}'], ['notification', '{"id":"n2"}'], ['message', 'plain']]);
});

test('reconnecting waits longer each time, at most a minute', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(reconnectDelay), [2000, 4000, 8000, 16000, 60000]);
});

test('the list, read one and read all call the notification routes with the session token', async t => {
  session(t);
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    asked.push({ url: String(url), method: init.method ?? 'GET', auth: new Headers(init.headers).get('Authorization') });
    if (String(url).includes('/read')) return Response.json({ success: true, data: { unread: 0 } });
    return Response.json({ success: true, data: { items: [raw(), { bad: true }], unread: 4 } });
  });
  const list = await fetchNotifications(5);
  assert.equal(list.items.length, 1, 'a malformed item is dropped');
  assert.equal(list.unread, 4);
  assert.equal(await markNotificationRead('n 1'), 0);
  await markAllNotificationsRead();
  assert.deepEqual(asked.map(a => [a.method, a.url.replace(/^.*\/api/, '')]), [
    ['GET', '/notifications?limit=5'], ['POST', '/notifications/n%201/read'], ['POST', '/notifications/read-all'],
  ]);
  assert.ok(asked.every(a => a.auth === 'Bearer token'));
});

test('the stream delivers each notification event and stops for good when the session is refused', async t => {
  session(t);
  const encoder = new TextEncoder();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) {
      const body = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(`event: notification\ndata: ${JSON.stringify(raw())}\n\n: ping\n\n`));
          c.enqueue(encoder.encode(`event: notification\ndata: not json\n\n`));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return Response.json({ success: false }, { status: 403 });
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const heard = [];
  const controller = new AbortController();
  const done = listenForNotifications(n => heard.push(n.id), controller.signal);
  // The first stream ends: the next try comes after the reconnect delay, and is refused.
  for (let i = 0; i < 20 && calls < 2; i++) { await new Promise(r => setImmediate(r)); t.mock.timers.tick(2000); }
  await done;
  assert.deepEqual(heard, ['n1'], 'a malformed event is skipped');
  assert.equal(calls, 2);
});
