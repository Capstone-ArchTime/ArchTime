// Research readiness (2026-11-24): RQ1-B guards (configuration recorded in keys, reconciliation gate, structure checks,
// label loss, copying, blind checks), the rq1:labels export/import CLI, the RQ2 preflight, and the PROPOSED (inactive)
// architecture context for the mentor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLabelSheet, configMismatch, FROZEN_CONFIG, identicalLabels, labelLoss, reconcileBlockers, sheetStructureProblems, validateLabelSheet,
} from '../src/domain/evaluation/rq1.ts';
import { answerSlots, contextStatsOf, minedCommitFilter, preflightProblems, questionsOf, RQ2_PROTOCOL_VERSION } from '../src/domain/evaluation/rq2Preflight.ts';
import { promptVersionOf, answerIdOf, fingerprint } from '../src/domain/evaluation/rq2.ts';
import { buildArchitectureContext, componentEdges, folderSummary } from '../src/domain/mentor/architectureContext.ts';

// ── RQ1-B ────────────────────────────────────────────────────────────────────────────────────────────────────────

const change = (kind, before, after) => ({ kind, before, after });
const evaluation = {
  baselineDepth: 1, hasReference: false,
  snapshots: ['s1', 's2', 's3'].map((id, i) => ({ snapshotId: id, snapshot: { hash: `h${i}`, title: id, date: `2026-10-0${i + 1}T00:00:00Z` }, files: 10, components: { recovered: 2, baseline: 2 } })),
  steps: [
    { from: 's1', to: 's2', recovered: { stability: { score: 90 }, changes: [change('split', ['Core'], ['A', 'B'])] }, baseline: { stability: { score: 100 }, changes: [] } },
    { from: 's2', to: 's3', recovered: { stability: { score: 90 }, changes: [change('added', [], ['Jobs'])] }, baseline: { stability: { score: 100 }, changes: [change('added', [], ['jobs'])] } },
  ],
};
const sheetFor = (annotator) => buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation, null, annotator ? { annotator } : {});
const labelAll = (s, verdict = 'wrong') => { for (const p of s.pairs) { p.trueChanges = 0; for (const c of p.changes) c.verdict = verdict; } return s; };

test('configMismatch: a key made with another tolerance, anchoring or evidence rule is reported; unknown is accepted', () => {
  assert.deepEqual(configMismatch(FROZEN_CONFIG, FROZEN_CONFIG), []);
  assert.deepEqual(configMismatch(FROZEN_CONFIG, { ...FROZEN_CONFIG, tolerance: 0.05 }), ['tolerance: 0.02 -> 0.05']);
  assert.deepEqual(configMismatch(FROZEN_CONFIG, { anchored: false, tolerance: null, evidence: true, dominance: 0.5 }), ['anchored: true -> false', 'tolerance: 0.02 -> null']);
  assert.deepEqual(configMismatch(undefined, FROZEN_CONFIG), [], 'keys made before configurations were recorded');
});

test('reconcileBlockers: two complete independent sheets are required unless a sample design is approved', () => {
  const a = labelAll(sheetFor('cong').sheet), b = sheetFor('truong').sheet;
  assert.deepEqual(reconcileBlockers(new Map([['cong', a]])), ['1 annotator sheet(s); reconciliation needs two independent annotators.']);
  assert.deepEqual(reconcileBlockers(new Map([['cong', a], ['truong', b]])), ['truong has 2 of 2 pairs not fully labelled.']);
  assert.deepEqual(reconcileBlockers(new Map([['cong', a], ['truong', b]]), { allowPartial: true }), []);
  assert.deepEqual(reconcileBlockers(new Map([['cong', a], ['truong', labelAll(b)]])), []);
});

