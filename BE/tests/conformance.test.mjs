import test from 'node:test';
import assert from 'node:assert/strict';
import { assignFiles, checkConformance, componentOf } from '../src/domain/architecture/conformance.ts';

// D3 — the conformance check compares the code of a snapshot with the confirmed diagram (F-14, N-07):
// files go to the component with the longest matching path prefix, file imports add up to dependencies between
// components, and the result lists rule violations and dependencies the diagram does not declare, with the files behind
// each. Pure and deterministic: the same input gives the same output.

const components = [
  { id: 'web', name: 'Web', pathPrefixes: ['FE/src'] },
  { id: 'api', name: 'API', pathPrefixes: ['BE/src'] },
  { id: 'domain', name: 'Domain', pathPrefixes: ['BE/src/domain'] },
  { id: 'db', name: 'Database', pathPrefixes: ['BE/src/infrastructure/database'] },
  { id: 'ext', name: 'Payments', pathPrefixes: [] },
];

test('a file belongs to the component with the longest prefix that contains it, on whole path segments', () => {
  assert.equal(componentOf('BE/src/domain/order.ts', components), 'domain');
  assert.equal(componentOf('BE/src/app.ts', components), 'api');
  assert.equal(componentOf('BE/src/infrastructure/database/models/Order.ts', components), 'db');
  assert.equal(componentOf('BE/src/domainx/a.ts', components), 'api', 'domainx is not inside domain');
  assert.equal(componentOf('BE/src', components), 'api', 'a prefix can name a file or folder exactly');
  assert.equal(componentOf('README.md', components), null);
});

test('files are assigned in path order; files no prefix covers are listed apart', () => {
  const { assigned, unmapped } = assignFiles(['README.md', 'FE/src/main.tsx', 'BE/src/domain/a.ts', 'BE/src/app.ts'], components);
  assert.deepEqual(assigned, [
    { file: 'BE/src/app.ts', componentId: 'api' },
    { file: 'BE/src/domain/a.ts', componentId: 'domain' },
    { file: 'FE/src/main.tsx', componentId: 'web' },
  ]);
  assert.deepEqual(unmapped, ['README.md']);
});

const files = [
  'FE/src/api.ts', 'FE/src/pages/Orders.tsx',
  'BE/src/app.ts', 'BE/src/controllers/orders.ts',
  'BE/src/domain/order.ts', 'BE/src/domain/rules.ts',
  'BE/src/infrastructure/database/models/Order.ts',
  'scripts/seed.ts',
];
const imports = [
  { source: 'BE/src/controllers/orders.ts', target: 'BE/src/domain/order.ts' }, // api -> domain (declared)
  { source: 'BE/src/app.ts', target: 'BE/src/controllers/orders.ts' },          // inside api: ignored
  { source: 'BE/src/domain/order.ts', target: 'BE/src/infrastructure/database/models/Order.ts' }, // domain -> db (forbidden)
  { source: 'BE/src/domain/rules.ts', target: 'BE/src/infrastructure/database/models/Order.ts' }, // domain -> db again
  { source: 'BE/src/domain/order.ts', target: 'BE/src/domain/rules.ts' },       // inside domain: ignored
  { source: 'FE/src/pages/Orders.tsx', target: 'BE/src/domain/order.ts' },      // web -> domain (undeclared)
  { source: 'scripts/seed.ts', target: 'BE/src/domain/order.ts' },              // from an unmapped file: no component dependency
];
const declared = [{ source: 'api', target: 'domain' }, { source: 'web', target: 'api' }, { source: 'api', target: 'db' }];
const rules = [
  { id: 'r1', name: 'Domain stays pure', source: 'Domain', target: 'database', constraint: 'forbidden', severity: 'error', rationale: '', enabled: true },
  { id: 'r2', name: 'Web goes through the API', source: 'web', target: 'api', constraint: 'required', severity: 'warning', rationale: '', enabled: true },
  { id: 'r3', name: 'Switched off', source: 'web', target: 'domain', constraint: 'forbidden', severity: 'error', rationale: '', enabled: false },
  { id: 'r4', name: 'Names a component that is gone', source: 'Legacy', target: 'api', constraint: 'forbidden', severity: 'error', rationale: '', enabled: true },
];
const input = () => ({ files, imports, components, dependencies: declared, rules });

