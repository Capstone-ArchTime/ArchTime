// The conformance check (F-14): does the code of a snapshot still follow the confirmed component diagram?
//
// 1. Each file goes to the component with the longest path prefix containing it (BR-27; prefixes from paths.ts).
//    A prefix matches whole path segments: "BE/src/domain" covers "BE/src/domain/a.ts" but not "BE/src/domainx/a.ts".
// 2. File imports between two different components add up to a dependency between them, keeping the imports behind it.
// 3. Findings:
//    - forbidden-dependency:        an enabled "forbidden" rule whose dependency is in the code;
//    - missing-required-dependency: an enabled "required" rule whose dependency is not in the code;
//    - undeclared-dependency:       a dependency in the code the diagram does not declare (unless a forbidden rule
//                                   already reports that pair).
//    Each names the files that make it, so a developer knows what to change.
//
// Pure and deterministic (N-07): no clock, no randomness, every list sorted, so the same input gives the same output
// whatever order it came in. Files and imports come from buildView.ts fileDependencies (resolved, file to file).

export interface ConformanceComponent { id: string; name: string; pathPrefixes?: string[] }
export interface ConformanceRule {
  id: string;
  name: string;
  /** A component id, or its name (case does not matter), as the rules page stores it. */
  source: string;
  target: string;
  constraint: 'forbidden' | 'required';
  severity: 'error' | 'warning';
  enabled: boolean;
}

export interface ConformanceInput {
  files: string[];
  imports: { source: string; target: string }[];
  components: ConformanceComponent[];
  /** Dependencies the diagram declares, by component id. */
  dependencies: { source: string; target: string }[];
  rules: ConformanceRule[];
}

export interface ImportRef { from: string; to: string }

export interface ComponentDependency { source: string; target: string; imports: ImportRef[] }

export type ConformanceFindingType = 'forbidden-dependency' | 'missing-required-dependency' | 'undeclared-dependency';

export interface ConformanceFinding {
  /** Identifies the finding across checks of one snapshot: type, rule, source and target. */
  key: string;
  type: ConformanceFindingType;
  ruleId: string | null;
  ruleName: string | null;
  severity: 'error' | 'warning';
  /** Component ids. */
  source: string;
  target: string;
  /** The imports that make the dependency; empty for a missing required one. */
  imports: ImportRef[];
  /** The importing files, the ones to change. */
  files: string[];
}

export interface ConformanceResult {
  assigned: { file: string; componentId: string }[];
  unmappedFiles: string[];
  dependencies: ComponentDependency[];
  findings: ConformanceFinding[];
  /** Enabled rules naming a component the diagram does not have: listed, never guessed. */
  unresolvedRules: string[];
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The component whose longest prefix contains `file`; null when none does. Ties go to the smaller component id. */
export function componentOf(file: string, components: ConformanceComponent[]): string | null {
  let best: { id: string; length: number } | null = null;
  for (const component of components) {
    for (const prefix of component.pathPrefixes ?? []) {
      if (!prefix || (file !== prefix && !file.startsWith(`${prefix}/`))) continue;
      if (!best || prefix.length > best.length || (prefix.length === best.length && byText(component.id, best.id) < 0)) best = { id: component.id, length: prefix.length };
    }
  }
  return best?.id ?? null;
}

export function assignFiles(files: string[], components: ConformanceComponent[]): { assigned: { file: string; componentId: string }[]; unmapped: string[] } {
  const assigned: { file: string; componentId: string }[] = [];
  const unmapped: string[] = [];
  for (const file of [...new Set(files)].sort(byText)) {
    const componentId = componentOf(file, components);
    if (componentId) assigned.push({ file, componentId });
    else unmapped.push(file);
  }
  return { assigned, unmapped };
}

/** Imports between files of two different components, grouped by (source, target), sorted. */
export function componentDependencies(imports: { source: string; target: string }[], owner: ReadonlyMap<string, string>): ComponentDependency[] {
  const groups = new Map<string, ComponentDependency>();
  const seen = new Set<string>();
  for (const edge of imports) {
    const source = owner.get(edge.source), target = owner.get(edge.target);
    if (!source || !target || source === target) continue;
    const importKey = `${edge.source}\u0000${edge.target}`;
    if (seen.has(importKey)) continue;
    seen.add(importKey);
    const key = `${source}\u0000${target}`;
    const group = groups.get(key) ?? { source, target, imports: [] };
    group.imports.push({ from: edge.source, to: edge.target });
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(d => ({ ...d, imports: d.imports.sort((a, b) => byText(a.from, b.from) || byText(a.to, b.to)) }))
    .sort((a, b) => byText(a.source, b.source) || byText(a.target, b.target));
}

/** The component a rule end names: its id, else its name ignoring case; null when the diagram has no such component. */
function resolveRuleEnd(value: string, components: ConformanceComponent[]): string | null {
  const wanted = value.trim();
  const sorted = [...components].sort((a, b) => byText(a.id, b.id));
  return sorted.find(c => c.id === wanted)?.id ?? sorted.find(c => c.name.trim().toLowerCase() === wanted.toLowerCase())?.id ?? null;
}

const filesOf = (imports: ImportRef[]) => [...new Set(imports.map(i => i.from))].sort(byText);

export function checkConformance(input: ConformanceInput): ConformanceResult {
  const { assigned, unmapped } = assignFiles(input.files, input.components);
  const owner = new Map(assigned.map(a => [a.file, a.componentId]));
  const dependencies = componentDependencies(input.imports, owner);
  const inCode = new Map(dependencies.map(d => [`${d.source}\u0000${d.target}`, d]));

  const findings: ConformanceFinding[] = [];
  const unresolvedRules: string[] = [];
  const forbiddenPairs = new Set<string>();
  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    const source = resolveRuleEnd(rule.source, input.components), target = resolveRuleEnd(rule.target, input.components);
    if (!source || !target) { unresolvedRules.push(rule.id); continue; }
    const pair = `${source}\u0000${target}`;
    const found = inCode.get(pair);
    if (rule.constraint === 'forbidden' && found) {
      forbiddenPairs.add(pair);
      findings.push(finding('forbidden-dependency', rule, source, target, found.imports));
    }
    if (rule.constraint === 'required' && !found) findings.push(finding('missing-required-dependency', rule, source, target, []));
  }

  const declared = new Set(input.dependencies.map(d => `${d.source}\u0000${d.target}`));
  for (const d of dependencies) {
    const pair = `${d.source}\u0000${d.target}`;
    if (!declared.has(pair) && !forbiddenPairs.has(pair)) findings.push(finding('undeclared-dependency', null, d.source, d.target, d.imports));
  }

  return {
    assigned,
    unmappedFiles: unmapped,
    dependencies,
    findings: findings.sort((a, b) => byText(a.type, b.type) || byText(a.source, b.source) || byText(a.target, b.target) || byText(a.ruleId ?? '', b.ruleId ?? '')),
    unresolvedRules: [...new Set(unresolvedRules)].sort(byText),
  };
}

function finding(type: ConformanceFindingType, rule: ConformanceRule | null, source: string, target: string, imports: ImportRef[]): ConformanceFinding {
  return {
    key: [type, rule?.id ?? '', source, target].join('|'),
    type,
    ruleId: rule?.id ?? null,
    ruleName: rule?.name ?? null,
    severity: rule?.severity ?? 'warning',
    source,
    target,
    imports,
    files: filesOf(imports),
  };
}