test('sheetStructureProblems: other snapshots, missing, extra or duplicated pairs and altered changes are errors', () => {
  const ref = sheetFor().sheet;
  assert.deepEqual(sheetStructureProblems(sheetFor('cong').sheet, ref), []);
  const s = sheetFor('cong').sheet;
  s.pairs[0].from.hash = 'zzz';
  s.pairs[1].changes[0].after = [{ name: 'Renamed' }];
  s.pairs.push(structuredClone(s.pairs[0]));
  const msgs = sheetStructureProblems(s, ref).map(p => p.message);
  assert.ok(msgs.some(m => /the snapshots are h0\.\.h1 in this run/.test(m)));
  assert.ok(msgs.some(m => /kind or components differ/.test(m)));
  assert.ok(msgs.some(m => /listed twice/.test(m)));
  const short = sheetFor('cong').sheet; short.pairs.pop();
  assert.ok(sheetStructureProblems(short, ref).some(p => /Pair s2>s3 of this run is missing/.test(p.message)));
});

test('validateLabelSheet: duplicate change keys are errors; missing evidence notes are warnings; method checks can be turned off', () => {
  const { sheet, key } = sheetFor('cong');
  sheet.pairs[0].changes.push(structuredClone(sheet.pairs[0].changes[0]));
  assert.ok(validateLabelSheet(sheet, key).some(p => p.severity === 'error' && /listed twice/.test(p.message)));
  const { sheet: s2, key: k2 } = sheetFor('cong');
  s2.pairs[1].trueChanges = 0;
  for (const c of s2.pairs[1].changes) c.verdict = 'correct';
  const withMethods = validateLabelSheet(s2, k2).map(p => p.message);
  const blind = validateLabelSheet(s2, k2, { methodChecks: false }).map(p => p.message);
  assert.ok(withMethods.some(m => /changes of one grouping/.test(m)));
  assert.ok(!blind.some(m => /grouping/.test(m)), 'an annotator check reveals nothing about groupings');
  assert.ok(blind.some(m => /"correct" without a note/.test(m)));
  s2.pairs[0].trueChanges = 2;
  assert.ok(validateLabelSheet(s2, k2, { methodChecks: false }).some(p => /trueChanges 2 without a note/.test(p.message)));
});

test('labelLoss and identicalLabels protect against overwriting and copying', () => {
  const done = labelAll(sheetFor('truong').sheet);
  assert.deepEqual(labelLoss(done, done), []);
  const blank = sheetFor('truong').sheet;
  assert.equal(labelLoss(done, blank).length, 2 + 3, 'two trueChanges and three verdicts would be erased');
  assert.deepEqual(labelLoss(blank, done), [], 'adding labels loses nothing');
  assert.equal(identicalLabels(labelAll(sheetFor('a').sheet), labelAll(sheetFor('b').sheet)), true);
  assert.equal(identicalLabels(sheetFor('a').sheet, sheetFor('b').sheet), false, 'two empty sheets are not copying');
  assert.equal(identicalLabels(labelAll(sheetFor('a').sheet), labelAll(sheetFor('b').sheet, 'correct')), false);
});

