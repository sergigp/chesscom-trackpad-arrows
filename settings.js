// Shared settings definition, loaded by bridge.js and options.js.
// eslint-disable-next-line no-unused-vars
const Settings = (() => {
  'use strict';

  const api = globalThis.browser ?? globalThis.chrome;

  const MODIFIERS = {
    altKey: 'Option / Alt',
    shiftKey: 'Shift',
    metaKey: 'Command / Windows',
    ctrlKey: 'Control',
  };
  const DEFAULTS = { modifier: 'altKey' };

  const sanitize = (stored) => ({
    modifier: stored && Object.hasOwn(MODIFIERS, stored.modifier) ? stored.modifier : DEFAULTS.modifier,
  });

  return {
    MODIFIERS,
    DEFAULTS,
    sanitize,
    load: async () => sanitize(await api.storage.sync.get(DEFAULTS)),
    save: (values) => api.storage.sync.set(sanitize(values)),
    onChange: (cb) => api.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.modifier) cb(sanitize({ modifier: changes.modifier.newValue }));
    }),
  };
})();
