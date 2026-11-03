// The actions an interface lets the user reach (#2450): with a project open and each kind of editor open, every
// button, menu item, context menu's item, process and command of the command search shown, by its label (normalised:
// actionKey) and where it was found. (By its label: the app has no ids shared by a menu's item, a toolbar's button and a
// process; the same action under two labels is the test's SAME list.) test/ui/interface-parity.test.js compares the two interfaces'.

/** An action's key from its label: lower case, its shortcut, its "…", its "▾" and its spaces gone. */
export function actionKey(label) {
  return String(label ?? '').replace(/\s*\((?:ctrl|cmd|shift|alt|f\d)[^)]*\)\s*$/i, '').replace(/[…▾▸]|\.\.\.$/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// (run in the page) the actions shown now: the buttons, the toolbars' "more" menus opened, the menu bar's menus and
// their submenus, the Processes rows; the context menus of the panes' rows and of the editor in front; `where` the
// place they are reported at
export function scanPage(where, { menus = true, panes = true, editor = true } = {}) {
  const out = [];
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const label = (e) => (e.getAttribute('title') || e.getAttribute('aria-label') || e.textContent || '').trim();
  const add = (place, lbl) => { const l = String(lbl || '').trim(); if (l) out.push({ label: l, where: `${where}: ${place}` }); };
  const placeOf = (e) => {
    const c = e.closest('.doc .editor-bar, .doc [class*=toolbar], .doc, #toolbar, #top-actions, #task-switch, #task-tabs, #task-view, #left, #console-wrap, #statusbar, #titlebar');
    if (!c) return 'page';
    return c.id ? `#${c.id}` : c.closest('.doc') && c !== c.closest('.doc') ? 'editor toolbar' : 'editor';
  };
  const rows = (m) => [...m.querySelectorAll(':scope > .mi')];
  const closeMenus = () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  // a popup's items, its submenus opened (hovered) one by one
  const readPopup = (m, place, trail = []) => {
    for (const r of rows(m)) {
      const l = r.querySelector('.lbl')?.textContent.trim() || '';
      if (r.querySelector('.sc')?.textContent === '▸') {
        r.dispatchEvent(new MouseEvent('mouseenter'));
        const sub = m.querySelector(':scope > .menu-popup.sub');
        if (sub) readPopup(sub, place, [...trail, l]);
      } else add(trail.length ? `${place} › ${trail.join(' › ')}` : place, l);
    }
  };
  const popupAfter = (fn, place) => {
    closeMenus();
    fn();
    const m = document.querySelector('body > .menu-popup:not(.sub)');
    if (m) readPopup(m, place);
    closeMenus();
  };
  const ctx = (el, place) => {
    const r = el.getBoundingClientRect();
    popupAfter(() => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(8, r.width / 2), clientY: r.top + r.height / 2, button: 2 })), place);
  };
  // the toolbars' "more" menus opened, their buttons shown
  const mores = [...document.querySelectorAll('.tb-more-menu[hidden], .se-more-menu[hidden]')].filter((m) => shown(m.parentElement));
  for (const m of mores) m.hidden = false;
  try {
    for (const e of document.querySelectorAll('button, .btn, [role=button], .tb-btn, .m-step, .task-btn, a.se-more, select, input[type=radio], input[type=checkbox]')) {
      if (!shown(e) || e.closest('.dlg-overlay, .menu-popup, .pal-overlay, #doc-tabs')) continue;
      // (a radio button or a check box: by its label's text, its icon's left out)
      if (e.matches('input')) { add(placeOf(e), [...(e.closest('label')?.childNodes || [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('') || e.value); continue; }
      // (a list: by its form's label, its options its values)
      if (e.matches('select')) { add(placeOf(e), e.title || e.getAttribute('aria-label') || (e.previousElementSibling?.matches('label') ? e.previousElementSibling.textContent : e.name)); continue; }
      add(placeOf(e), label(e));
    }
  } finally { for (const m of mores) m.hidden = true; }
  // the menu bar's menus (shown: the ISE style interface's), and the header's Settings
  if (menus) {
    for (const t of document.querySelectorAll('#menubar .item')) {
      if (!shown(t)) continue;
      popupAfter(() => { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.click(); }, `menu bar ${t.textContent.trim()}`);
    }
    const s = document.getElementById('settings-btn');
    if (s && shown(s)) popupAfter(() => s.click(), 'Settings');
  }
  // the Processes rows (an action each) and the panes' rows' context menus: one row per kind of row (its badge or icon)
  if (panes) {
    for (const r of document.querySelectorAll('#procs .row, .task-emu-tree .row')) if (shown(r)) add('Processes', r.querySelector('.lbl')?.textContent);
    // (a row's menu selects it, which draws the Processes again: the rows looked for anew after each)
    const seen = new Set();
    const paneOf = (r) => (r.closest('#procs, .task-emu-tree') ? 'Processes' : r.closest('#hier') ? 'Design' : r.closest('#files-page') ? 'Files' : r.closest('[id]')?.id || 'side panel');
    const kindOf = (r, pane) => `${pane}|${pane === 'Processes' ? r.querySelector('.lbl')?.textContent : r.querySelector('.ico, .icon, img, svg')?.outerHTML.slice(0, 80) || r.className}`;
    for (;;) {
      const r = [...document.querySelectorAll('#left .row')].sort((a, b) => (paneOf(b) === 'Processes') - (paneOf(a) === 'Processes'))
        .find((x) => shown(x) && !seen.has(kindOf(x, paneOf(x))));
      if (!r) break;
      seen.add(kindOf(r, paneOf(r)));
      ctx(r, `${paneOf(r)} context menu`);
    }
  }
  // the editor in front: its context menu on its empty space
  if (editor) {
    const d = document.querySelector('#workspace > .doc:not([hidden])');
    const c = d && [...d.querySelectorAll('svg, canvas, .cm-content, .tt-table, table')].find(shown);
    if (c) ctx(c, 'editor context menu');
  }
  return out;
}

// the states an interface shows its parts in: the ISE style interface's views, the Silinx interface's tasks
async function states(page) {
  return page.eval(() => (document.documentElement.dataset.layout === 'tasks'
    ? [...document.querySelectorAll('#task-switch .task-btn')].filter((b) => !b.hidden).map((b) => ({ task: b.dataset.task }))
    : [...document.querySelectorAll('input[name=view]')].map((r) => ({ view: r.value }))));
}
async function enter(page, s) {
  if (s.task) {
    await page.eval((t) => document.querySelector(`#task-switch .task-btn[data-task="${t}"]`).click(), s.task);
    await page.waitFor((t) => document.documentElement.dataset.task === t, [s.task], { what: `task ${s.task}` });
  } else await page.eval((v) => { const r = document.querySelector(`input[name=view][value=${v}]`); r.click(); }, s.view);
  // (the side panel and the messages shown)
  await page.eval(() => {
    const h = document.documentElement;
    if (h.dataset.layout !== 'tasks') return;
    if (h.dataset.max === 'on') document.querySelector('#task-view [data-act=max]')?.click();
    if (h.dataset.side === 'folded') document.querySelector('#task-view [data-act=side]')?.click();
    if (h.dataset.console === 'folded') document.querySelector('#task-view [data-act=console]')?.click();
  });
}
// (the top module selected: the Processes the same in both, the Silinx interface's Implement shows the top's)
const selectTop = (page) => page.eval(() => {
  const A = window.SilinxApp, m = A.S.modules.find((x) => x.name === A.S.project?.top);
  if (m && A.S.view !== 'sim') A.select({ type: 'module', module: m.name, file: m.file });
});
const settle = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))));

