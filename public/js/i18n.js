// The languages. The sim returns keys, and this module turns them into copy for the player.
import en from './copy/en.js';
import id from './copy/id.js';
import zh from './copy/zh.js';

const COPY = { en, id, zh };
const HTML_LANG = { en: 'en', id: 'id', zh: 'zh-Hans' };
const KEY = 'anu.lang';
let lang = 'en';

export const getLang = () => lang;
// Only the player's own choice is saved
export function setLang(code, remember = false) {
  if (!COPY[code]) return;
  lang = code;
  document.documentElement.lang = HTML_LANG[code];
  if (remember) try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
}
// The highest of the game's languages in the device's list wins. Any other list gets English
export function preferredLang(languages) {
  const first = languages.find(l => /^(en|id|zh)\b/i.test(l || ''));
  return first ? first.slice(0, 2).toLowerCase() : 'en';
}
// A saved choice comes first. A first visit follows the device language
export function initialLang() {
  try { const saved = localStorage.getItem(KEY); if (COPY[saved]) return saved; } catch { /* private mode */ }
  return preferredLang(navigator.languages || [navigator.language]);
}
export function t(key, params = {}) {
  const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), COPY[lang]);
  if (typeof v === 'function') return v(params);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
}
// The Bu Lurah voice is Indonesian in every language. Only the subtitle changes
export const subtitle = line => line[lang + '_text'];
