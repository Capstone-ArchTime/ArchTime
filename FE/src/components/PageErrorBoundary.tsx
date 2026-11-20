import { Component } from 'react';
import type { ReactNode } from 'react';
import { defineMessages, message } from '@/i18n/define';

const MSG = defineMessages({
  title: 'This page could not load',
  body: 'Check your connection and reload the page. Your saved workspace data is still available.',
  reload: 'Reload page',
  home: 'Go to home',
}, {
  title: 'Không tải được trang này',
  body: 'Hãy kiểm tra kết nối và tải lại trang. Dữ liệu đã lưu của bạn vẫn còn nguyên.',
  reload: 'Tải lại trang',
  home: 'Về trang chủ',
});

export default class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    // A class component cannot use hooks: the text is read in the current language when the error shows.
    const m = (key: Parameters<typeof message<typeof MSG.en>>[1]) => message(MSG, key);
    return <main className="min-h-dvh bg-[var(--at-page)] flex items-center justify-center p-6">
      <div role="alert" className="max-w-lg border border-[var(--at-line)] bg-[var(--at-panel)] p-8">
        <p className="text-xs uppercase tracking-widest text-[var(--at-link)] mb-4">ArchTime</p>
        <h1 className="text-2xl font-semibold mb-3">{m('title')}</h1>
        <p className="text-sm text-[var(--at-muted)] leading-relaxed mb-6">{m('body')}</p>
        <button type="button" onClick={() => window.location.reload()} className="bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] px-5 py-3 rounded font-semibold">{m('reload')}</button>
        <a href="/" className="inline-block ml-5 text-sm text-[var(--at-muted)] underline">{m('home')}</a>
      </div>
    </main>;
  }
}
