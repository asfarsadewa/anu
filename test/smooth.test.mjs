// The smooth display must stay inside its fill budget on any screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickScale } from '../public/js/gfx/smooth.js';

test('a phone stays inside the fill budget', () => {
  for (const [W, H, zoom] of [[360, 640, 3], [270, 480, 4], [216, 384, 5], [390, 844, 3], [430, 932, 3], [600, 1000, 2]]) {
    const k = pickScale(W, H, zoom);
    assert.ok(k >= 1 && k <= zoom, `${W}x${H} at zoom ${zoom}: scale ${k}`);
    assert.ok(k === 1 || W * H * k * k <= 1300000, `${W}x${H}: ${W * H * k * k} pixels`);
  }
});
test('the scale never passes the screen', () => { assert.equal(pickScale(100, 100, 2), 2); assert.equal(pickScale(100, 100, 1), 1); });
test('a common phone gets at least double', () => { assert.equal(pickScale(360, 640, 3), 2); assert.ok(pickScale(216, 384, 5) >= 3); });
