import test from 'node:test';
import assert from 'node:assert/strict';
import { FindingNotifier, buildFindingsMail, conformanceAfterMining, summarize } from '../src/application/use-cases/conformance/FindingNotifier.ts';
import { UnreadFindingsUseCase } from '../src/application/use-cases/conformance/ConformanceUseCases.ts';
import { MiningService } from '../src/infrastructure/services/MiningService.ts';
import { ConflictError } from '../src/shared/errors/AppError.ts';

// D6 — after every fetch or mine the check runs by itself; maintainers and the organization owner get one e-mail per
// project with what is new, never the same finding twice (RF-29, BR-34); the app shows unread findings (MSG26).

const day = n => new Date(Date.UTC(2026, 10, n));
const finding = (key, hash, date, extra = {}) => ({
  id: `${key}@${hash}`, key, snapshotHash: hash, commitDate: date, type: 'forbidden-dependency', severity: 'error', ruleName: 'Domain stays pure',
  sourceName: 'Domain', targetName: 'Database', files: ['BE/src/domain/a.ts'], importCount: 1, decision: null, outdated: false, notifiedAt: null, ...extra,
});

test('the e-mail lists each problem once, with its newest commit, errors first, and links to the findings page', () => {
  const mail = buildFindingsMail('Shop <Backend>', [
    finding('k1', 'bbbbbbb', day(2)), finding('k1', 'ccccccc', day(3)),
    finding('k2', 'ccccccc', day(3), { type: 'undeclared-dependency', severity: 'warning', ruleName: null, sourceName: 'Web', targetName: '<img src=x>' }),
  ], 'https://app.example/project-maintainer/conformance?project=p1');
  assert.equal(mail.subject, 'ArchTime — 2 new conformance findings in Shop <Backend>');
  assert.match(mail.text, /- \[error\] Forbidden dependency: Domain → Database is forbidden by "Domain stays pure" — commit ccccccc \(and 1 earlier\)/);
  assert.ok(mail.text.indexOf('[error]') < mail.text.indexOf('[warning]'));
  assert.ok(mail.html.includes('Shop &lt;Backend&gt;') && mail.html.includes('&lt;img src=x&gt;') && !mail.html.includes('<img'), 'names are escaped');
  assert.ok(mail.html.includes('href="https://app.example/project-maintainer/conformance?project=p1"'));
});

test('a long list is cut at ten problems and says how many more', () => {
  const many = Array.from({ length: 13 }, (_, i) => finding(`k${String(i).padStart(2, '0')}`, 'ccccccc', day(3)));
  assert.equal(summarize(many).length, 13);
  const mail = buildFindingsMail('P', many, 'x');
  assert.equal((mail.text.match(/^- \[/gm) ?? []).length, 10);
  assert.match(mail.text, /- and 3 more/);
});

// A store that claims like the Mongo one: open, undecided, not outdated, not notified.
function claimStore(rows) {
  return {
    rows,
    async claimUnnotified(_p, at) {
      const taken = rows.filter(f => !f.notifiedAt && !f.decision && !f.outdated);
      taken.forEach(f => { f.notifiedAt = at; });
      return taken;
    },
    async releaseClaim(_p, at) { rows.filter(f => f.notifiedAt === at).forEach(f => { f.notifiedAt = null; }); },
  };
}
const directory = (people = [{ email: 'mia@x.test', name: 'Mia' }, { email: 'owner@x.test', name: 'Olga' }]) => ({ projectName: async () => 'Shop', recipients: async () => people });

test('one e-mail per person per run, and a finding is never e-mailed twice', async () => {
  const store = claimStore([finding('k1', 'bbbbbbb', day(2)), finding('k2', 'bbbbbbb', day(2), { decision: { kind: 'dismiss' } })]);
  const sent = [];
  let clock = 1;
  const notifier = new FindingNotifier(store, directory(), async (to, mail) => { sent.push([to, mail.subject]); }, 'https://app.example/', () => day(clock++));
  assert.deepEqual(await notifier.notify('p1'), { findings: 1, sent: 2 });
  assert.deepEqual(sent.map(s => s[0]), ['mia@x.test', 'owner@x.test']);
  assert.equal(store.rows[1].notifiedAt, null, 'a decided finding is not news');
  assert.deepEqual(await notifier.notify('p1'), { findings: 0, sent: 0 });
  assert.equal(sent.length, 2);
  store.rows.push(finding('k3', 'ccccccc', day(3)));
  await notifier.notify('p1');
  assert.equal(sent.length, 4);
  assert.match(sent[2][1], /1 new conformance finding in Shop/);
});

test('when no e-mail can be sent the findings are given back and go out with the next run', async () => {
  const store = claimStore([finding('k1', 'bbbbbbb', day(2))]);
  let failing = true;
  const sent = [];
  let clock = 1;
  const notifier = new FindingNotifier(store, directory(), async to => { if (failing) throw new Error('SMTP down'); sent.push(to); }, 'x', () => day(clock++));
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual(await notifier.notify('p1'), { findings: 1, sent: 0 }); } finally { console.warn = warn; }
  assert.equal(store.rows[0].notifiedAt, null);
  failing = false;
  assert.deepEqual(await notifier.notify('p1'), { findings: 1, sent: 2 });
  assert.ok(store.rows[0].notifiedAt);
});

