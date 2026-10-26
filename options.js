(() => {
  'use strict';

  const isMac = /Mac/.test(navigator.platform);
  const LABELS = isMac
    ? { altKey: 'Option ⌥', shiftKey: 'Shift ⇧', metaKey: 'Command ⌘', ctrlKey: 'Control ⌃' }
    : Settings.MODIFIERS;

  const fieldset = document.getElementById('modifiers');
  const warning = document.getElementById('warning');
  const status = document.getElementById('status');
  let statusTimer = 0;

  for (const value of Object.keys(Settings.MODIFIERS)) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'modifier';
    input.value = value;
    label.append(input, ' ', LABELS[value]);
    fieldset.append(label);
  }

  const render = ({ modifier }) => {
    fieldset.querySelector(`input[value="${modifier}"]`).checked = true;
    warning.hidden = !(isMac && modifier === 'ctrlKey');
  };

  fieldset.addEventListener('change', async (e) => {
    const values = { modifier: e.target.value };
    render(values);
    try {
      await Settings.save(values);
      status.textContent = 'Saved';
    } catch (err) {
      status.textContent = `Could not save: ${err.message}`;
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 1500);
  });

  Settings.load().then(render);
})();