test('CLI rq1:labels: export copies only one annotator\'s sheets; import refuses foreign, altered or label-erasing sheets', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rq1-labels-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const labels = path.join(root, 'labels');
  fs.mkdirSync(path.join(labels, 'keys'), { recursive: true });
  const { sheet: reconciled, key } = sheetFor();
  const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
  write(path.join(labels, 'demo-p1.json'), reconciled);
  write(path.join(labels, 'keys', 'demo-p1.json'), key);
  write(path.join(labels, 'demo-p1.cong.json'), labelAll(sheetFor('cong').sheet));
  write(path.join(labels, 'demo-p1.truong.json'), sheetFor('truong').sheet);
  const script = path.resolve(import.meta.dirname, '../scripts/rq1-labels.ts');
  const run = (...args) => {
    try { return { code: 0, out: execFileSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: path.dirname(path.dirname(script)), encoding: 'utf8', stdio: 'pipe' }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; }
  };
  const ws = path.join(root, 'truong-workspace');
  const exported = run('export', '--annotator', 'truong', '--to', ws, '--labels', labels);
  assert.equal(exported.code, 0, exported.out);
  assert.deepEqual(fs.readdirSync(ws).sort(), ['demo-p1.truong.json', 'rq1-labelling-guide.md'], 'no key, no other annotator, no reconciled sheet');
  assert.equal(run('export', '--annotator', 'truong', '--to', path.join(labels, 'x'), '--labels', labels).code, 1, 'never inside the labels folder');

  // Trường labels in the workspace and imports.
  const mine = JSON.parse(fs.readFileSync(path.join(ws, 'demo-p1.truong.json'), 'utf8'));
  write(path.join(ws, 'demo-p1.truong.json'), labelAll(mine, 'correct'));
  const ok = run('import', '--annotator', 'truong', '--from', ws, '--labels', labels);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(labels, 'demo-p1.truong.json'), 'utf8')).pairs[0].changes[0].verdict, 'correct');

  // An older, emptier copy would erase labels: refused.
  write(path.join(ws, 'demo-p1.truong.json'), sheetFor('truong').sheet);
  const lossy = run('import', '--annotator', 'truong', '--from', ws, '--labels', labels);
  assert.equal(lossy.code, 1);
  assert.match(lossy.out, /would erase 5 label/);
  // Someone else's sheet renamed as Trường's: refused.
  write(path.join(ws, 'demo-p1.truong.json'), labelAll(sheetFor('cong').sheet));
  assert.match(run('import', '--annotator', 'truong', '--from', ws, '--labels', labels).out, /says annotator "cong" but belongs to "truong"/);

  const checked = run('check', '--labels', labels, '--annotator', 'truong');
  assert.equal(checked.code, 0, checked.out);
  const agreed = run('agree', '--a', 'cong', '--b', 'truong', '--labels', labels, '--out', path.join(root, 'agreement'));
  assert.equal(agreed.code, 0, agreed.out);
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'agreement', 'agreement.json'), 'utf8'));
  assert.equal(summary.pooled.verdicts.n, 3);
  assert.equal(summary.pooled.verdicts.agreement, 0, 'cong said wrong, truong said correct everywhere');
});

// ── RQ2 preflight ────────────────────────────────────────────────────────────────────────────────────────────────

const q = (id, answerable = true) => ({ id, text: `Question ${id} about {repo}?`, answerable, expected: 'x' });
const questionsFile = { version: '1.1', repos: [{ repo: 'r', questions: 'standard' }], standard: [...Array.from({ length: 8 }, (_, i) => q(`Q${i + 1}`)), q('Q9', false), q('Q10', false)] };
const contextText = 'SNAPSHOTS (newest first)\n- a\n\nCHANGE EVIDENCE\n- b\n\nLATEST STRUCTURE (snapshot)';
// Protocol 1.3 data: snapshot/evidence part and the ARCHITECTURE sections.
const context13 = ['SNAPSHOTS (newest first)', 'CHANGE EVIDENCE', 'ARCHITECTURE (computed by ArchTime)', 'FOLDERS of the latest snapshot', 'COMPONENTS at milestone', 'COMPONENT DEPENDENCIES', 'EVOLUTION EVENTS', 'MILESTONES', 'LARGEST DEPENDENCY CHANGES'].join('\n');
const good = { repo: 'r', questionsFile, runs: 3, model: { id: 'p/m' }, project: { found: true, snapshots: 10, evidences: 3 }, context: { text: context13, sha: 'ctx1', version: '1.3', withheld: false }, existing: [], mentorPrompt: 'MENTOR', approvedProtocol: RQ2_PROTOCOL_VERSION };
const recorded = (questionId, condition, run, extra = {}) => ({
  repo: 'r', questionId, question: '', answerable: true, expected: '', condition, run, model: 'p/m', text: '', raw: '', check: null, validCitations: [], usage: null,
  latencyMs: 1, askedAt: '', promptVersion: promptVersionOf(condition, 'MENTOR'), contextSha256: condition === 'C0' ? null : 'ctx1', ...extra,
});

test('preflight passes a ready run and blocks one without protocol approval or a model', () => {
  assert.deepEqual(preflightProblems(good), []);
  const blocked = preflightProblems({ ...good, approvedProtocol: null, model: { error: 'AI refinement is not configured on this server' } });
  assert.deepEqual(blocked.map(p => p.check), ['protocol', 'model']);
  assert.ok(blocked.every(p => p.severity === 'error'));
  assert.equal(preflightProblems({ ...good, approvedProtocol: '1.2' })[0].check, 'protocol', 'approval must name the current protocol version (1.3)');
});

