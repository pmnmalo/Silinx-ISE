// The Board Emulator's modules outside the board (#2522): a checkbox for each in the toolbar, to show or hide it (the
// VGA monitor, the iCEBreaker's modules on its Pmods). A module is what its drawing marks with data-module; hiding it
// changes the view only: the design goes on driving it. The choice is remembered, per module.
import { h } from './dom.js';
import { prefKey } from './prefs.js';

const LABELS = { vga: 'VGA monitor', display: 'Display', switches: 'Switches' };
const MODULE_KEY = (id) => prefKey(`silinx.emulator.module.${id}`);
const pref = (id) => { try { return localStorage.getItem(MODULE_KEY(id)) !== 'hidden'; } catch { return true; } };

/** The checkboxes, before the toolbar's status (stat), for the modules in main; changed(): after one is shown or hidden. */
export function mountEmuModules({ main, stat, changed }) {
  const all = [...main.querySelectorAll('[data-module]')], ids = [...new Set(all.map((e) => e.dataset.module))];
  if (!ids.length) return;
  // the room a board keeps over itself for its modules (data-module-room), given back when none of them is shown
  const fit = () => {
    for (const pcb of main.querySelectorAll('[data-module-room]')) {
      const none = [...pcb.querySelectorAll('[data-module]')].every((e) => e.style.display === 'none'), room = Number(pcb.dataset.moduleRoom);
      pcb.classList.toggle('emu-no-room', none);
      pcb.style.setProperty('--emu-room', `${room}px`);
      pcb.style.height = `${pcb.querySelector('svg').height.baseVal.value - (none ? room : 0)}px`;
    }
  };
  const show = (id, on) => { for (const e of all) if (e.dataset.module === id) e.style.display = on ? '' : 'none'; fit(); };
  const box = (id) => {
    const on = pref(id);
    show(id, on);
    return h('label', { class: 'emu-module', title: 'Show or hide this module: the design goes on running' },
      h('input', { type: 'checkbox', checked: on, 'data-module-toggle': id, onchange: (e) => {
        show(id, e.target.checked);
        try { localStorage.setItem(MODULE_KEY(id), e.target.checked ? 'shown' : 'hidden'); } catch { /* ignore */ }
        changed();
      } }), LABELS[id] || id);
  };
  stat.before(h('span', { class: 'sep' }), 'Show:', ...ids.map(box));
}
