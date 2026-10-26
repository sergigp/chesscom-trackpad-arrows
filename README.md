# Chess Option-Drag

Browser extension (Firefox ≥128, Chrome ≥111) for chess.com: hold a modifier key (Option by default) while clicking/dragging on the board to draw square highlights and arrows — no right-click needed, so it works from a trackpad.

- **Option + drag** → arrow
- **Option + click** → square highlight
- Normal clicks and piece moves are untouched.

The key (Option/Alt, Shift, Command, Control) is configurable from the toolbar popup or the add-on's preferences page. Changes apply instantly.

## Privacy

No data is collected or transmitted. The only stored value is the chosen key, kept in the browser's extension storage (`storage.sync`).

## Development

```bash
npm install        # dev tooling only (web-ext)
npm test           # unit tests (node:test, no browser needed)
npm run lint       # web-ext lint (same linter AMO runs)
npm run build      # → chess-option-drag.zip
npm run icons      # regenerate icons/*.png
npx web-ext run    # launch Firefox with the extension loaded
```

## Releasing to addons.mozilla.org

1. Bump `version` in `manifest.json` (and `package.json`).
2. `npm run check && npm run build`
3. Upload `chess-option-drag.zip` at https://addons.mozilla.org/developers/.
4. Source code upload is not required: all code is unminified and unbundled.

## License

[MIT](LICENSE)