test('preflight checks the question set, the workspace and the project data', () => {
  const messages = (input) => preflightProblems({ ...good, ...input }).map(p => `${p.severity}:${p.check}:${p.message}`);
  assert.ok(messages({ questionsFile: { ...questionsFile, version: undefined } }).some(m => /no version/.test(m)));
  assert.ok(messages({ repo: 'other' }).some(m => /No questions for repository "other"/.test(m)));
  assert.ok(messages({ questionsFile: { ...questionsFile, standard: questionsFile.standard.slice(1) } }).some(m => /9 questions for r/.test(m)));
  assert.ok(messages({ questionsFile: { ...questionsFile, standard: [...questionsFile.standard.slice(0, 9), q('Q1', false)] } }).some(m => /not unique/.test(m)));
  assert.ok(messages({ questionsFile: { ...questionsFile, standard: [...questionsFile.standard.slice(0, 9), { ...q('Q10', false), text: 'About {project}?' }] } }).some(m => /unknown placeholder/.test(m)));
  assert.ok(messages({ questionsFile: { ...questionsFile, standard: [...questionsFile.standard.slice(0, 9), q('Q10', true)] } }).some(m => /8 answerable and 2 unanswerable/.test(m)));
  assert.ok(messages({ project: { found: false, snapshots: 0, evidences: 0 } }).some(m => /does not exist/.test(m)));
  assert.ok(messages({ project: { found: true, snapshots: 5, evidences: 0 } }).some(m => /no change evidence/.test(m)));
  assert.ok(messages({ context: { text: 'SNAPSHOTS only', sha: 'x', version: '1.3' } }).some(m => /no CHANGE EVIDENCE section/.test(m)));
  assert.ok(messages({ context: { text: `${context13}\n(project data truncated)`, sha: 'x', version: '1.3' } }).some(m => m.startsWith('warning:context')));
  assert.ok(messages({ context: { text: contextText, sha: 'x' } }).some(m => /version 1\.2; protocol 1\.3 prescribes 1\.3/.test(m)), 'a 1.2 context is refused under protocol 1.3');
  assert.ok(messages({ context: { text: context13, sha: 'x', version: '1.3', withheld: true } }).some(m => /withheld by the test-set lock/.test(m)));
});

test('preflight detects duplicate or misnamed answer ids, mixed prompts, models and project data', () => {
  const a = recorded('Q1', 'C2', 1);
  assert.deepEqual(preflightProblems({ ...good, existing: [{ file: 'r.Q1.C2.json', answer: a }] }), []);
  const msgs = preflightProblems({ ...good, existing: [
    { file: 'r.Q1.C2.json', answer: a },
    { file: 'r.Q1.C2.copy.json', answer: a },
    { file: 'r.Q2.C2.json', answer: recorded('Q2', 'C2', 1, { promptVersion: 'C2-old' }) },
    { file: 'r.Q3.C1.json', answer: recorded('Q3', 'C1', 1, { model: 'p/other' }) },
    { file: 'r.Q4.C1.json', answer: recorded('Q4', 'C1', 1, { contextSha256: 'ctx0' }) },
    { file: 'r.Q5.C0.json', answer: recorded('Q5', 'C0', 1, { answerId: 'r.Q6.C0.r1' }) },
    { file: 'r.Q99.C0.json', answer: recorded('Q99', 'C0', 1) },
  ] }).map(p => p.message);
  assert.ok(msgs.some(m => /Answer id r\.Q1\.C2\.r1 appears in 2 files/.test(m)));
  assert.ok(msgs.some(m => /r\.Q1\.C2\.copy\.json holds r\.Q1\.C2\.r1; its file name should be r\.Q1\.C2\.json/.test(m)));
  assert.ok(msgs.some(m => /produced with prompt C2-old/.test(m)));
  assert.ok(msgs.some(m => /produced by p\/other/.test(m)));
  assert.ok(msgs.some(m => /saw project data ctx0/.test(m)));
  assert.ok(msgs.some(m => /says r\.Q6\.C0\.r1 but holds r\.Q5\.C0\.r1/.test(m)));
  assert.ok(msgs.some(m => /question Q99 is not in the question set/.test(m)));
});

