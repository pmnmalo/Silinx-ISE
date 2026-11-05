// The Board Emulator's modules outside the board (#2522): a checkable item for each in the toolbar's menu (#2666, #2846), to show or hide it (the
// VGA monitor, the serial terminal, the iCEBreaker's modules on its Pmods). A module is what its drawing marks with data-module; hiding it
// changes the view only: the design goes on driving it. The choice is remembered, per module.
import { prefKey } from './prefs.js';
import { menuCheck, menuTitle } from './toolbar-menu.js';

const LABELS = { vga: 'VGA monitor', serial: 'Serial terminal', display: 'Display', switches: 'Switches' };
const MODULE_KEY = (id) => prefKey(`silinx.emulator.module.${id}`);
const pref = (id) => { try { return localStorage.getItem(MODULE_KEY(id)) !== 'hidden'; } catch { return true; } };

/** The items, in the toolbar's menu (menu), for the modules in main; changed(): after one is shown or hidden. */
export function mountEmuModules({ main, menu, changed }) {
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
  // (a checkable item of the menu for each, as every toolbar menu's, #2846)
  const item = (id) => {
    const on = pref(id);
    show(id, on);
    const it = menuCheck(LABELS[id] || id, { checked: on, title: 'Show or hide this module: the design goes on running', onChange: (shown) => {
      show(id, shown);
      try { localStorage.setItem(MODULE_KEY(id), shown ? 'shown' : 'hidden'); } catch { /* ignore */ }
      changed();
    } });
    it.dataset.moduleToggle = id;
    return it;
  };
  menu.append(menuTitle('Show'), ...ids.map(item));
}
