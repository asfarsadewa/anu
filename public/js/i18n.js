// The two languages. The sim returns keys, and this module turns them into copy for the player.
import en from './copy/en.js';
import id from './copy/id.js';

const COPY = { en, id };
const KEY = 'anu.lang';
let lang = 'en';

export const getLang = () => lang;
// Only the player's own choice is saved
export function setLang(code, remember = false) {
  if (!COPY[code]) return;
  lang = code;
  document.documentElement.lang = code;
  if (remember) try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
}
// A saved choice comes first. A first visit follows the device language
export function initialLang() {
  try { const saved = localStorage.getItem(KEY); if (COPY[saved]) return saved; } catch { /* private mode */ }
  return (navigator.languages || [navigator.language]).some(l => /^id\b/i.test(l || '')) ? 'id' : 'en';
}
export function t(key, params = {}) {
  const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), COPY[lang]);
  if (typeof v === 'function') return v(params);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
}
// The Bu Lurah voice is Indonesian in both languages. Only the subtitle changes
export const subtitle = line => (lang === 'id' ? line.id_text : line.en_text);
