import { createHash } from 'node:crypto';
import { clusterFiles } from './cluster.js';
import type { ClusterOptions } from './cluster.js';
import { deriveComponentEdges } from './derive.js';
import { describeGroups } from './naming.js';
import { resolveImportTarget } from './resolveImport.js';
import type { ArchClass, ArchComponent, ArchitectureView, ClassEdge, ComponentRole, Provenance } from './types.js';

export interface SnapshotGraph {
  nodes: { id: string; name?: string; type?: string }[];
  edges: { source: string; target: string; type?: string }[];
}

/** What is persisted: which file belongs to which component, and how each component is described. */
export interface MappingComponent {
  id: string;
  name: string;
  role: ComponentRole;
  label: Provenance;
  description: string;
  layer?: number;
  memberIds: string[];
}

export const ALGORITHM_VERSION = 'cluster-louvain-1';
const EXCLUDED = /(^|\/)(node_modules|dist|build|coverage|__tests__|__mocks__|tests?)\/|\.(test|spec)\.[a-z]+$|\.d\.ts$/i;

export const isAnalyzable = (path: string) => !EXCLUDED.test(path);

/** Hash of the graph the mapping was computed from, to tell when it has gone stale. */
export function graphHash(graph: SnapshotGraph): string {
  const hash = createHash('sha1');
  for (const n of [...graph.nodes].map(n => n.id).sort()) hash.update(`n:${n}\n`);
  for (const e of [...graph.edges].map(e => `${e.source}>${e.target}`).sort()) hash.update(`e:${e}\n`);
  return hash.digest('hex');
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component';

/** Relative imports arrive already joined with the importer's folder; `@/x` and `~/x` mean `<nearest src folder>/x`. */
function resolveSpecifier(files: ReadonlySet<string>, importer: string, target: string): string | null {
  const direct = resolveImportTarget(files, target);
  if (direct) return direct;
  const alias = /^[@~]\/(.+)$/.exec(target);
  if (!alias) return null;
  const at = importer.startsWith('src/') ? 0 : importer.indexOf('/src/') + 1;
  return at >= 0 && (at > 0 || importer.startsWith('src/')) ? resolveImportTarget(files, `${importer.slice(0, at)}src/${alias[1]}`) : null;
}

/** Resolved file-to-file dependencies between analyzable files (npm packages and unresolved imports are dropped). */
export function fileDependencies(graph: SnapshotGraph): { files: string[]; edges: { source: string; target: string; kind: 'imports' }[] } {
  const files = [...new Set(graph.nodes.map(n => n.id).filter(isAnalyzable))].sort();
  const set = new Set(files);
  const seen = new Set<string>();
  const edges: { source: string; target: string; kind: 'imports' }[] = [];
  for (const e of graph.edges) {
    if (!set.has(e.source)) continue;
    const target = resolveSpecifier(set, e.source, e.target);
    if (!target || target === e.source) continue;
    const key = `${e.source}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source: e.source, target, kind: 'imports' });
  }
  return { files, edges: edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target)) };
}

export function proposeMapping(graph: SnapshotGraph, options: Partial<ClusterOptions> = {}): { components: MappingComponent[]; resolution: number } {
  const { files, edges } = fileDependencies(graph);
  const result = clusterFiles({ files, edges }, options);
  const fanIn = new Map<string, number>();
  for (const e of edges) fanIn.set(e.target, (fanIn.get(e.target) ?? 0) + 1);
  const named = describeGroups(result.groups, fanIn);
  if (result.leftovers.length) {
    named.push({
      name: 'Unassigned Files', role: 'other', label: 'UNKNOWN', members: result.leftovers,
      description: `${result.leftovers.length} files with no dependency on, or from, the rest of the code. They are listed together rather than guessed into a component.`,
    });
  }
  const ids = new Set<string>();
  const components = named.map((g): MappingComponent => {
    let id = slug(g.name), n = 2;
    while (ids.has(id)) id = `${slug(g.name)}-${n++}`;
    ids.add(id);
    return { id, name: g.name, role: g.role, label: g.label, description: g.description, ...(g.layer === undefined ? {} : { layer: g.layer }), memberIds: g.members };
  });
  return { components, resolution: result.resolution };
}

/** Builds the view for a mapping and a snapshot graph. Edges come only from file dependencies, via deriveComponentEdges. */
export function buildView(meta: { projectId: string; snapshotId: string; title: string; generator: ArchitectureView['generator'] }, graph: SnapshotGraph, mapping: MappingComponent[]): ArchitectureView {
  const { files, edges } = fileDependencies(graph);
  const fileSet = new Set(files);
  const classes: ArchClass[] = [];
  const components: ArchComponent[] = [];
  const owner: Record<string, string> = {};
  for (const m of mapping) {
    const memberIds = m.memberIds.filter(id => fileSet.has(id) && !(id in owner));
    for (const id of memberIds) {
      owner[id] = m.id;
      classes.push({ id, name: id.split('/').pop()!, componentId: m.id, path: id, kind: 'class' });
    }
    components.push({ id: m.id, name: m.name, role: m.role, label: m.label, description: m.description, memberIds, ...(m.layer === undefined ? {} : { layer: m.layer }) });
  }
  const classEdges: ClassEdge[] = edges.filter(e => owner[e.source] && owner[e.target]).map(e => ({ source: e.source, target: e.target, kind: e.kind, path: e.source }));
  return {
    schemaVersion: 1, projectId: meta.projectId, snapshotId: meta.snapshotId, title: meta.title, generator: meta.generator, unit: 'file',
    components: components.filter(c => c.memberIds.length > 0), edges: deriveComponentEdges(owner, classEdges), classes, classEdges,
  };
}
