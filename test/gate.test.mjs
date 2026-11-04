import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, parseHostnames, verifySession, verifyTurnstile } from '../worker/gate.mjs';
import { withRange } from '../worker/index.mjs';

const respond = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
const base = { secret: 's', token: 't', expectedAction: 'start', expectedHostnames: parseHostnames('anu.asfarlab.fun') };

test('verifyTurnstile accepts a good answer', async () => {
  assert.equal((await verifyTurnstile({ ...base, fetchImpl: respond({ success: true, action: 'start', hostname: 'anu.asfarlab.fun' }) })).ok, true);
});
test('verifyTurnstile fails closed', async () => {
  const reason = async (o) => (await verifyTurnstile({ ...base, ...o })).reason;
  assert.equal(await reason({ fetchImpl: respond({ success: true, action: 'login', hostname: 'anu.asfarlab.fun' }) }), 'action mismatch');
  assert.equal(await reason({ fetchImpl: respond({ success: true, action: 'start', hostname: 'evil.com' }) }), 'hostname mismatch');
  assert.equal(await reason({ fetchImpl: respond({ success: false, 'error-codes': ['timeout-or-duplicate'] }) }), 'timeout-or-duplicate');
  assert.equal(await reason({ fetchImpl: respond({}, 500) }), 'siteverify 500');
  assert.equal(await reason({ fetchImpl: async () => { throw new Error('boom'); } }), 'siteverify unreachable');
  assert.equal(await reason({ token: '' }), 'token invalid');
  assert.equal(await reason({ secret: '' }), 'secret not configured');
});
test('a session verifies, and a changed or old one does not', async () => {
  const key = 'a-long-enough-secret-for-tests', now = 1000000, token = await issueSession(key, now);
  assert.ok(await verifySession(key, token, now + 1));
  assert.equal(await verifySession('another-long-enough-secret', token, now + 1), null);
  assert.equal(await verifySession(key, token.slice(0, -2) + 'xx', now + 1), null);
  assert.equal(await verifySession(key, token, now + 8 * 24 * 3600 * 1000), null);
  assert.equal(await verifySession(key, null, now), null);
});

test('audio answers byte ranges', async () => {
  const file = () => new Response(new Uint8Array(100).map((_, i) => i), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  const ask = range => withRange(new Request('https://x/audio/a.mp3', range ? { headers: { range } } : {}), file());
  const whole = await ask();
  assert.equal(whole.status, 200); assert.equal(whole.headers.get('accept-ranges'), 'bytes'); assert.match(whole.headers.get('cache-control'), /^private/);
  const part = await ask('bytes=10-19');
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 10-19/100');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())].slice(0, 2), [10, 11]);
  assert.equal((await ask('bytes=90-')).headers.get('content-range'), 'bytes 90-99/100');
  assert.equal((await ask('bytes=-5')).headers.get('content-range'), 'bytes 95-99/100');
  assert.equal((await ask('bytes=200-')).status, 416);
});