test('answer slots: 10 questions x 3 conditions x 3 runs = 90 per repository, 270 for three', () => {
  const ids = questionsOf(questionsFile, 'r').map(x => x.id);
  const slots = answerSlots('r', ids, 3, [recorded('Q1', 'C0', 1), recorded('Q1', 'C0', 2), recorded('Q1', 'C0', 2, { repo: 'other' })]);
  assert.deepEqual([slots.expected, slots.present, slots.missing.length], [90, 2, 88]);
  assert.equal(slots.expected * 3, 270);
  assert.ok(!slots.missing.includes(answerIdOf({ repo: 'r', questionId: 'Q1', condition: 'C0', run: 1 })));
});

test('C2 accepts only commits still in the repository, as the mentor in the app; context stats are recorded', () => {
  assert.deepEqual(minedCommitFilter('p1'), { projectId: 'p1', missingSince: null });
  assert.deepEqual(contextStatsOf(`${contextText}\n(project data truncated)`, 15, 25), { chars: contextText.length + 25, truncated: true, snapshotsShown: 15, evidencesShown: 25, hasStructure: true });
  assert.equal(fingerprint('x').length, 16);
});

// ── Proposed architecture context (inactive) ─────────────────────────────────────────────────────────────────────

const comp = (id, name, memberIds, extra = {}) => ({ id, name, memberIds, ...extra });
const m1 = { hash: 'aaaaaaa1111', date: '2025-01-01T00:00:00Z', version: 'v1.0.0', generator: 'cluster+llm', edges: [{ source: 'src/core/a.ts', target: 'src/core/b.ts' }, { source: 'src/web/w.ts', target: 'src/core/a.ts' }],
  components: [comp('core', 'Core', ['src/core/a.ts', 'src/core/b.ts', 'src/core/c.ts'], { role: 'service', description: 'Domain logic.' }), comp('web', 'Web', ['src/web/w.ts', 'src/web/x.ts', 'src/web/y.ts']), comp('u', 'Unassigned Files', ['scripts/s.ts'])] };
const m2 = { ...m1, hash: 'bbbbbbb2222', date: '2025-06-01T00:00:00Z', version: 'v2.0.0',
  components: [...m1.components.slice(0, 2), comp('jobs', 'Jobs', ['src/jobs/j1.ts', 'src/jobs/j2.ts', 'src/jobs/j3.ts'], { description: 'Background jobs.' })],
  edges: [...m1.edges, { source: 'src/jobs/j1.ts', target: 'src/core/a.ts' }, { source: 'src/jobs/j2.ts', target: 'src/core/b.ts' }] };

test('folderSummary and componentEdges are derived from paths and imports only', () => {
  assert.deepEqual(folderSummary(['src/core/a.ts', 'src/core/b.ts', 'src/web/w.ts', 'README.ts']), [{ folder: 'src/core/', files: 2 }, { folder: '(root)', files: 1 }, { folder: 'src/web/', files: 1 }]);
  assert.deepEqual(componentEdges(m2.components, m2.edges), [{ from: 'Jobs', to: 'Core', imports: 2 }, { from: 'Web', to: 'Core', imports: 1 }]);
});

