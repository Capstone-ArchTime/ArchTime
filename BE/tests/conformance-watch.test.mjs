import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NotificationUseCases, findingAlerts } from '../src/application/use-cases/notifications/NotificationUseCases.ts';
import { conformanceAfterMining, newFindingsOf } from '../src/application/use-cases/conformance/FindingNotifier.ts';
import { NotificationHub } from '../src/infrastructure/services/NotificationHub.ts';
import { NotificationController } from '../src/presentation/controllers/NotificationController.ts';
import { RepositoryWatcher, RETRY_AFTER_FAILURE_MS, shouldWatch, watchIntervalMinutes } from '../src/infrastructure/services/RepositoryWatcher.ts';
import { selectNewCommits } from '../src/domain/mining/miningPlan.ts';
import { ConflictError } from '../src/shared/errors/AppError.ts';

// The automatic check (fetch, mine what is new, check it) and the bell in the header (in-app notifications pushed as
// they happen): new conformance findings reach the people who answer for a workspace without anyone pressing a button.

const day = n => new Date(Date.UTC(2026, 10, n));

/** An in-memory notification store with the repository's behaviour. */
function notificationRepo() {
  const rows = [];
  let next = 1;
  return {
    rows,
    async createMany(list) {
      const created = list.map(n => ({ ...n, id: `n${next++}`, createdAt: new Date(), readAt: null }));
      rows.push(...created);
      return created;
    },
    async listForUser(userId, limit) { return rows.filter(r => r.userId === userId).reverse().slice(0, limit); },
    async unreadCount(userId) { return rows.filter(r => r.userId === userId && !r.readAt).length; },
    async markRead(userId, id, at) {
      const row = rows.find(r => r.id === id && r.userId === userId && !r.readAt);
      if (row) row.readAt = at;
      return !!row;
    },
    async markAllRead(userId, at) {
      const unread = rows.filter(r => r.userId === userId && !r.readAt);
      for (const r of unread) r.readAt = at;
      return unread.length;
    },
  };
}

// ── In-app notifications ─────────────────────────────────────────────────────

test('a notification is stored, then pushed to its owner only; reading one or all is per person and idempotent', async () => {
  const repo = notificationRepo();
  const hub = new NotificationHub();
  const uc = new NotificationUseCases(repo, hub, () => day(5));
  const heard = { u1: [], u2: [] };
  const stop1 = hub.subscribe('u1', n => heard.u1.push(n.id));
  hub.subscribe('u2', n => heard.u2.push(n.id));

  const params = { projectId: 'p1', projectName: 'Shop', count: 2 };
  const [a, b] = await uc.notify([
    { userId: 'u1', kind: 'conformance.findings', link: '/x', params },
    { userId: 'u2', kind: 'conformance.findings', link: '/x', params },
  ]);
  assert.deepEqual(heard, { u1: [a.id], u2: [b.id] });

  assert.equal((await uc.list('u1')).unread, 1);
  assert.deepEqual(await uc.read('u1', b.id), { unread: 1 }, "someone else's notification is not touched");
  assert.equal(repo.rows.find(r => r.id === b.id).readAt, null);
  assert.deepEqual(await uc.read('u1', a.id), { unread: 0 });
  assert.deepEqual(await uc.read('u1', a.id), { unread: 0 }, 'reading again changes nothing');
  assert.deepEqual(await uc.readAll('u2'), { unread: 0 });

  stop1();
  await uc.notify([{ userId: 'u1', kind: 'conformance.findings', link: '/x', params }]);
  assert.equal(heard.u1.length, 1, 'a closed stream hears nothing more');
  assert.equal(hub.listeners('u1'), 0);
});

test('the list is the newest first, at most 50', async () => {
  const repo = notificationRepo();
  const uc = new NotificationUseCases(repo, { publish() {} });
  await uc.notify(Array.from({ length: 60 }, () => ({ userId: 'u1', kind: 'conformance.findings', link: '/x', params: { projectId: 'p', projectName: 'P', count: 1 } })));
  const { items, unread } = await uc.list('u1', 500);
  assert.equal(items.length, 50);
  assert.equal(unread, 60);
  assert.equal(items[0].id, 'n60');
  assert.equal((await uc.list('u1', 'nonsense')).items.length, 20, 'an unreadable limit falls back to 20');
});

