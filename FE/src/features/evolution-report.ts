export type EvolutionReport = { id: string; project: string; from: string; to: string; createdAt: string; nodesAdded: string[]; nodesRemoved: string[]; edgesAdded: string[]; edgesRemoved: string[] };
type SnapshotInput = { hash: string; nodes: { id: string; name: string; type: string }[]; edges: { source: string; target: string; type: string }[] };
export function createEvolutionReport(project: string, base: SnapshotInput, target: SnapshotInput): EvolutionReport {
  const baseNodes = new Set(base.nodes.map(n => n.id)), targetNodes = new Set(target.nodes.map(n => n.id));
  const key = (e: SnapshotInput['edges'][number]) => JSON.stringify([e.source, e.target, e.type]);
  const baseEdges = new Set(base.edges.map(key)), targetEdges = new Set(target.edges.map(key));
  const edgeLabel = (e: SnapshotInput['edges'][number]) => `${e.source} → ${e.target} (${e.type})`;
  return { id: crypto.randomUUID(), project, from: base.hash, to: target.hash, createdAt: new Date().toISOString(), nodesAdded: target.nodes.filter(n => !baseNodes.has(n.id)).map(n => `${n.name} (${n.type})`), nodesRemoved: base.nodes.filter(n => !targetNodes.has(n.id)).map(n => `${n.name} (${n.type})`), edgesAdded: target.edges.filter(e => !baseEdges.has(key(e))).map(edgeLabel), edgesRemoved: base.edges.filter(e => !targetEdges.has(key(e))).map(edgeLabel) };
}
export function validReports(value: unknown): value is EvolutionReport[] {
  return Array.isArray(value) && value.every(r => r && ['id', 'project', 'from', 'to', 'createdAt'].every(k => typeof r[k] === 'string') && ['nodesAdded', 'nodesRemoved', 'edgesAdded', 'edgesRemoved'].every(k => Array.isArray(r[k]) && r[k].every((v: unknown) => typeof v === 'string')));
}
export function reportHtml(r: EvolutionReport) {
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const groups: [string, string[]][] = [['Components added', r.nodesAdded], ['Components removed', r.nodesRemoved], ['Dependencies added', r.edgesAdded], ['Dependencies removed', r.edgesRemoved]];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ArchTime evolution report</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#18202a;max-width:900px;margin:40px auto;padding:0 24px}h1{font-size:32px;line-height:1.2}h2{margin-top:32px;border-bottom:1px solid #ccd3da;padding-bottom:8px}p,li{overflow-wrap:anywhere}small{color:#475569}li{margin-bottom:8px}@media print{body{margin:0;max-width:none}h2{break-after:avoid}li{break-inside:avoid}@page{margin:18mm}}</style></head><body><small>ARCHTIME / ARCHITECTURE EVOLUTION</small><h1>${esc(r.project)}</h1><p><b>From:</b> ${esc(r.from)}<br><b>To:</b> ${esc(r.to)}<br><b>Generated:</b> ${esc(r.createdAt)}</p><p>Generated in the browser from server snapshots. This report compares component IDs and direct dependencies; changes to existing component properties are not classified.</p>${groups.map(([title, rows]) => `<section><h2>${title} (${rows.length})</h2>${rows.length ? `<ul>${rows.map(row => `<li>${esc(row)}</li>`).join('')}</ul>` : '<p>No changes.</p>'}</section>`).join('')}</body></html>`;
}
