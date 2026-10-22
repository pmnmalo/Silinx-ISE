// The Tasks interface's Program task (#803, #782): iMPACT (web/js/impact.js) arranged for the task.
// - The chain, Initialize Chain, and Program FPGA or Program PROM (as the chip selected in the chain), each with
//   its line, and every operation of the PROM (Verify, Erase, Back up, Reload: no More…, #1025). (Program FPGA offers
//   to implement the design when its programming file is not up to date, in every interface: #1024.)
// - The board, programming tool and cable fields folded away when a board is selected (it chooses them), open when
//   none is.
// The parts are impact.js's own (its imp-* classes); this module adds its few elements in the Tasks interface only
// and takes them away in the others (arrangeProgram).

import { h } from './ui.js';

const ADDED = ['task-prog-settings'];   // (the classes of the elements added)
/** Arranges each open iMPACT page for the Program task (`on`), or puts it back. */
export function arrangeProgram(on) {
  for (const page of document.querySelectorAll('#workspace .doc[data-task="prog"] > .page')) {
    if (!page.querySelector('.impact-chain')) continue;
    if (!on) { for (const c of ADDED) page.querySelectorAll(`.${c}`).forEach(e => e.remove()); page.classList.remove('settings-open'); continue; }
    if (!page.querySelector('.task-prog-settings')) {
      page.querySelector('.imp-settings')?.before(h('button', { class: 'btn task-prog-settings', type: 'button', onclick: () => page.classList.toggle('settings-open') },
        'Board, programming tool and cable…'));
      // (no board selected: the tool and cable are the student's to choose)
      if (!page.querySelector('.imp-settings select')?.value) page.classList.add('settings-open');
    }
  }
}

/** Arranges iMPACT when it opens (its page appears after its document): watched in the Tasks interface only, by one
 *  observer and no timer, so that no closed document is kept (as the emulator's board, #879). */
export function initProgram(arrange) {
  const ws = document.getElementById('workspace');
  const isChain = n => n.nodeType === 1 && (n.matches('.impact-chain') || !!n.querySelector('.impact-chain'));
  const pages = new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(isChain))) arrange(); });
  const watch = () => { if (document.documentElement.dataset.layout === 'tasks') pages.observe(ws, { childList: true, subtree: true }); else pages.disconnect(); };
  new MutationObserver(watch).observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
  watch();
}