test('imports add up to dependencies between components, with the imports behind each', () => {
  const result = checkConformance(input());
  assert.deepEqual(result.dependencies.map(d => [d.source, d.target, d.imports.length]), [
    ['api', 'domain', 1],
    ['domain', 'db', 2],
    ['web', 'domain', 1],
  ]);
  assert.deepEqual(result.dependencies[1].imports, [
    { from: 'BE/src/domain/order.ts', to: 'BE/src/infrastructure/database/models/Order.ts' },
    { from: 'BE/src/domain/rules.ts', to: 'BE/src/infrastructure/database/models/Order.ts' },
  ]);
  assert.deepEqual(result.unmappedFiles, ['scripts/seed.ts']);
});

test('a forbidden dependency found in the code is a rule violation, with the files that make it', () => {
  const finding = checkConformance(input()).findings.find(f => f.type === 'forbidden-dependency');
  assert.deepEqual(
    { type: finding.type, ruleId: finding.ruleId, severity: finding.severity, source: finding.source, target: finding.target, files: finding.files },
    { type: 'forbidden-dependency', ruleId: 'r1', severity: 'error', source: 'domain', target: 'db', files: ['BE/src/domain/order.ts', 'BE/src/domain/rules.ts'] },
  );
  assert.equal(finding.imports.length, 2);
});

test('a required dependency missing from the code is a rule violation without imports', () => {
  const finding = checkConformance(input()).findings.find(f => f.type === 'missing-required-dependency');
  assert.deepEqual({ ruleId: finding.ruleId, severity: finding.severity, source: finding.source, target: finding.target, imports: finding.imports, files: finding.files },
    { ruleId: 'r2', severity: 'warning', source: 'web', target: 'api', imports: [], files: [] });
});

test('a dependency in the code that the diagram does not declare is reported once, not again when a rule already forbids it', () => {
  const undeclared = checkConformance(input()).findings.filter(f => f.type === 'undeclared-dependency');
  assert.deepEqual(undeclared.map(f => [f.source, f.target, f.severity, f.ruleId, f.files]), [['web', 'domain', 'warning', null, ['FE/src/pages/Orders.tsx']]]);
});

test('disabled rules are skipped and rules naming no component are listed, not guessed', () => {
  const result = checkConformance(input());
  assert.ok(!result.findings.some(f => f.ruleId === 'r3' || f.ruleId === 'r4'));
  assert.deepEqual(result.unresolvedRules, ['r4']);
});

test('every finding has a stable key: type, rule, source and target', () => {
  assert.deepEqual(checkConformance(input()).findings.map(f => f.key), [
    'forbidden-dependency|r1|domain|db',
    'missing-required-dependency|r2|web|api',
    'undeclared-dependency||web|domain',
  ]);
});

test('the same input in any order gives the same output (N-07)', () => {
  const first = checkConformance(input());
  const reversed = checkConformance({
    files: [...files].reverse(), imports: [...imports, imports[0]].reverse(), components: [...components].reverse(),
    dependencies: [...declared].reverse(), rules: [...rules].reverse(),
  });
  assert.deepEqual(reversed, first);
});

test('a diagram without path prefixes maps nothing and finds only missing required dependencies', () => {
  const result = checkConformance({ ...input(), components: components.map(c => ({ ...c, pathPrefixes: [] })) });
  assert.equal(result.dependencies.length, 0);
  assert.equal(result.unmappedFiles.length, files.length);
  assert.deepEqual(result.findings.map(f => f.type), ['missing-required-dependency']);
});

test('it takes the file graph a mined snapshot stores, through fileDependencies', async () => {
  const { fileDependencies } = await import('../src/domain/architecture/buildView.ts');
  const graph = {
    nodes: ['BE/src/domain/order.ts', 'BE/src/infrastructure/database/models/Order.ts', 'BE/src/domain/order.test.ts'].map(id => ({ id })),
    edges: [
      { source: 'BE/src/domain/order.ts', target: 'BE/src/infrastructure/database/models/Order.js' }, // TypeScript writes .js for .ts
      { source: 'BE/src/domain/order.ts', target: 'mongoose' },                                     // a package: dropped
      { source: 'BE/src/domain/order.test.ts', target: 'BE/src/infrastructure/database/models/Order' }, // tests are not analyzed
    ],
  };
  const { files, edges } = fileDependencies(graph);
  const result = checkConformance({ files, imports: edges, components, dependencies: [], rules: [rules[0]] });
  assert.deepEqual(result.findings.map(f => [f.key, f.files]), [['forbidden-dependency|r1|domain|db', ['BE/src/domain/order.ts']]]);
});
