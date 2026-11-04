// Turnstile check and signed session. The same verifier and token shape as the werewolf repo.
// Fails closed on any error.
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function parseHostnames(value) {
  return new Set((value || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean));
}

export async function verifyTurnstile({ secret, token, remoteip, expectedAction, expectedHostnames, fetchImpl, timeoutMs }) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return { ok: false, reason: 'token invalid' };
  if (!secret) return { ok: false, reason: 'secret not configured' };
  if (expectedHostnames.size === 0) return { ok: false, reason: 'hostnames not configured' };
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);
  let result;
  try {
    const r = await (fetchImpl || fetch)(SITEVERIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(timeoutMs || 10000), body });
    if (!r.ok) return { ok: false, reason: `siteverify ${r.status}` };
    result = await r.json();
  } catch {
    return { ok: false, reason: 'siteverify unreachable' };
  }
  if (result.success !== true) {
    const codes = result['error-codes'] || [];
    return { ok: false, reason: codes.length ? codes.join(',') : 'not verified' };
  }
  const hostname = (result.hostname || '').toLowerCase();
  if (result.metadata && result.metadata.result_with_testing_key === true) return { ok: true, hostname, testing: true };
  if (result.action !== expectedAction) return { ok: false, reason: 'action mismatch' };
  if (!expectedHostnames.has(hostname)) return { ok: false, reason: 'hostname mismatch', hostname };
  return { ok: true, hostname };
}

const enc = new TextEncoder();
const b64url = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
function unb64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function issueSession(secret, now = Date.now()) {
  if (!secret || secret.length < 16) throw new Error('session secret too short');
  const payload = enc.encode(JSON.stringify({ sid: b64url(crypto.getRandomValues(new Uint8Array(12))), exp: now + SESSION_TTL_MS }));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), payload));
  return `${b64url(payload)}.${b64url(sig)}`;
}
export async function verifySession(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 512 || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = unb64url(token.slice(0, dot)), sig = unb64url(token.slice(dot + 1));
  if (!payload || !sig) return null;
  if (!await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, payload)) return null;
  let session;
  try { session = JSON.parse(new TextDecoder().decode(payload)); } catch { return null; }
  if (typeof session.sid !== 'string' || typeof session.exp !== 'number' || session.exp <= now) return null;
  return session;
}
