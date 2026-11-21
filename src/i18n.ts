import { ro } from './i18n-ro';
import { en } from './i18n-en';

export type Lang = 'ro' | 'en';
const dict: Record<Lang, Record<string, string>> = { ro, en };
let current: Lang = 'ro';

export function setLang(lang: Lang): void { current = lang; }
export function getLang(): Lang { return current; }

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dict[current][key] ?? dict.ro[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export const tf = t;
