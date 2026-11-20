import type { ReactNode } from 'react';
import { fill, fillRich, getLanguage, useLanguage, type Language, type Params } from './index.ts';

// Messages that belong to one page or component live next to it, in both languages, and are bundled with that page's
// own chunk. The core dictionary (messages/en.ts, vi.ts) keeps only what every page shares (navigation, the shell,
// statuses, server errors), so the first download stays small however many pages are translated.
//
//   const MSG = defineMessages({ title: 'Compare', count: '{count} changes', count_one: '1 change' },
//                              { title: 'So sánh', count: '{count} thay đổi' });
//   const m = useMessages(MSG);  m('title'), m('count', { count: 3 }), m.rich('hint', { link: <a/> })
//
// TypeScript requires a Vietnamese text for every key (English-only `_one` plural forms aside).

type ViKeys<E> = Exclude<keyof E, `${string}_one`>;
export type Messages<E extends Record<string, string>> = { en: E; vi: Record<ViKeys<E>, string> };

export function defineMessages<const E extends Record<string, string>>(en: E, vi: Record<ViKeys<E>, string>): Messages<E> {
  return { en, vi };
}

/** The text of `key` in `language` (the English text when a translation is missing, with `_one` for one in English). */
export function message<E extends Record<string, string>>(messages: Messages<E>, key: ViKeys<E> | keyof E, params?: Params, language: Language = getLanguage()): string {
  const en = messages.en as Record<string, string>;
  const k = key as string;
  if (language === 'en' && params?.count === 1 && en[`${k}_one`] !== undefined) return fill(en[`${k}_one`], params);
  const text = language === 'vi' ? (messages.vi as Record<string, string>)[k] : undefined;
  return fill(text ?? en[k] ?? k, params);
}

/** `m(key, params)` and `m.rich(key, nodes)` for one message set; the component re-renders when the language changes. */
export function useMessages<E extends Record<string, string>>(messages: Messages<E>) {
  const language = useLanguage();
  return Object.assign((key: ViKeys<E>, params?: Params) => message(messages, key, params, language), {
    rich: (key: ViKeys<E>, nodes: Record<string, ReactNode>) => fillRich(message(messages, key, undefined, language), nodes),
    language,
  });
}