/** Every action the page's interface lets the user reach, with the documents `files` of the project open one by one
 *  (a path, or { open: 'openImpact' } one of the app's own documents) after one look at every state (a task or a view,
 *  and each page of the side panel) with none: [{ label, where }]. */
export async function collectActions(page, files) {
  const all = [];
  const scanAll = async (what, opts) => {
    for (const s of await states(page)) {
      await enter(page, s);
      await selectTop(page);
      await settle(page);
      const tabs = await page.eval(() => [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length).map((t) => t.dataset.page));
      for (const tab of tabs.length ? tabs : [null]) {
        if (tab) { await page.eval((p) => document.querySelector(`#left-tabs .tab[data-page="${p}"]`).click(), tab); await settle(page); }
        all.push(...await page.eval(scanPage, `${what} ${s.task || s.view}${tab ? `/${tab}` : ''}`, opts));
      }
    }
  };
  await scanAll('no document', { editor: false });
  for (const f of files) {
    // (a file by its path, else one of the app's own documents by its opener: openImpact, openSummary…)
    const what = f.open || f;
    const before = await page.eval(() => window.SilinxApp.S.active?.id ?? null);
    await page.eval((x) => { const A = window.SilinxApp; return x.open ? A[x.open]() : A.openFile(x); }, f);
    await page.waitFor((x, b) => { const a = window.SilinxApp.S.active; return !!a && (x.open ? a.id !== b : a.path === x); }, [f, before], { what: `${what} open` });
    await settle(page);
    // (the document's own task, or view: where it is in front; its folded parts unfolded, then folded again)
    const unfold = () => page.eval(() => { for (const b of document.querySelectorAll('#workspace > .doc:not([hidden]) button[aria-expanded=false]:not(.tb-more-btn, [aria-haspopup])')) { b.click(); b.dataset.unfolded = ''; } });
    all.push(...await page.eval(scanPage, what, { menus: false, panes: false }));
    await unfold();
    await settle(page);
    all.push(...await page.eval(scanPage, `${what} unfolded`, { menus: false, panes: false, editor: false }));
    await page.eval(() => { for (const b of document.querySelectorAll('[data-unfolded]')) { b.click(); delete b.dataset.unfolded; } });
  }
  return all;
}

