import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepFromView, stopOrder, stops, PX } from '../apps/client/src/render/stops.ts';

const deg = (d: number) => (d * Math.PI) / 180;

test('movement keys walk where the camera looks, snapped to the 8 tile directions', () => {
  // W, D, S, A and W+D at north-up, then with the view turned left by 90°, 180° and 45°.
  assert.deepEqual([stepFromView(0, -1, 0), stepFromView(1, 0, 0), stepFromView(0, 1, 0), stepFromView(-1, 0, 0), stepFromView(1, -1, 0)], [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1]]);
  assert.deepEqual([stepFromView(0, -1, deg(90)), stepFromView(1, 0, deg(90))], [[-1, 0], [0, -1]]);
  assert.deepEqual([stepFromView(0, -1, deg(180)), stepFromView(-1, 0, deg(180))], [[0, 1], [1, 0]]);
  assert.deepEqual([stepFromView(0, -1, deg(45)), stepFromView(1, -1, deg(45))], [[-1, -1], [0, -1]]);
  assert.deepEqual([stepFromView(0, -1, deg(-90)), stepFromView(0, 0, deg(-90))], [[1, 0], [0, 0]]);
});

test('the wheel walks the stops with the eye falling, and the Vista stays off it', () => {
  assert.deepEqual(stopOrder, ['top', 'close', 'play', 'third', 'first']);
  assert.equal(stopOrder.includes('scenery'), false);
  // How steeply the view looks down: the orthographic pitch, or the lens's drop over its run to the point it aims at.
  const fall = stopOrder.map(id => { const s = stops[id]; return s.projection === 'ortho' ? s.pitch : Math.atan2(s.eye.up - s.eye.look, s.eye.back + s.eye.ahead); });
  assert.deepEqual(fall.map((a, i) => i === 0 || a < fall[i - 1]), [true, true, true, true, true]);
});

test('orthographic stops keep a tile a whole number of rows tall', () => {
  assert.deepEqual(['top', 'close', 'play'].map(id => { const s = stops[id as 'top']; return Math.round(Math.sin(s.pitch) * PX * 1e6) / 1e6; }), [31, 28, 24]);
});
