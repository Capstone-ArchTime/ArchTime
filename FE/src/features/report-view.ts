// An architecture report as the server stores it (BE: ProjectReportUseCases.ts, GenerateProjectReportUseCase), read
// defensively: reports generated before the lists were stored have the figures only, and lists then are null.

export type ReportStatus = 'ready' | 'generating' | 'failed';
export type ReportCommit = { hash: string; title: string; date: string | null };
export type ReportView = {
  id: string; title: string; status: ReportStatus; summary: string; createdAt: string | null;
  project: { name: string; repoUrl: string; status: string };
  figures: { components: number; dependencies: number; rules: number; activeRules: number; decisions: number; acceptedDecisions: number; minedCommits: number; mapRevision: number | null };
  history: { first: ReportCommit | null; latest: ReportCommit | null };
  components: { name: string; kind: string; description: string }[];
  /** null: not stored in this (older) report. */
  dependencies: { source: string; target: string; label: string }[] | null;
  rules: { name: string; source: string; target: string; constraint: 'forbidden' | 'required'; severity: string; enabled: boolean }[] | null;
  decisions: { number: number; title: string; status: string }[] | null;
};

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const date = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
const list = (v: unknown): Raw[] | null => (Array.isArray(v) ? v.map(obj) : null);
const commit = (v: unknown): ReportCommit | null => {
  const c = obj(v);
  return str(c.hash) ? { hash: str(c.hash), title: str(c.title), date: date(c.date) } : null;
};

/** A report from the server, or null when it is not one (no id). */
export function parseReport(raw: unknown): ReportView | null {
  const r = obj(raw);
  if (!str(r.id)) return null;
  const data = obj(r.data);
  const project = obj(data.project);
  const architecture = obj(data.architecture);
  const rules = obj(data.rules);
  const decisions = obj(data.decisions);
  const snapshots = obj(data.snapshots);
  const status = str(r.status);
  return {
    id: str(r.id), title: str(r.title) || 'Architecture report', summary: str(r.summary),
    status: status === 'generating' || status === 'failed' ? status : 'ready',
    createdAt: date(r.createdAt),
    project: { name: str(project.name), repoUrl: str(project.repoUrl), status: str(project.status) },
    figures: {
      components: num(architecture.componentCount), dependencies: num(architecture.dependencyCount),
      rules: num(rules.total), activeRules: num(rules.active), decisions: num(decisions.total), acceptedDecisions: num(decisions.accepted),
      minedCommits: num(snapshots.total), mapRevision: typeof architecture.revision === 'number' ? architecture.revision : null,
    },
    history: { first: commit(snapshots.first), latest: commit(snapshots.latest) },
    components: (list(architecture.components) ?? []).map(c => ({ name: str(c.name) || str(c.id), kind: str(c.kind), description: str(c.description) })),
    dependencies: list(architecture.dependencies)?.map(d => ({ source: str(d.source), target: str(d.target), label: str(d.label) })) ?? null,
    rules: list(rules.items)?.map(x => ({ name: str(x.name), source: str(x.source), target: str(x.target), constraint: x.constraint === 'required' ? 'required' as const : 'forbidden' as const, severity: str(x.severity), enabled: x.enabled !== false })) ?? null,
    decisions: list(decisions.items)?.map(d => ({ number: num(d.number), title: str(d.title), status: str(d.status) })) ?? null,
  };
}

/** The reports in a list response; entries that are not reports are left out. */
export function parseReportList(body: unknown): ReportView[] {
  const rows = obj(obj(body).data).reports;
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of reports.');
  return rows.map(parseReport).filter((r): r is ReportView => r !== null);
}

/** A file name for a downloaded report when the server did not give one. */
export function fallbackReportFileName(report: Pick<ReportView, 'project' | 'createdAt'>): string {
  const name = report.project.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'workspace';
  return `${name}-architecture-report-${report.createdAt?.slice(0, 10) ?? 'undated'}.pdf`;
}
