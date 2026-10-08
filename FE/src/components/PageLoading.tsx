export default function PageLoading() {
  return <div className="min-h-[60dvh] bg-[#080b0e] p-6 md:p-10" role="status" aria-live="polite" aria-label="Loading page">
    <p className="text-sm text-[#94a3b8] mb-8">Loading workspace…</p>
    <div aria-hidden="true" className="max-w-5xl space-y-5 motion-safe:animate-pulse">
      <div className="h-8 w-2/5 bg-[#242527] rounded" />
      <div className="h-4 w-3/5 bg-[#161d24] rounded" />
      <div className="grid sm:grid-cols-3 gap-4 pt-6">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-[#11161b] rounded border border-[#242527]" />)}</div>
    </div>
  </div>;
}
