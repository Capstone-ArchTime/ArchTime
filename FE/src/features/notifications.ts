import { apiRequest, apiStream, ApiError } from '../api/client.ts';
import { defineMessages, message } from '../i18n/define.ts';
import { getLanguage, localeTag, type Language } from '../i18n/index.ts';

// The bell in the header: the server stores what happened (a kind and its values) and pushes each new notification
// over a stream (server-sent events); the text is written here, in the reader's language.

export interface AppNotification {
  id: string;
  kind: string;
  params: Record<string, unknown>;
  /** A path in the app. */
  link: string;
  createdAt: string;
  readAt: string | null;
}

const MSG = defineMessages({
  findingsTitle: '{count} new conformance findings', findingsTitle_one: '1 new conformance finding',
  findingsBody: 'Code in {project} departs from its confirmed component diagram.',
  someProject: 'a workspace',
  unknownTitle: 'New activity', unknownBody: 'Open it to see what changed.',
}, {
  findingsTitle: '{count} phát hiện tuân thủ mới',
  findingsBody: 'Mã nguồn trong {project} lệch khỏi sơ đồ thành phần đã xác nhận.',
  someProject: 'một không gian làm việc',
  unknownTitle: 'Hoạt động mới', unknownBody: 'Mở để xem thay đổi.',
});

/** A notification from the server, or null when it does not look like one (the stream may carry other events later). */
export function parseNotification(value: unknown): AppNotification | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.id !== 'string' || typeof v.kind !== 'string') return null;
  const link = typeof v.link === 'string' && v.link.startsWith('/') && !v.link.startsWith('//') ? v.link : '/';
  const createdAt = typeof v.createdAt === 'string' && Number.isFinite(Date.parse(v.createdAt)) ? v.createdAt : new Date().toISOString();
  return {
    id: v.id, kind: v.kind, link, createdAt,
    params: v.params && typeof v.params === 'object' ? v.params as Record<string, unknown> : {},
    readAt: typeof v.readAt === 'string' ? v.readAt : null,
  };
}

/** What the bell shows for a notification, in `language`. */
export function describeNotification(n: AppNotification, language: Language = getLanguage()): { title: string; body: string } {
  if (n.kind === 'conformance.findings') {
    const count = Math.max(1, Math.floor(Number(n.params.count)) || 1);
    const name = typeof n.params.projectName === 'string' && n.params.projectName.trim() ? n.params.projectName : message(MSG, 'someProject', undefined, language);
    return { title: message(MSG, 'findingsTitle', { count }, language), body: message(MSG, 'findingsBody', { project: name }, language) };
  }
  return { title: message(MSG, 'unknownTitle', undefined, language), body: message(MSG, 'unknownBody', undefined, language) };
}

/** "5 minutes ago", "vừa xong"…, in `language`. */
export function timeAgo(iso: string, now = Date.now(), language: Language = getLanguage()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (!Number.isFinite(seconds)) return '';
  const format = new Intl.RelativeTimeFormat(localeTag(language), { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === 'second' ? format.format(0, 'second') : format.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}

export async function fetchNotifications(limit = 20, signal?: AbortSignal): Promise<{ items: AppNotification[]; unread: number }> {
  const body = await apiRequest<{ data?: { items?: unknown[]; unread?: unknown } }>(`/notifications?limit=${limit}`, { signal });
  const items = (body.data?.items ?? []).map(parseNotification).filter((n): n is AppNotification => n !== null);
  const unread = typeof body.data?.unread === 'number' ? body.data.unread : items.filter(n => !n.readAt).length;
  return { items, unread };
}

export async function markNotificationRead(id: string): Promise<number> {
  const body = await apiRequest<{ data?: { unread?: number } }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  return body.data?.unread ?? 0;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest(`/notifications/read-all`, { method: 'POST' });
}

/**
 * Reads server-sent events from text chunks: calls `onEvent(name, data)` for each complete event. Comments (": ping")
 * and the retry field are skipped; a chunk may end in the middle of an event.
 */
export function createEventParser(onEvent: (name: string, data: string) => void): (chunk: string) => void {
  let buffer = '';
  return chunk => {
    buffer += chunk.replace(/\r\n?/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let name = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') name = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length) onEvent(name, data.join('\n'));
    }
  };
}

/** Waits before reconnecting: 2 s, 4 s, 8 s… up to a minute, so a server that is down is not hammered. */
export const reconnectDelay = (attempt: number) => Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt));

/**
 * Listens for new notifications until `signal` aborts, reconnecting when the stream ends (the server closes it every
 * 25 minutes) or fails. Stops for good when the session is gone (401 after renewal).
 */
export async function listenForNotifications(onNotification: (n: AppNotification) => void, signal: AbortSignal): Promise<void> {
  let attempt = 0;
  while (!signal.aborted) {
    try {
      const response = await apiStream('/notifications/stream', signal);
      attempt = 0;
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      const parse = createEventParser((name, data) => {
        if (name !== 'notification') return;
        try { const n = parseNotification(JSON.parse(data)); if (n) onNotification(n); } catch { /* a malformed event is skipped */ }
      });
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        parse(value);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
    }
    if (signal.aborted) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, reconnectDelay(attempt++));
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
