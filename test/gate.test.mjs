import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, parseHostnames, verifySession, verifyTurnstile } from '../worker/gate.mjs';

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
