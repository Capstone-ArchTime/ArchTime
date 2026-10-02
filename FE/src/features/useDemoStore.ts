import { useSyncExternalStore } from 'react';
import { App } from 'antd';
import { useAuth } from '@/auth/auth-context';
import type { Role } from '@/auth/permissions';
import { readDemo, writeDemo } from './demo-storage';

const changed = 'archtime-demo-changed';
const unavailable = '__storage_unavailable__';
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(changed, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changed, listener); };
}

export function useDemoStore<T>(name: string, seed: T, validate: (value: unknown) => value is T, role: Role) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const key = `archtime:demo:v1:${user?.id}:${name}`;
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key); } catch { return unavailable; }
  }, () => null);
  let data = seed;
  let error: string | null = null;
  try { data = readDemo(raw, seed, validate); }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Browser storage is unavailable.'; }
  function save(next: T) {
    if (error) { message.error(error); return false; }
    if (user?.role !== role) { message.error('You do not have permission to change this workspace.'); return false; }
    try {
      if (!validate(next)) throw new Error('Please check the form values.');
      writeDemo(localStorage, key, raw, next);
      window.dispatchEvent(new Event(changed));
      return true;
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not save in this browser.'); return false; }
  }
  return { data, save, error };
}
