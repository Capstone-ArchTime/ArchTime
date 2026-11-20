import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { en, type MessageKey } from './messages/en.ts';

// The page language. English ships with the app; Vietnamese is a separate chunk loaded the first time it is chosen, so
// English readers download nothing extra. (A library such as i18next would cost ~50 KB on every page and break the
// bundle budgets in scripts/check-bundle.mjs; this covers what the app needs: lookups, {placeholders}, English plurals.)

export type Language = 'en' | 'vi';
export const LANGUAGES: readonly { code: Language; name: string; short: string }[] = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'vi', name: 'Tiếng Việt', short: 'VI' },
];
export const LANGUAGE_KEY = 'archtime.language';

// English has every key; other languages skip the English-only `_one` plural forms.
type Dictionary = Partial<Record<MessageKey, string>>;
type Params = Record<string, string | number>;

const dictionaries: Partial<Record<Language, Dictionary>> = { en };
let current: Language = 'en';
const listeners = new Set<() => void>();

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'vi';

/** The saved choice, else the browser's language (Vietnamese browsers start in Vietnamese), else English. */
export function preferredLanguage(stored: string | null, browser: readonly string[]): Language {
  if (isLanguage(stored)) return stored;
  return browser.some(tag => tag.toLowerCase().startsWith('vi')) ? 'vi' : 'en';
}

/** Other things to fetch before a language shows (antd's own texts, see antd-locale.ts); run with every switch. */
const extraLoaders: ((language: Language) => Promise<unknown>)[] = [];
export function addLanguageLoader(loader: (language: Language) => Promise<unknown>) { extraLoaders.push(loader); }

async function load(language: Language): Promise<Dictionary> {
  const [dictionary] = await Promise.all([
    dictionaries[language] ?? import('./messages/vi.ts').then(({ vi }) => (dictionaries.vi = vi)),
    ...extraLoaders.map(loader => loader(language)),
  ]);
  return dictionary;
}

function apply(language: Language) {
  current = language;
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach(listener => listener());
}

/** Picks the starting language before the first render, so a Vietnamese reader never sees the English page flash. */
export async function initLanguage(): Promise<void> {
  let stored: string | null = null;
  try { stored = localStorage.getItem(LANGUAGE_KEY); } catch { /* storage blocked: fall back to the browser language */ }
  const language = preferredLanguage(stored, typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
  try { await load(language); apply(language); } catch { apply('en'); }
}

/** Switches the language (loading Vietnamese if needed) and remembers it in this browser. */
export async function setLanguage(language: Language): Promise<void> {
  await load(language);
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* the choice lasts for this page only */ }
  apply(language);
}

export const getLanguage = (): Language => current;

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * The text for `key` in the current language. The key itself holds the plural form; with `count` 1 in English,
 * `key_one` is used when it exists ("1 commit" / "2 commits"). Vietnamese has one form, so it never needs `_one`.
 */
export function translate(key: MessageKey, params?: Params, language: Language = current): string {
  const dictionary = dictionaries[language] ?? en;
  if (params?.count === 1 && language === 'en') {
    const one = (en as Record<string, string>)[`${key}_one`];
    if (one !== undefined) return fill(one, params);
  }
  return fill(dictionary[key] ?? en[key] ?? key, params);
}

/** For keys built at run time (a navigation path, say): the translation if there is one, else `fallback`. */
export function translateOr(key: string, fallback: string, params?: Params): string {
  const dictionary = dictionaries[current] ?? en;
  const text = (dictionary as Record<string, string>)[key] ?? (en as Record<string, string>)[key];
  return fill(text ?? fallback, params);
}

/** BCP 47 tag for dates and numbers. */
export const localeTag = (language: Language = current) => (language === 'vi' ? 'vi-VN' : 'en-US');

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The current language; the component re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => current, () => 'en');
}

/**
 * The text for `key` with some {placeholders} replaced by elements (a bold name, a link), so a sentence keeps its word
 * order in every language: `rich('delete.typeName', { name: <strong>…</strong> })`.
 */
export function translateRich(key: MessageKey, nodes: Record<string, ReactNode>, language: Language = current): ReactNode[] {
  const text = translate(key, undefined, language);
  return text.split(/(\{\w+\})/).map(part => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name && name in nodes ? nodes[name] : part;
  });
}

/** `t(key, params)` bound to the current language; components using it re-render when the language changes. */
export function useT() {
  const language = useLanguage();
  return Object.assign((key: MessageKey, params?: Params) => translate(key, params, language), {
    or: translateOr,
    rich: (key: MessageKey, nodes: Record<string, ReactNode>) => translateRich(key, nodes, language),
  });
}

export type { MessageKey };