test('if one person\'s e-mail fails and another\'s goes out, the findings count as told (no resend to everybody)', async () => {
  const store = claimStore([finding('k1', 'bbbbbbb', day(2))]);
  const notifier = new FindingNotifier(store, directory(), async to => { if (to.startsWith('mia')) throw new Error('mailbox full'); }, 'x', () => day(5));
  assert.deepEqual(await notifier.notify('p1'), { findings: 1, sent: 1 });
  assert.deepEqual(store.rows[0].notifiedAt, day(5));
});

test('after mining: the check runs, then the e-mail; a project without a confirmed diagram is skipped quietly', async () => {
  const calls = [];
  const notifier = { notify: async p => { calls.push(['notify', p]); return { findings: 0, sent: 0 }; } };
  await conformanceAfterMining({ execute: async p => { calls.push(['check', p]); } }, notifier)('p1');
  await conformanceAfterMining({ execute: async () => { throw new ConflictError('Confirm the component diagram first', 'CONFLICT'); } }, notifier)('p2');
  assert.deepEqual(calls, [['check', 'p1'], ['notify', 'p1']]);
  await assert.rejects(conformanceAfterMining({ execute: async () => { throw new Error('database down'); } }, notifier)('p3'), /database down/);
});

test('the mining job never waits for, or fails because of, the automatic check', async () => {
  const before = MiningService.onHistoryChanged;
  const errors = [];
  const log = console.error; console.error = (...args) => errors.push(args.join(' '));
  let release;
  try {
    MiningService.onHistoryChanged = () => new Promise((_, reject) => { release = () => reject(new Error('boom')); });
    const returned = MiningService['afterHistoryChange']('p1');
    assert.equal(returned, undefined, 'fire and forget');
    release();
    await new Promise(r => setImmediate(r));
    assert.match(errors.join('\n'), /automatic check of project p1 failed/);
  } finally {
    console.error = log;
    MiningService.onHistoryChanged = before;
  }
});

test('unread findings (MSG26) are counted only in projects the person can change, most first', async () => {
  const access = {
    readableProjects: async () => [
      { project: { id: 'a', name: 'Alpha' }, access: { actions: new Set(['read', 'write']) } },
      { project: { id: 'b', name: 'Beta' }, access: { actions: new Set(['read']) } },
      { project: { id: 'c', name: 'Gamma' }, access: { actions: new Set(['read', 'write', 'admin']) } },
      { project: { id: 'd', name: 'Delta' }, access: { actions: new Set(['read', 'write']) } },
    ],
  };
  const asked = [];
  const store = { unreadCounts: async (_u, ids) => { asked.push(ids); return new Map([['a', 1], ['b', 9], ['c', 4]]); }, markSeen: async () => {} };
  const result = await new UnreadFindingsUseCase(access, store).unread({ userId: 'u1', role: 'developer-analyst' });
  assert.deepEqual(asked, [['a', 'c', 'd']]);
  assert.deepEqual(result, { total: 5, projects: [{ projectId: 'c', projectName: 'Gamma', count: 4 }, { projectId: 'a', projectName: 'Alpha', count: 1 }] });
});
