# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Manifest V3 browser extension (Chrome + Firefox) for chess.com: holding a modifier (Option/Alt by default, user-configurable) while left-clicking/dragging on the board is converted into a right-click/drag, so arrows and square highlights can be drawn from a trackpad. No build step and no runtime dependencies; `npm` is only for dev tooling (`web-ext`, tests).

## Commands

- `npm test` — unit tests (`node:test`, loads scripts into a `vm` sandbox with fake DOM/`chrome.storage`).
- `npm run lint` — `web-ext lint` (AMO's linter). `npm run check` = test + lint.
- `npm run build` — zip to `chess-option-drag.zip` (gitignored); excluded files listed in `web-ext-config.mjs`.
- `npm run icons` — regenerate `icons/*.png` from `scripts/make-icons.mjs`.
- Manual: Chrome `chrome://extensions` → Load unpacked; Firefox ≥140 `about:debugging` → Load Temporary Add-on, or `npx web-ext run`.
- Verify load: `document.documentElement.dataset.chessOptionDrag === 'loaded'` in page console. Set `DEBUG = true` in `content.js` for `[ChessOptionDrag]` logs (keep `false` for releases).
- Bump `version` in `manifest.json` and `package.json` for releases.

## Architecture

- `content.js` — MAIN world, `document_start`, so its capture-phase listeners on `window` run before chess.com's handlers. No extension APIs available here.
  - Board detection: `composedPath()` contains `WC-CHESS-BOARD` / `CHESS-BOARD`.
  - On trusted `pointerdown` button 0 + modifier on the board, native event is blocked and re-dispatched as synthetic right-button `PointerEvent` + `MouseEvent` (`forward`). Subsequent `pointermove`/`pointerup`/`pointercancel` for the same `pointerId` likewise (`buttons` mask 2; move uses `button: -1` pointer / `0` mouse). A move with `buttons === 0` ends the gesture (release outside window).
  - `active` = pointerId of in-progress gesture; `swallowClick` (400ms or first `click`) drops trailing native `mouseup`/`click`/`auxclick`/`contextmenu`.
  - Synthetic events pass via `e.isTrusted` guard — keep it or the handler loops.
  - Active modifier is stripped from forwarded events (`baseInit`) so chess.com doesn't treat it as an arrow-colour key.
- `settings.js` — shared `Settings` (modifier list, defaults, `sanitize`, `storage.sync` load/save/onChange). Used by bridge and options page.
- `bridge.js` — ISOLATED world; reads settings and passes the modifier to `content.js` via `data-chess-option-drag-modifier` on `<html>` (initial) and `chess-option-drag:config` CustomEvent (string detail; live updates).
- `options.html/js/css` — settings UI, used as both `options_ui` and toolbar `action` popup. Auto-saves on change.