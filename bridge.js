// Runs in the ISOLATED world (has extension storage access) and hands the
// configured modifier to content.js in the MAIN world: a data attribute for
// the initial value, plus a CustomEvent whenever the setting changes.
(() => {
  'use strict';

  const publish = ({ modifier }) => {
    document.documentElement.dataset.chessOptionDragModifier = modifier;
    document.dispatchEvent(new CustomEvent('chess-option-drag:config', { detail: modifier }));
  };

  Settings.load().then(publish, () => {});
  Settings.onChange(publish);
})();
