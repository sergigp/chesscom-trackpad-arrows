// Chess Option-Drag
// On the chess.com board, holding the modifier (Option by default) turns a
// left click/drag into a right click/drag:
//   Option + drag  -> arrow
//   Option + click -> square highlight
// Normal clicks and drags (moving pieces) are never touched.
//
// Runs in the page's MAIN world, which has no extension APIs. The chosen
// modifier is delivered by bridge.js (ISOLATED world) via a data attribute on
// <html> and a CustomEvent for live updates.
(() => {
  'use strict';

  const MODIFIERS = ['altKey', 'shiftKey', 'metaKey', 'ctrlKey'];
  const DEFAULT_MODIFIER = 'altKey';
  const CONFIG_ATTR = 'chessOptionDragModifier';    // data-chess-option-drag-modifier
  const CONFIG_EVENT = 'chess-option-drag:config';

  const BOARD_TAGS = new Set(['WC-CHESS-BOARD', 'CHESS-BOARD']);
  const RIGHT_BUTTON = 2;   // MouseEvent.button for the secondary button
  const RIGHT_MASK = 2;     // MouseEvent.buttons bitmask while it is held
  const SWALLOW_MS = 400;   // how long to wait for the trailing native click

  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log('[ChessOptionDrag]', ...a); };

  const root = document.documentElement;
  root.dataset.chessOptionDrag = 'loaded';

  let modifier = DEFAULT_MODIFIER;
  const setModifier = (value) => {
    if (MODIFIERS.includes(value)) modifier = value;
    log('modifier', modifier);
  };
  setModifier(root.dataset[CONFIG_ATTR]);
  document.addEventListener(CONFIG_EVENT, (e) => setModifier(e.detail));

  let active = null;        // pointerId of the converted gesture, or null
  let swallowClick = false; // eat the native click that follows the up
  let swallowTimer = 0;

  const onBoard = (e) =>
    e.composedPath().some((n) => n && BOARD_TAGS.has(n.tagName));

  const block = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  function baseInit(e, button, buttons) {
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      // Drop our modifier so chess.com doesn't read it as an arrow-colour key;
      // the other modifiers are passed through unchanged.
      altKey: modifier === 'altKey' ? false : e.altKey,
      shiftKey: modifier === 'shiftKey' ? false : e.shiftKey,
      metaKey: modifier === 'metaKey' ? false : e.metaKey,
      ctrlKey: modifier === 'ctrlKey' ? false : e.ctrlKey,
      button,
      buttons,
      relatedTarget: e.relatedTarget,
    };
  }

  // Re-fire a native pointer event as its right-button pointer + mouse pair,
  // the same order the browser uses for real input.
  function forward(e, pointerType, mouseType, pointerButton, mouseButton, buttons) {
    const target = e.target;
    target.dispatchEvent(new PointerEvent(pointerType, {
      ...baseInit(e, pointerButton, buttons),
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      isPrimary: e.isPrimary,
      width: e.width,
      height: e.height,
      pressure: buttons ? 0.5 : 0,
    }));
    target.dispatchEvent(new MouseEvent(mouseType, baseInit(e, mouseButton, buttons)));
  }

  function release(e, pointerType) {
    active = null;
    swallowClick = true;
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(() => { swallowClick = false; }, SWALLOW_MS);
    forward(e, pointerType, 'mouseup', RIGHT_BUTTON, RIGHT_BUTTON, 0);
    log('released', pointerType);
  }

  function handler(e) {
    if (!e.isTrusted) return; // our own synthetic events pass straight through

    switch (e.type) {
      case 'pointerdown':
        if (active !== null || e.button !== 0 || !e[modifier] || !onBoard(e)) return;
        log('converting to right-click drag');
        active = e.pointerId;
        block(e);
        forward(e, 'pointerdown', 'mousedown', RIGHT_BUTTON, RIGHT_BUTTON, RIGHT_MASK);
        return;

      case 'pointermove':
        if (active === null || e.pointerId !== active) return;
        block(e);
        // Button released outside the window: the pointerup never reached us.
        if (e.buttons === 0) {
          release(e, 'pointerup');
          return;
        }
        // pointermove uses button -1 ("no change"); mousemove uses 0.
        forward(e, 'pointermove', 'mousemove', -1, 0, RIGHT_MASK);
        return;

      case 'pointerup':
      case 'pointercancel':
        if (active === null || e.pointerId !== active) return;
        block(e);
        release(e, e.type);
        return;

      // Native compatibility mouse events and the trailing click: we already
      // sent our own versions, so just drop these.
      case 'mousedown':
      case 'mousemove':
        if (active !== null) block(e);
        return;
      case 'mouseup':
        if (active !== null || swallowClick) block(e);
        return;
      case 'click':
      case 'auxclick':
      case 'contextmenu':
        if (active !== null || swallowClick) {
          block(e);
          if (e.type === 'click') swallowClick = false;
        }
        return;
    }
  }

  // Capture phase on window: runs before any of the page's own listeners.
  for (const type of [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'mousedown', 'mousemove', 'mouseup', 'click', 'auxclick', 'contextmenu',
  ]) {
    window.addEventListener(type, handler, { capture: true });
  }
})();
