import { useCallback, useEffect, useState } from 'react';
import { App, Popover } from 'antd';
import { Bell, BellRing, CheckCheck, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  describeNotification, fetchNotifications, listenForNotifications, markAllNotificationsRead, markNotificationRead, timeAgo,
  type AppNotification,
} from '@/features/notifications';
import { refreshUnread } from '@/features/unread-findings';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  title: 'Notifications', open: 'Notifications', openUnread: 'Notifications, {count} unread', markAll: 'Mark all read',
  empty: "You're all caught up.", emptyHint: 'New conformance findings of the workspaces you maintain show here as they happen.',
  failed: 'Notifications could not be loaded.', retry: 'Try again', view: 'Open',
}, {
  title: 'Thông báo', open: 'Thông báo', openUnread: 'Thông báo, {count} chưa đọc', markAll: 'Đánh dấu đã đọc hết',
  empty: 'Bạn đã xem hết.', emptyHint: 'Phát hiện tuân thủ mới của các không gian làm việc bạn bảo trì sẽ hiện ở đây ngay khi có.',
  failed: 'Không tải được thông báo.', retry: 'Thử lại', view: 'Mở',
});

/**
 * The bell in the header: the newest notifications, the unread count, and new ones as they happen (a toast and the
 * count go up at once, from the stream). Opening one marks it read and goes where it points.
 */
export default function NotificationBell({ userId }: { userId: string }) {
  const m = useMessages(MSG);
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  // "5 minutes ago" is measured from when the list was opened.
  const [now, setNow] = useState(() => Date.now());
  const toggle = (next: boolean) => { setOpen(next); if (next) setNow(Date.now()); };

  const load = useCallback((signal?: AbortSignal) => {
    fetchNotifications(20, signal)
      .then(result => { setItems(result.items); setUnread(result.unread); setFailed(false); })
      .catch(() => { if (!signal?.aborted) setFailed(true); });
  }, []);

  const go = useCallback((n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setItems(list => list.map(x => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread(c => Math.max(0, c - 1));
      void markNotificationRead(n.id).then(setUnread).catch(() => { /* the count corrects itself on the next load */ });
    }
    navigate(n.link);
  }, [navigate]);

  // The list on start and whenever the tab comes back; new ones arrive over the stream in between.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { controller.abort(); window.removeEventListener('focus', onFocus); };
  }, [load, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void listenForNotifications(n => {
      setItems(list => [n, ...list.filter(x => x.id !== n.id)].slice(0, 20));
      setUnread(c => c + 1);
      setRinging(true);
      if (n.kind === 'conformance.findings') void refreshUnread();
      const { title, body } = describeNotification(n);
      notification.open({
        key: n.id, title, description: body, placement: 'bottomRight', duration: 8,
        icon: <ShieldAlert size={20} aria-hidden="true" className="text-[var(--at-warn)]" />,
        onClick: () => { notification.destroy(n.id); go(n); },
      });
    }, controller.signal);
    return () => controller.abort();
  }, [userId, notification, go]);

  useEffect(() => {
    if (!ringing) return;
    const timer = setTimeout(() => setRinging(false), 1600);
    return () => clearTimeout(timer);
  }, [ringing]);

  const readAll = () => {
    setItems(list => list.map(x => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
    setUnread(0);
    void markAllNotificationsRead().catch(() => load());
  };

  const content = <div className="w-[22rem] max-w-[85vw]">
    <div className="flex items-center justify-between gap-3 pb-2">
      <span className="text-sm font-semibold text-[var(--at-text)]">{m('title')}</span>
      {unread > 0 && <button type="button" onClick={readAll} className="flex items-center gap-1.5 text-xs text-[var(--at-link)] hover:text-[var(--at-link-hover)]">
        <CheckCheck size={14} aria-hidden="true" />{m('markAll')}
      </button>}
    </div>
    {failed && !items.length ? <div className="py-6 text-center text-sm text-[var(--at-muted)]">
      <p>{m('failed')}</p>
      <button type="button" onClick={() => load()} className="mt-2 text-[var(--at-link)] hover:underline">{m('retry')}</button>
    </div> : !items.length ? <div className="py-8 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--at-panel-2)] text-[var(--at-muted)]"><Bell size={18} aria-hidden="true" /></span>
      <p className="mt-3 text-sm font-medium text-[var(--at-text)]">{m('empty')}</p>
      <p className="mt-1 text-xs text-[var(--at-muted)]">{m('emptyHint')}</p>
    </div> : <ul className="-mx-2 max-h-[60dvh] overflow-y-auto" aria-label={m('title')}>
      {items.map(n => {
        const { title, body } = describeNotification(n, m.language);
        return <li key={n.id}>
          <button type="button" onClick={() => go(n)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--at-panel-2)]">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.readAt ? 'bg-[var(--at-panel-2)] text-[var(--at-muted)]' : 'bg-[var(--at-warn)]/15 text-[var(--at-warn)]'}`}>
              <ShieldAlert size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${n.readAt ? 'text-[var(--at-muted)]' : 'font-semibold text-[var(--at-text)]'}`}>{title}</span>
              <span className="block text-xs text-[var(--at-muted)] break-words">{body}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--at-muted)]">{timeAgo(n.createdAt, now, m.language)}</span>
            </span>
            {!n.readAt && <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--at-link)]" />}
          </button>
        </li>;
      })}
    </ul>}
  </div>;

  const Icon = ringing ? BellRing : Bell;
  return <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={toggle} arrow={false}>
    <button type="button" aria-label={unread ? m('openUnread', { count: unread }) : m('open')} title={m('title')}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--at-line)] bg-[var(--at-panel)] text-[var(--at-muted)] transition-colors hover:border-[var(--at-accent)]/50 hover:text-[var(--at-text)]">
      <Icon size={19} aria-hidden="true" className={ringing ? 'animate-[at-bell-ring_0.8s_ease-in-out_2] motion-reduce:animate-none text-[var(--at-text)]' : ''} />
      {unread > 0 && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[var(--at-fill)] px-1 text-center text-[11px] font-semibold leading-5 text-[var(--at-on-fill)] ring-2 ring-[var(--at-page)]">{unread > 99 ? '99+' : unread}</span>}
    </button>
  </Popover>;
}
