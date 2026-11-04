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
      const res = await env.ASSETS.fetch(req), out = new Response(res.body, res);
      // the browser may keep it. A shared cache must not, or it would serve audio with no session
      out.headers.set('cache-control', 'private, max-age=604800');
      return out;
    }
    return env.ASSETS.fetch(req);
  },
};