test('new findings ring the bell of each person who answers for the workspace, once each, leading to its findings', async () => {
  const sent = [];
  const directory = {
    projectName: async () => 'Shop',
    recipients: async () => [{ userId: 'owner' }, { userId: 'maint' }, { userId: 'owner' }, {}],
  };
  const alert = findingAlerts(directory, { notify: async list => { sent.push(...list); return list; } });
  assert.equal(await alert('p1', 0), 0, 'nothing new: no notification');
  assert.equal(sent.length, 0);
  assert.equal(await alert('p 1', 3), 2);
  assert.deepEqual(sent.map(n => n.userId), ['owner', 'maint']);
  assert.deepEqual(sent[0], {
    userId: 'owner', kind: 'conformance.findings', link: '/project-maintainer/conformance?project=p%201',
    params: { projectId: 'p 1', projectName: 'Shop', count: 3 },
  });
});

test('after mining: the check, the in-app notification of its findings, then the e-mail; a failed notification never stops the e-mail', async () => {
  const calls = [];
  const notifier = { notify: async p => { calls.push(['mail', p]); } };
  const check = { execute: async () => ({ checked: [{ findings: 2 }, { findings: 0 }, { findings: 1 }], skipped: 0 }) };
  await conformanceAfterMining(check, notifier, async (p, n) => { calls.push(['bell', p, n]); })('p1');
  assert.deepEqual(calls, [['bell', 'p1', 3], ['mail', 'p1']]);

  calls.length = 0;
  const errors = [];
  const log = console.error; console.error = (...args) => errors.push(args.join(' '));
  try {
    await conformanceAfterMining(check, notifier, async () => { throw new Error('db down'); })('p2');
  } finally { console.error = log; }
  assert.deepEqual(calls, [['mail', 'p2']]);
  assert.match(errors.join('\n'), /could not notify about findings of project p2/);

  calls.length = 0;
  await conformanceAfterMining({ execute: async () => { throw new ConflictError('Confirm first', 'CONFLICT'); } }, notifier, async () => calls.push(['bell']))('p3');
  assert.deepEqual(calls, [], 'no confirmed diagram: no check, no notification, no e-mail');
  assert.equal(newFindingsOf(undefined), 0);
});

test('the stream sends each new notification of the signed-in person as an event, and stops listening when it closes', () => {
  const hub = new NotificationHub();
  const controller = new NotificationController({}, hub);
  const req = Object.assign(new EventEmitter(), { user: { userId: 'u1' } });
  const written = [];
  const res = Object.assign(new EventEmitter(), {
    status() { return this; }, set(h) { this.headers = h; return this; }, flushHeaders() {}, write(s) { written.push(s); return true; }, end() {},
  });
  controller.stream(req, res, err => { throw err; });
  assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.equal(hub.listeners('u1'), 1);

  hub.publish({ id: 'n1', userId: 'u1', kind: 'conformance.findings', params: { projectId: 'p', projectName: 'P', count: 1 }, link: '/x', createdAt: day(1), readAt: null });
  hub.publish({ id: 'n2', userId: 'u2', kind: 'conformance.findings', params: { projectId: 'p', projectName: 'P', count: 1 }, link: '/x', createdAt: day(1), readAt: null });
  const events = written.filter(s => s.startsWith('event: notification'));
  assert.equal(events.length, 1, "another person's notification is not sent");
  assert.equal(JSON.parse(events[0].split('data: ')[1]).id, 'n1');

  req.emit('close');
  assert.equal(hub.listeners('u1'), 0);
});

test('the stream refuses a request without a signed-in person', () => {
  const controller = new NotificationController({}, new NotificationHub());
  let error = null;
  controller.stream(new EventEmitter(), {}, e => { error = e; });
  assert.equal(error?.statusCode, 401);
});

// ── Automatic check ──────────────────────────────────────────────────────────

const commit = (hash, d) => ({ hash, date: day(d), author: 'a', ref: '', message: 'm', parents: [], trailers: [] });
const index = hashes => ({ full: new Set(hashes), short: new Set(hashes.map(h => h.slice(0, 7))) });

