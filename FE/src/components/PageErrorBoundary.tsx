import { Component } from 'react';
import type { ReactNode } from 'react';

export default class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="min-h-dvh bg-[#080b0e] flex items-center justify-center p-6">
      <div role="alert" className="max-w-lg border border-[#242527] bg-[#11161b] p-8">
        <p className="text-xs uppercase tracking-widest text-[#93c5fd] mb-4">ArchTime</p>
        <h1 className="text-2xl font-semibold mb-3">This page could not load</h1>
        <p className="text-sm text-[#94a3b8] leading-relaxed mb-6">Check your connection and reload the page. Your saved workspace data is still available.</p>
        <button type="button" onClick={() => window.location.reload()} className="bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-5 py-3 rounded font-semibold">Reload page</button>
        <a href="/" className="inline-block ml-5 text-sm text-[#94a3b8] underline">Go to home</a>
      </div>
    </main>;
  }
}
