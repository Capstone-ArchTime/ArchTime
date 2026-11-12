import { Component } from 'react';
import type { ReactNode } from 'react';

export default class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="min-h-dvh bg-[var(--at-page)] flex items-center justify-center p-6">
      <div role="alert" className="max-w-lg border border-[var(--at-line)] bg-[var(--at-panel)] p-8">
        <p className="text-xs uppercase tracking-widest text-[var(--at-link)] mb-4">ArchTime</p>
        <h1 className="text-2xl font-semibold mb-3">This page could not load</h1>
        <p className="text-sm text-[var(--at-muted)] leading-relaxed mb-6">Check your connection and reload the page. Your saved workspace data is still available.</p>
        <button type="button" onClick={() => window.location.reload()} className="bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] px-5 py-3 rounded font-semibold">Reload page</button>
        <a href="/" className="inline-block ml-5 text-sm text-[var(--at-muted)] underline">Go to home</a>
      </div>
    </main>;
  }
}
