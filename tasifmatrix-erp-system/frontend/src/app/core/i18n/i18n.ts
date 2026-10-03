import { signal } from '@angular/core';
import { BN } from './bn';
import { BN_SERVER_PATTERNS } from './bn-server';

/**
 * Display language: English or Bangla.
 *
 * The English text in the code is the key: `t('Sales orders')` returns "বিক্রয় অর্ডার" in Bangla
 * and the text unchanged in English. Anything without a translation falls back to English, so a
 * missing entry never breaks a screen. Numbers, money and dates keep English digits in both.
 *
 * The choice is remembered on this device (like light/dark mode) and applies before sign-in.
 */
export type Lang = 'en' | 'bn';
export const LANG_STORAGE_KEY = 'tasifmatrix.lang';

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা' },
];

/** The current language. Templates and computed values that read it update when it changes. */
export const currentLang = signal<Lang>(readLang());

export function setLang(lang: Lang): void {
  currentLang.set(lang);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* private mode: lasts for this visit only */
  }
  applyDocumentLang(lang);
}

export type TParams = Record<string, string | number | null | undefined>;

/**
 * Translates English UI text. `{name}` placeholders are filled from params after translating,
 * so the sentence can be reordered in Bangla: t('Order #{no} saved.', { no: '100042' }).
 */
export function t(text: string | null | undefined, params?: TParams): string {
  if (text === null || text === undefined || text === '') return '';
  if (currentLang() !== 'bn') return params ? fill(text, params) : text;
  const exact = BN[text];
  if (exact !== undefined) return params ? fill(exact, params) : exact;
  // Not a fixed sentence: it may be a server message with names or numbers in it.
  if (!params) {
    const patterned = fromPattern(text);
    if (patterned !== null) return patterned;
  }
  return params ? fill(text, params) : text;
}

function fromPattern(message: string): string | null {
  for (const [pattern, render] of BN_SERVER_PATTERNS) {
    const m = pattern.exec(message);
    if (m) return render(m);
  }
  return null;
}

/**
 * Translates a message that came from the server (error titles, field errors). Exact sentences
 * come from the dictionary; sentences with names or numbers in them match a pattern.
 */
export function tServer(message: string | null | undefined): string {
  return t(message);
}

function fill(template: string, params: TParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = params[key];
    return v === null || v === undefined ? whole : String(v);
  });
}

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

export function applyDocumentLang(lang: Lang = currentLang()): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
}
