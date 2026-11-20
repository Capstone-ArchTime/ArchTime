import { getLanguage, localeTag, type Language } from './index.ts';

// Dates and numbers in the page language (Vietnamese: 20/11/2026, 1.234; English: 11/20/2026, 1,234). Unknown or
// invalid dates come back as an empty string rather than "Invalid Date".

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}, language: Language = getLanguage()): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString(localeTag(language), options) : '';
}

export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = {}, language: Language = getLanguage()): string {
  const date = toDate(value);
  return date ? date.toLocaleString(localeTag(language), options) : '';
}

export function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}, language: Language = getLanguage()): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(localeTag(language), options) : '';
}