/** The command search's commands (Ctrl+K: the menus' enabled commands), its opening checked. */
export async function paletteCommands(page) {
  await page.key('k', { modifiers: 2 });
  await page.waitFor(() => !!document.querySelector('.pal-overlay'), [], { what: 'the command search open' });
  await page.key('Escape');
  return page.eval(() => {
    // (every command, a disabled one too: shown once it is enabled)
    const out = [];
    const walk = (items, trail) => {
      for (const it of (typeof items === 'function' ? items() : items) || []) {
        if (!it || it === '-') continue;
        if (it.submenu) walk(it.submenu, [...trail, it.label]);
        else if (it.action) out.push({ label: it.label, where: `command search: ${trail.join(' › ')}` });
      }
    };
    for (const m of window.SilinxApp.S.menus) walk(m.items, [m.label]);
    return out;
  });
}

// the command search's commands not run by runCommands: [its label (a pattern), why]
export const NOT_RUN = [
  [/^Close Project$/, 'ends the project the next commands need (its own tests: projects, toolbars)'],
  [/^Implement Top Module$|^Run$/, 'the whole implementation, minutes long (its own tests: open-toolchain, tasks)'],
  [/^Check for Updates/, 'asks GitHub (its own tests: release-url, update links)'],
  [/^(Set|Unset) as Top Module$/, 'changes the top module the next commands need (its own tests: top-module, unset-top)'],
  [/^Clear Recent Projects$/, 'forgets the other tests\' projects'],
];
// (the menus' items not run either: the interface, the language, the theme and the recent projects change the page
// under the test, their own tests are interface-names, the i18n tests, dark-contrast and projects)
const NOT_RUN_GROUPS = /› (Interface|Language|Theme|Recent Projects)$/;

/** Every enabled command of the command search run as the search runs it (runAction), each one's dialog closed after
 *  it: { ran: [paths], failed: ['path: error'] }. */
export async function runCommands(page) {
  const paths = await page.eval(async () => {
    const { menuCommands } = await import('/js/silinx.js');
    return menuCommands(window.SilinxApp.S.menus).map((c) => ({ path: c.path, group: c.group.join(' › '), label: c.label }));
  });
  const ran = [], failed = [];
  for (const c of paths) {
    if (NOT_RUN.some(([re]) => re.test(c.label)) || NOT_RUN_GROUPS.test(` › ${c.group}`)) continue;
    const n = page.console.filter((x) => x.type === 'error').length, e = page.errors.length;
    const r = await page.eval(async (path) => {
      const { menuCommands } = await import('/js/silinx.js');
      const { runAction } = await import('/js/ui.js');
      const it = menuCommands(window.SilinxApp.S.menus).find((x) => x.path === path);
      if (!it) return 'gone';   // (disabled by the commands before)
      window.parityError = null;
      // (not waited for: a command may wait for its dialog)
      try { Promise.resolve(runAction(it.label, it.action)).catch((err) => { window.parityError = String(err?.message || err); }); } catch (err) { return String(err?.message || err); }
      return 'ran';
    }, c.path);
    await page.eval(() => new Promise((res) => setTimeout(res, 150)));
    for (let i = 0; i < 8 && await page.eval(() => !!document.querySelector('.dlg-overlay, .pal-overlay, .menu-popup')); i++) {
      await page.key('Escape');
      await page.eval(() => new Promise((res) => setTimeout(res, 100)));
      if (i > 3) await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.dlg-buttons .btn:last-child')?.click());
    }
    const err = r !== 'ran' && r !== 'gone' ? r : await page.eval(() => window.parityError);
    const logged = page.console.filter((x) => x.type === 'error').slice(n).map((x) => x.text);
    if (err || logged.length || page.errors.length > e) failed.push(`${c.path}: ${[err, ...logged, ...page.errors.slice(e)].filter(Boolean).join(' | ')}`);
    if (r === 'ran') ran.push(c.path);
  }
  return { ran, failed };
}
