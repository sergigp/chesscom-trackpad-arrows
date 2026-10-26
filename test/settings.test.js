import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// Fake chrome.storage.sync with onChanged support.
function fakeChrome(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  return {
    data,
    storage: {
      sync: {
        get: async (defaults) => ({ ...defaults, ...data }),
        set: async (values) => {
          const changes = {};
          for (const [k, v] of Object.entries(values)) {
            changes[k] = { oldValue: data[k], newValue: v };
            data[k] = v;
          }
          listeners.forEach((fn) => fn(changes, 'sync'));
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
  };
}

function loadSettings(chrome, extra = {}) {
  const sandbox = { chrome, ...extra };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${read('settings.js')}\nglobalThis.Settings = Settings;`, sandbox);
  return sandbox;
}

test('defaults to Option/Alt', async () => {
  const { Settings } = loadSettings(fakeChrome());
  assert.equal((await Settings.load()).modifier, 'altKey');
});

test('sanitize rejects unknown and inherited keys', () => {
  const { Settings } = loadSettings(fakeChrome());
  for (const bad of ['toString', '__proto__', 'button', undefined, 42]) {
    assert.equal(Settings.sanitize({ modifier: bad }).modifier, 'altKey', String(bad));
  }
  assert.equal(Settings.sanitize(null).modifier, 'altKey');
  assert.equal(Settings.sanitize({ modifier: 'metaKey' }).modifier, 'metaKey');
});

test('save + load round-trips and notifies listeners', async () => {
  const chrome = fakeChrome();
  const { Settings } = loadSettings(chrome);
  const seen = [];
  Settings.onChange((v) => seen.push(v.modifier));
  await Settings.save({ modifier: 'shiftKey' });
  assert.equal(chrome.data.modifier, 'shiftKey');
  assert.equal((await Settings.load()).modifier, 'shiftKey');
  assert.deepEqual(seen, ['shiftKey']);
});

test('bridge publishes the stored modifier and live changes to the page', async () => {
  const chrome = fakeChrome({ modifier: 'ctrlKey' });
  const events = [];
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init.detail; }
  }
  const document = {
    documentElement: { dataset: {} },
    dispatchEvent: (e) => events.push(e),
  };
  const sandbox = loadSettings(chrome, { document, CustomEvent });
  vm.runInContext(read('bridge.js'), sandbox);
  await new Promise((r) => setImmediate(r));

  assert.equal(document.documentElement.dataset.chessOptionDragModifier, 'ctrlKey');
  assert.deepEqual(events.map((e) => [e.type, e.detail]), [['chess-option-drag:config', 'ctrlKey']]);

  await sandbox.Settings.save({ modifier: 'metaKey' });
  assert.equal(document.documentElement.dataset.chessOptionDragModifier, 'metaKey');
  assert.equal(events.at(-1).detail, 'metaKey');
});