test('buildArchitectureContext: components, dependencies, events and milestones, with provenance and caps', () => {
  const files = m2.components.flatMap(c => c.memberIds);
  const ctx = buildArchitectureContext([m1, m2], files);
  assert.match(ctx.text, /names, roles and descriptions were written by an AI model and are not facts/);
  assert.match(ctx.text, /- Core \[service\]: 3 files; e\.g\. src\/core\/a\.ts, src\/core\/b\.ts, src\/core\/c\.ts; description \(generated\): Domain logic\./);
  assert.match(ctx.text, /- Jobs -> Core \(2 imports\)/);
  assert.match(ctx.text, /- added \(new-files\): — -> Jobs between `aaaaaaa` 2025-01-01 and `bbbbbbb` 2025-06-01/);
  assert.match(ctx.text, /- `aaaaaaa` v1\.0\.0 2025-01-01: 7 files, 2 components, grouping cluster\+llm/);
  assert.ok(!/Unassigned Files -/.test(ctx.text), 'the unassigned bucket is not presented as a component');
  assert.deepEqual(ctx.knownCommits, ['aaaaaaa', 'bbbbbbb']);
  assert.deepEqual([ctx.stats.components, ctx.stats.componentEdges, ctx.stats.events, ctx.stats.truncated], [3, 2, 1, false]);
  const capped = buildArchitectureContext([m1, m2], files, { maxComponents: 1 });
  assert.match(capped.text, /\(2 more components not listed\)/);
  assert.equal(capped.stats.truncated, true);
  const tight = buildArchitectureContext([m1, m2], files, { maxChars: 600 });
  assert.match(tight.text, /\(architecture data truncated\)$/);
  assert.equal(tight.stats.truncated, true);
  assert.ok(tight.text.length <= 600 + '\n(architecture data truncated)'.length);
  assert.deepEqual(buildArchitectureContext([], []).text, '');
});

// ── Scoring and agreement edge cases (zero denominators) ─────────────────────────────────────────────────────────

test('RQ1-B scoring: nothing reported, no real change, or both, give null (undefined), never a made-up 0 or 1', async () => {
  const { scoreLabels } = await import('../src/domain/evaluation/rq1.ts');
  const { cohenKappa, gwetAC1 } = await import('../src/domain/evaluation/stats.ts');
  const quiet = { ...evaluation, steps: evaluation.steps.map(s => ({ ...s, recovered: { ...s.recovered, changes: [] }, baseline: { ...s.baseline, changes: [] } })) };
  const none = buildLabelSheet({ id: 'p1', name: 'Demo' }, quiet);
  for (const p of none.sheet.pairs) p.trueChanges = 0;
  const s0 = scoreLabels([none]).methods.recovered;
  assert.deepEqual([s0.detected, s0.correct, s0.truth, s0.precision, s0.recall, s0.f1], [0, 0, 0, null, null, null], 'no event, no real change');
  const missed = buildLabelSheet({ id: 'p1', name: 'Demo' }, quiet);
  for (const p of missed.sheet.pairs) p.trueChanges = 1;
  const s1 = scoreLabels([missed]).methods.recovered;
  assert.deepEqual([s1.precision, s1.recall, s1.f1], [null, 0, null], 'real changes but nothing reported: recall 0 (FN = 2), precision undefined');
  const noisy = sheetFor();
  for (const p of noisy.sheet.pairs) { p.trueChanges = 0; for (const c of p.changes) c.verdict = 'wrong'; }
  const s2 = scoreLabels([noisy]).methods.recovered;
  assert.deepEqual([s2.detected, s2.correct, s2.truth, s2.precision, s2.recall, s2.f1], [2, 0, 0, 0, null, null], 'only false positives: precision 0, recall undefined');
  assert.equal(cohenKappa([['wrong', 'wrong'], ['wrong', 'wrong']]).kappa, null, 'kappa undefined when chance agreement is total');
  assert.equal(gwetAC1([['wrong', 'wrong'], ['wrong', 'wrong']], ['correct', 'wrong']).ac1, 1, 'AC1 still defined');
  assert.equal(cohenKappa([]), null);
});

test('buildArchitectureContext: the optional whole-history ranking of dependency changes, its commits known to the citation check', () => {
  const files = m2.components.flatMap(c => c.memberIds);
  const ctx = buildArchitectureContext([m1, m2], files, {}, [{ hash: 'ccccccc3333', date: '2025-03-01T00:00:00Z', author: 'Ann', title: 'Move core', depAdded: 40, depRemoved: 12, files: 9 }]);
  assert.match(ctx.text, /LARGEST DEPENDENCY CHANGES over the whole mined history/);
  assert.match(ctx.text, /- `ccccccc` 2025-03-01 by Ann: \+40\/-12 dependencies, 9 files "Move core"/);
  assert.deepEqual(ctx.knownCommits, ['aaaaaaa', 'bbbbbbb', 'ccccccc']);
  assert.ok(!/LARGEST/.test(buildArchitectureContext([m1, m2], files).text), 'absent when not given');
});
