import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../content.js', import.meta.url), 'utf8');

class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, init);
    this.type = type;
    this.isTrusted = false;
  }
}
class PointerEvent extends FakeEvent {}
class MouseEvent extends FakeEvent {}

let env;

// Loads content.js into a fresh sandbox with a minimal DOM.
function load({ modifierAttr } = {}) {
  const windowListeners = {};
  const documentListeners = {};
  const timers = [];
  const dataset = {};
  if (modifierAttr) dataset.chessOptionDragModifier = modifierAttr;

  const window = {
    addEventListener: (type, fn, opts) => { windowListeners[type] = { fn, opts }; },
  };
  const document = {
    documentElement: { dataset },
    addEventListener: (type, fn) => { documentListeners[type] = fn; },
  };
  const sandbox = {
    window,
    document,
    location: { href: 'https://www.chess.com/play' },
    console,
    PointerEvent,
    MouseEvent,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
  };
  vm.runInNewContext(SOURCE, sandbox);

  const board = { tagName: 'WC-CHESS-BOARD' };
  const square = { tagName: 'DIV', dispatched: [], dispatchEvent(ev) { this.dispatched.push(ev); } };

  env = {
    windowListeners,
    documentListeners,
    timers,
    dataset,
    board,
    square,
    // Fires a trusted native event through the extension's capture listener.
    fire(type, init = {}, { onBoard = true } = {}) {
      const ev = {
        type,
        isTrusted: true,
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: 10,
        clientY: 20,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        target: square,
        blocked: false,
        composedPath: () => (onBoard ? [square, board, document, window] : [square, document, window]),
        preventDefault() { this.blocked = true; },
        stopImmediatePropagation() { this.stopped = true; },
        ...init,
      };
      windowListeners[type].fn(ev);
      return ev;
    },
    takeDispatched() {
      const out = square.dispatched.map((e) => ({ ctor: e.constructor.name, ...e }));
      square.dispatched.length = 0;
      return out;
    },
  };
  return env;
}

beforeEach(() => load());

test('marks the document as loaded', () => {
  assert.equal(env.dataset.chessOptionDrag, 'loaded');
});

test('registers capture-phase listeners on window', () => {
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'contextmenu']) {
    assert.equal(env.windowListeners[type].opts.capture, true, type);
  }
});

test('plain left click is untouched', () => {
  const ev = env.fire('pointerdown', { buttons: 1 });
  assert.equal(ev.blocked, false);
  assert.equal(env.takeDispatched().length, 0);
});

test('Option + left click off the board is untouched', () => {
  const ev = env.fire('pointerdown', { altKey: true, buttons: 1 }, { onBoard: false });
  assert.equal(ev.blocked, false);
  assert.equal(env.takeDispatched().length, 0);
});

test('Option + drag on the board becomes a right-button drag', () => {
  const down = env.fire('pointerdown', { altKey: true, shiftKey: true, buttons: 1 });
  assert.equal(down.blocked, true);
  let out = env.takeDispatched();
  assert.deepEqual(out.map((e) => [e.ctor, e.type, e.button, e.buttons]), [
    ['PointerEvent', 'pointerdown', 2, 2],
    ['MouseEvent', 'mousedown', 2, 2],
  ]);
  assert.equal(out[0].altKey, false, 'modifier is stripped');
  assert.equal(out[0].shiftKey, true, 'other modifiers pass through');

  assert.equal(env.fire('mousedown', { altKey: true }).blocked, true);

  const move = env.fire('pointermove', { altKey: true, buttons: 1, clientX: 50 });
  assert.equal(move.blocked, true);
  out = env.takeDispatched();
  assert.deepEqual(out.map((e) => [e.type, e.button, e.buttons, e.clientX]), [
    ['pointermove', -1, 2, 50],
    ['mousemove', 0, 2, 50],
  ]);

  const up = env.fire('pointerup', { altKey: true, buttons: 0 });
  assert.equal(up.blocked, true);
  out = env.takeDispatched();
  assert.deepEqual(out.map((e) => [e.type, e.button, e.buttons]), [
    ['pointerup', 2, 0],
    ['mouseup', 2, 0],
  ]);

  assert.equal(env.fire('mouseup').blocked, true);
  assert.equal(env.fire('click').blocked, true);
  assert.equal(env.fire('contextmenu').blocked, false, 'click ends the swallow window');
});

test('swallow window expires after the timer', () => {
  env.fire('pointerdown', { altKey: true, buttons: 1 });
  env.fire('pointerup', { altKey: true });
  env.timers.forEach((fn) => fn());
  assert.equal(env.fire('click').blocked, false);
});

test('moves after the gesture are untouched', () => {
  env.fire('pointerdown', { altKey: true, buttons: 1 });
  env.fire('pointerup', { altKey: true });
  env.takeDispatched();
  assert.equal(env.fire('pointermove', { buttons: 0 }).blocked, false);
  assert.equal(env.takeDispatched().length, 0);
});

test('pointercancel ends the gesture', () => {
  env.fire('pointerdown', { altKey: true, buttons: 1 });
  env.takeDispatched();
  env.fire('pointercancel');
  assert.deepEqual(env.takeDispatched().map((e) => e.type), ['pointercancel', 'mouseup']);
  assert.equal(env.fire('pointermove', { buttons: 1 }).blocked, false);
});

test('release outside the window ends the gesture on the next move', () => {
  env.fire('pointerdown', { altKey: true, buttons: 1 });
  env.takeDispatched();
  env.fire('pointermove', { buttons: 0 });
  assert.deepEqual(env.takeDispatched().map((e) => e.type), ['pointerup', 'mouseup']);
  assert.equal(env.fire('pointermove', { buttons: 0 }).blocked, false);
});

test('events from another pointer are ignored during a gesture', () => {
  env.fire('pointerdown', { altKey: true, buttons: 1 });
  env.takeDispatched();
  assert.equal(env.fire('pointermove', { pointerId: 7, buttons: 1 }).blocked, false);
  assert.equal(env.fire('pointerup', { pointerId: 7 }).blocked, false);
  assert.equal(env.takeDispatched().length, 0);
});

test('synthetic events are never re-processed', () => {
  const ev = env.fire('pointerdown', { isTrusted: false, altKey: true, buttons: 1 });
  assert.equal(ev.blocked, false);
  assert.equal(env.takeDispatched().length, 0);
});

test('reads the configured modifier from the data attribute', () => {
  load({ modifierAttr: 'shiftKey' });
  assert.equal(env.fire('pointerdown', { altKey: true, buttons: 1 }).blocked, false);
  const ev = env.fire('pointerdown', { shiftKey: true, altKey: true, buttons: 1 });
  assert.equal(ev.blocked, true);
  const [pointer] = env.takeDispatched();
  assert.equal(pointer.shiftKey, false);
  assert.equal(pointer.altKey, true);
});

test('config event switches the modifier live', () => {
  env.documentListeners['chess-option-drag:config']({ detail: 'metaKey' });
  assert.equal(env.fire('pointerdown', { altKey: true, buttons: 1 }).blocked, false);
  assert.equal(env.fire('pointerdown', { metaKey: true, buttons: 1 }).blocked, true);
});

test('invalid modifier values are ignored', () => {
  load({ modifierAttr: 'toString' });
  assert.equal(env.fire('pointerdown', { altKey: true, buttons: 1 }).blocked, true);
  env.fire('pointerup', { altKey: true });
  env.documentListeners['chess-option-drag:config']({ detail: '__proto__' });
  assert.equal(env.fire('pointerdown', { altKey: true, buttons: 1 }).blocked, true);
});
