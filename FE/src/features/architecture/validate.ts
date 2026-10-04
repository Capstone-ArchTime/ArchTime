import { COMPONENT_ROLES, DEPENDENCY_KINDS, PROVENANCES } from './types.ts';
import type { ValidationIssue, ValidationResult } from './types.ts';

export interface ValidateOptions {
  minComponents?: number;
  maxComponents?: number;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Rule codes (stable, safe to match on):
 *  S001 malformed field           S002 duplicate id
 *  V001 class in no / many components   V002 component count out of range
 *  V003 reference to unknown id   V004 empty component     V005 duplicate component name
 *  V006 edge not backed by class dependencies   V007 weight / kinds disagree with evidence
 *  V008 self edge                 V009 duplicate edge for the same pair
 */
export function validateView(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const { minComponents = 8, maxComponents = 15 } = options;
  const issues: ValidationIssue[] = [];
  const add = (code: string, subject: string, message: string, severity: ValidationIssue['severity'] = 'error', evidence?: ValidationIssue['evidence']) =>
    issues.push({ code, severity, subject, message, ...(evidence ? { evidence } : {}) });

  if (!isRec(input)) { add('S001', 'view', 'The view must be an object.'); return { ok: false, issues }; }
  if (input.schemaVersion !== 1) add('S001', 'schemaVersion', 'schemaVersion must be 1.');
  for (const key of ['projectId', 'snapshotId', 'title'] as const) if (!isStr(input[key])) add('S001', key, `${key} must be a non-empty string.`);
  if (input.unit !== undefined && input.unit !== 'class' && input.unit !== 'file') add('S001', 'unit', 'unit must be "class" or "file" when present.');
  for (const key of ['components', 'edges', 'classes', 'classEdges'] as const) {
    if (!Array.isArray(input[key])) { add('S001', key, `${key} must be an array.`); }
  }
  if (issues.some(i => i.code === 'S001' && ['components', 'edges', 'classes', 'classEdges'].includes(i.subject))) return { ok: false, issues };

  const components = input.components as unknown[];
  const edges = input.edges as unknown[];
  const classes = input.classes as unknown[];
  const classEdges = input.classEdges as unknown[];

  const componentIds = new Map<string, Rec>();
  const names = new Map<string, string>();
  components.forEach((c, i) => {
    if (!isRec(c) || !isStr(c.id) || !isStr(c.name) || !Array.isArray(c.memberIds)) { add('S001', `components[${i}]`, 'A component needs id, name and memberIds.'); return; }
    if (!COMPONENT_ROLES.includes(c.role as never)) add('S001', c.id, `Unknown role "${String(c.role)}".`);
    if (!PROVENANCES.includes(c.label as never)) add('S001', c.id, `label must be FACT, INFERENCE or UNKNOWN.`);
    if (componentIds.has(c.id)) add('S002', c.id, `Duplicate component id "${c.id}".`);
    componentIds.set(c.id, c);
    const key = c.name.trim().toLowerCase();
    if (names.has(key)) add('V005', c.id, `Component name "${c.name}" is also used by "${names.get(key)}".`);
    else names.set(key, c.id);
    if (c.memberIds.length === 0) add('V004', c.id, `Component "${c.name}" has no classes.`);
  });

  if (components.length < minComponents || components.length > maxComponents) {
    add('V002', 'components', `Expected ${minComponents}-${maxComponents} components, found ${components.length}.`, 'warning', { count: components.length, min: minComponents, max: maxComponents });
  }

  const classIds = new Map<string, Rec>();
  classes.forEach((c, i) => {
    if (!isRec(c) || !isStr(c.id) || !isStr(c.name) || !isStr(c.componentId) || !isStr(c.path)) { add('S001', `classes[${i}]`, 'A class needs id, name, componentId and path.'); return; }
    if (classIds.has(c.id)) add('S002', c.id, `Duplicate class id "${c.id}".`);
    classIds.set(c.id, c);
  });

  // Every class belongs to exactly one component, and both sides of the relation agree.
  const owners = new Map<string, string[]>();
  for (const [id, c] of componentIds) {
    for (const m of c.memberIds as unknown[]) {
      if (typeof m !== 'string' || !classIds.has(m)) { add('V003', id, `Component "${id}" lists unknown class "${String(m)}".`); continue; }
      owners.set(m, [...(owners.get(m) ?? []), id]);
    }
  }
  for (const [id, cls] of classIds) {
    const own = owners.get(id) ?? [];
    if (own.length !== 1) add('V001', id, own.length === 0 ? `Class "${id}" belongs to no component.` : `Class "${id}" belongs to ${own.length} components.`, 'error', { components: own.join(',') });
    else if (own[0] !== cls.componentId) add('V001', id, `Class "${id}" says it belongs to "${String(cls.componentId)}" but is listed in "${own[0]}".`);
  }

  const classEdgeKeys = new Set<string>();
  classEdges.forEach((e, i) => {
    if (!isRec(e) || !isStr(e.source) || !isStr(e.target) || !isStr(e.path) || !DEPENDENCY_KINDS.includes(e.kind as never)) { add('S001', `classEdges[${i}]`, 'A class edge needs source, target, kind and path.'); return; }
    if (!classIds.has(e.source) || !classIds.has(e.target)) { add('V003', `classEdges[${i}]`, `Class edge ${e.source} -> ${e.target} references an unknown class.`); return; }
    classEdgeKeys.add(`${e.source}\u0000${e.target}\u0000${e.kind}`);
  });

  const pairs = new Set<string>();
  edges.forEach((e, i) => {
    if (!isRec(e) || !isStr(e.id) || !isStr(e.source) || !isStr(e.target) || !Array.isArray(e.evidence) || typeof e.weight !== 'number' || !isRec(e.kinds)) {
      add('S001', `edges[${i}]`, 'An edge needs id, source, target, weight, kinds and evidence.'); return;
    }
    if (!componentIds.has(e.source) || !componentIds.has(e.target)) { add('V003', e.id, `Edge ${e.id} references an unknown component.`); return; }
    if (e.source === e.target) { add('V008', e.id, `Edge ${e.id} connects a component to itself.`); return; }
    const pair = `${e.source}\u0000${e.target}`;
    if (pairs.has(pair)) add('V009', e.id, `More than one edge goes from "${e.source}" to "${e.target}".`);
    pairs.add(pair);

    const edgeId = e.id;
    const kinds = e.kinds as Record<string, unknown>;
    const sourceMembers = new Set(componentIds.get(e.source)!.memberIds as string[]);
    const targetMembers = new Set(componentIds.get(e.target)!.memberIds as string[]);
    const counts: Record<string, number> = {};
    (e.evidence as unknown[]).forEach((ev, j) => {
      if (!isRec(ev) || !isStr(ev.fromClass) || !isStr(ev.toClass) || !isStr(ev.kind)) { add('S001', `${edgeId}.evidence[${j}]`, 'Evidence needs fromClass, toClass and kind.'); return; }
      const kind = ev.kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
      const backed = sourceMembers.has(ev.fromClass) && targetMembers.has(ev.toClass) && classEdgeKeys.has(`${ev.fromClass}\u0000${ev.toClass}\u0000${kind}`);
      if (!backed) add('V006', edgeId, `Evidence ${ev.fromClass} -> ${ev.toClass} (${ev.kind}) does not match a class dependency between these components.`);
    });
    const evidenceCount = (e.evidence as unknown[]).length;
    if (evidenceCount === 0) add('V006', e.id, `Edge ${e.id} has no evidence.`);
    const kindTotal = Object.values(kinds).reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
    const kindsMatch = Object.keys({ ...counts, ...kinds }).every(k => (counts[k] ?? 0) === (kinds[k] ?? 0));
    if (e.weight !== evidenceCount || kindTotal !== evidenceCount || !kindsMatch) {
      add('V007', e.id, `Edge ${e.id} reports weight ${e.weight} but has ${evidenceCount} evidence entries.`, 'error', { weight: e.weight, evidence: evidenceCount });
    }
  });

  return { ok: !issues.some(i => i.severity === 'error'), issues };
}