test('the automatic check mines only the commits newer than the newest mined one, never older gaps', () => {
  const commits = [commit('a'.repeat(40), 1), commit('b'.repeat(40), 2), commit('c'.repeat(40), 3), commit('d'.repeat(40), 4), commit('e'.repeat(40), 5)];
  // a and c mined; b is a gap left unmined on purpose; d and e are new.
  const mined = index(['a'.repeat(40), 'c'.repeat(40)]);
  assert.deepEqual(selectNewCommits(commits, mined, day(3)).map(c => c.hash[0]), ['d', 'e']);
  assert.deepEqual(selectNewCommits(commits, mined, null), [], 'nothing mined yet: nothing to check');
  assert.deepEqual(selectNewCommits(commits, index(commits.map(c => c.hash)), day(5)), [], 'everything mined: nothing new');
});

test('WATCH_INTERVAL_MINUTES: 30 by default, 0 or nonsense turns it off', () => {
  assert.equal(watchIntervalMinutes(undefined), 30);
  assert.equal(watchIntervalMinutes(''), 30);
  assert.equal(watchIntervalMinutes('15'), 15);
  assert.equal(watchIntervalMinutes('0'), 0);
  assert.equal(watchIntervalMinutes('-5'), 0);
  assert.equal(watchIntervalMinutes('often'), 0);
});

const candidate = (extra = {}) => ({ projectId: 'p1', ownerId: 'u1', confirmed: true, mined: true, suspended: false, busy: false, lastWatchFailedAt: null, ...extra });

test('only confirmed, mined, idle workspaces of active organizations are checked; a failed one waits six hours', () => {
  const now = day(10);
  assert.equal(shouldWatch(candidate(), now), true);
  for (const extra of [{ confirmed: false }, { mined: false }, { suspended: true }, { busy: true }, { ownerId: '' }]) {
    assert.equal(shouldWatch(candidate(extra), now), false, JSON.stringify(extra));
  }
  assert.equal(shouldWatch(candidate({ lastWatchFailedAt: new Date(now.getTime() - 60_000) }), now), false);
  assert.equal(shouldWatch(candidate({ lastWatchFailedAt: new Date(now.getTime() - RETRY_AFTER_FAILURE_MS) }), now), true);
});

test('a round queues a check for each workspace that needs one; a workspace that became busy just waits', async () => {
  const started = [];
  const watcher = new RepositoryWatcher(60_000, async () => [
    candidate({ projectId: 'p1' }), candidate({ projectId: 'p2', busy: true }), candidate({ projectId: 'p3' }), candidate({ projectId: 'p4' }),
  ], async (projectId, ownerId) => {
    if (projectId === 'p3') throw new ConflictError('A job is already queued or running for this workspace');
    started.push([projectId, ownerId]);
    return `job-${projectId}`;
  });
  assert.equal(await watcher.tick(), 2);
  assert.deepEqual(started, [['p1', 'u1'], ['p4', 'u1']]);
});

test('a slow round is not run twice at once, and a failing list does not stop the watcher', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  let calls = 0;
  const watcher = new RepositoryWatcher(60_000, async () => { calls++; await gate; return [candidate()]; }, async () => 'job');
  const first = watcher.tick();
  assert.equal(await watcher.tick(), 0, 'skipped while the first round runs');
  release();
  assert.equal(await first, 1);
  assert.equal(calls, 1);

  const errors = [];
  const log = console.error; console.error = (...args) => errors.push(args.join(' '));
  try {
    const broken = new RepositoryWatcher(60_000, async () => { throw new Error('db down'); }, async () => 'job');
    assert.equal(await broken.tick(), 0);
  } finally { console.error = log; }
  assert.match(errors.join('\n'), /could not list the workspaces/);
});

test('the watcher does not start when the period is 0, and starts once otherwise', () => {
  assert.equal(new RepositoryWatcher(0, async () => [], async () => 'job').start(), false);
  const watcher = new RepositoryWatcher(60_000, async () => [], async () => 'job');
  assert.equal(watcher.start(), true);
  assert.equal(watcher.start(), false, 'already running');
  watcher.stop();
});
