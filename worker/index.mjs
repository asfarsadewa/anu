// The Worker serves the static game. Start runs one Turnstile check, and the Worker answers with a signed cookie.
// Audio needs that cookie, because audio is the only large download.
import { issueSession, parseHostnames, verifySession, verifyTurnstile, SESSION_TTL_MS } from './gate.mjs';

const ACTION = 'start', COOKIE = 'anu_session';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const cookieOf = req => { for (const part of (req.headers.get('cookie') || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === COOKIE) return v.join('='); } return null; };
const hasSession = (env, req) => verifySession(env.SESSION_SECRET, cookieOf(req));

async function startSession(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (env.SESSION_LIMITER && !(await env.SESSION_LIMITER.limit({ key: ip })).success) return json({ ok: false, error: 'rate' }, 429);
  let token = '';
  try { token = (await req.json()).token; } catch { return json({ ok: false, error: 'body' }, 400); }
  const check = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token, remoteip: ip, expectedAction: ACTION, expectedHostnames: parseHostnames(env.TURNSTILE_HOSTNAMES) });
  if (!check.ok) { console.warn('turnstile_rejected', check.reason); return json({ ok: false, error: 'turnstile' }, 403); }
  const session = await issueSession(env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=${session}; Max-Age=${SESSION_TTL_MS / 1000}; Path=/; HttpOnly; Secure; SameSite=Lax` });
}

// Audio elements ask for byte ranges, and Safari will not play without them. The browser may keep audio. A shared cache must not, or it would serve audio with no session
export async function withRange(req, res) {
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'private, max-age=604800');
  headers.set('accept-ranges', 'bytes');
  if (res.status !== 200) return new Response(res.body, { status: res.status, headers });
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (!m || (!m[1] && !m[2])) return new Response(res.body, { status: 200, headers });
  const body = await res.arrayBuffer(), size = body.byteLength;
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), end = m[1] && m[2] ? Number(m[2]) : size - 1;
  end = Math.min(end, size - 1);
  if (start >= size || start > end) { headers.set('content-range', `bytes */${size}`); return new Response(null, { status: 416, headers }); }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/config' && req.method === 'GET') return json({ siteKey: env.TURNSTILE_SITE_KEY, action: ACTION });
    if (pathname === '/api/session') {
      if (req.method === 'GET') return json({ ok: !!(await hasSession(env, req)) });
      if (req.method === 'POST') return startSession(req, env);
      return json({ ok: false }, 405);
    }
    if (pathname.startsWith('/api/')) return json({ ok: false }, 404);
    if (pathname.startsWith('/audio/')) {
      if (!await hasSession(env, req)) return json({ ok: false, error: 'session' }, 401);
      return withRange(req, await env.ASSETS.fetch(new Request(req.url, { headers: { accept: req.headers.get('accept') || '*/*' } })));
    }
    return env.ASSETS.fetch(req);
  },
};
