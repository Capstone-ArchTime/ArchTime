export default function PageLoading() {
  return <div className="min-h-[60dvh] bg-[var(--at-page)] p-6 md:p-10" role="status" aria-live="polite" aria-label="Loading page">
    <p className="text-sm text-[var(--at-muted)] mb-8">Loading workspace…</p>
    <div aria-hidden="true" className="max-w-5xl space-y-5 motion-safe:animate-pulse">
      <div className="h-8 w-2/5 bg-[var(--at-line)] rounded" />
      <div className="h-4 w-3/5 bg-[var(--at-panel-2)] rounded" />
      <div className="grid sm:grid-cols-3 gap-4 pt-6">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-[var(--at-panel)] rounded border border-[var(--at-line)]" />)}</div>
    </div>
  </div>;
}
