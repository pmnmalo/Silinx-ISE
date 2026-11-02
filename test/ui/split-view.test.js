// UI (#1619, #1652): two documents side by side, each side with its own tabs. A schematic (the example gates) and its
// generated VHDL: Show Generated HDL Beside (its tab's right-click menu) opens the HDL on the other side, read-only, the
// schematic kept in front; an edit of the schematic reaches the HDL beside it; a click in a pane brings its document to
// the front; the divider dragged; a document opened goes to the side worked in; kept with the project (a reload comes
// back split); a side's last document closed leaves the other alone. The Split button (the header's right end, before
// the side panel's): the right side empty, what to open there, the next document opened there; a tab dragged to the
// other side, or moved by its menu; View ▸ Split Editor; a narrow workspace stacks the sides, each with its tabs over
// it; a C source's HDL beside it, made again as the C is saved; Portuguese; the Tasks interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the documents shown: their ids, panes and boxes; the divider's
const shown = (page) => page.eval(() => {
  const ws = document.getElementById('workspace');
  const docs = window.Silinx.docs.filter((d) => d.el.getClientRects().length).map((d) => {
    const r = d.el.getBoundingClientRect();
    return { id: d.id, pane: d.el.classList.contains('pane-a') ? 'a' : d.el.classList.contains('pane-b') ? 'b' : null, front: d === window.Silinx.active,
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  }).sort((x, y) => (x.pane || '').localeCompare(y.pane || ''));
  const dv = document.getElementById('split-divider');
  return { docs, split: ws.classList.contains('split'), vertical: ws.classList.contains('split-v'), divider: !!dv && !!dv.getClientRects().length };
});
const ids = async (page) => (await shown(page)).docs.map((d) => `${d.pane || '-'}:${d.id}${d.front ? '*' : ''}`);
// a document's tab, by its title (a point on it)
const tab = (page, title) => page.eval((t) => {
  const r = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length).getBoundingClientRect();
  return { x: r.left + r.width / 3, y: r.top + r.height / 2 };
}, title);
// each side's tabs (* in front, + shown beside it), or the one row of tabs
const tabRows = (page) => page.eval(() => {
  const lbl = (t) => `${t.querySelector('.tlabel').textContent}${t.classList.contains('active') ? '*' : ''}${t.classList.contains('beside') ? '+' : ''}`;
  const g = [...document.querySelectorAll('#doc-tabs > .tab-group')];
  return g.length ? Object.fromEntries(g.map((x) => [x.dataset.side, [...x.children].map(lbl)])) : { one: [...document.querySelectorAll('#doc-tabs > .tab')].map(lbl) };
});
const tabMenu = async (page, title) => {
  await page.rightClick(await tab(page, title));
  const m = await page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the tab menu' });
  return m;
};
const noWarnings = async (page) => {
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
};
const SCH = 'sch:src/gates.sch.json', VHD = 'file:src/gates.vhd';

uiTest('#1619 a schematic and its generated VHDL side by side: the HDL follows the schematic, a pane clicked, the divider dragged, kept, closed', E, async (page) => {
  await makeProject(env, { name: 'Split', template: 'gates' });
  await page.openProject('Split');
  await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
  await page.waitFor((id) => window.Silinx.active?.id === id && window.Silinx.active.schEditor, [SCH], { what: 'the schematic' });
  assert.deepEqual(await ids(page), [`-:${SCH}*`]);

  // its tab's menu: Show Generated HDL Beside (no Move to the Other Side, no Close Split: not split)
  const m = await tabMenu(page, 'gates.sch.json');
  assert.deepEqual(m.slice(-2), ['Close All', 'Show Generated HDL Beside']);
  await page.click('body > .menu-popup .mi', { text: 'Show Generated HDL Beside' });
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd')?.editor, [], { what: 'split' });
  // the schematic left, in front; its VHDL right, read-only; the divider between them
  let s = await shown(page);
  assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
  assert.equal(s.vertical, false);
  assert.equal(s.divider, true);
  assert.ok(s.docs[0].right <= s.docs[1].left && s.docs[1].left - s.docs[0].right <= 8, JSON.stringify(s.docs));
  assert.ok(Math.abs(s.docs[0].width - s.docs[1].width) <= 4, 'halves');
  assert.equal(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').editor.readOnly()), true);
  // each side its tabs (the Design Summary, opened with the project, behind the schematic), over its pane
  assert.deepEqual(await tabRows(page), { a: ['Design Summary', 'gates.sch.json*'], b: ['gates.vhd+'] });
  const bar = await page.eval(() => [...document.querySelectorAll('#doc-tabs > .tab-group')].map((g) => { const r = g.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; }));
  assert.ok(Math.abs(bar[0].left - s.docs[0].left) <= 4 && Math.abs(bar[1].right - s.docs[1].right) <= 4 && Math.abs(bar[1].left - s.docs[1].left) <= 8, JSON.stringify({ bar, docs: s.docs }));
  assert.match(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').editor.getValue()), /entity gates is/);

  // an edit of the schematic (its description) reaches the HDL beside it
  await page.waitFor(() => document.querySelector('.doc.pane-a .se-props textarea'), [], { what: 'the sheet properties' });
  await page.fill('.doc.pane-a .se-props textarea', 'Side by side.');
  await page.waitFor(() => /^-- Side by side\.$/m.test(window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').editor.getValue()), [], { what: 'the HDL beside updated', timeout: 15000 });
  assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
  assert.equal(!!(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').dirty)), false);

  // a click in the HDL's pane: it is in front, both still shown
  await page.click('.doc.pane-b .cm-content');
  await page.waitFor((id) => window.Silinx.active?.id === id, [VHD], { what: 'the HDL in front' });
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);

  // the divider dragged to a third: the panes follow
  const ws = await page.eval(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.left, w: r.width, y: r.top + r.height / 2 }; });
  await page.drag('#split-divider', { x: ws.x + ws.w / 3, y: ws.y });
  s = await shown(page);
  assert.ok(Math.abs(s.docs[0].width - ws.w / 3) <= 8, JSON.stringify(s.docs));
  assert.ok(s.docs[1].width > s.docs[0].width * 1.8);

  // kept with the project: a reload comes back split, the HDL in front
  await page.reload();
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && window.Silinx.docs.some((d) => d.id === 'file:src/gates.vhd'), [], { what: 'split again after a reload', timeout: 20000 });
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);
  s = await shown(page);
  assert.ok(Math.abs(s.docs[0].width - ws.w / 3) <= 8, 'the divider where it was');
  assert.deepEqual(await tabRows(page), { a: ['Design Summary', 'gates.sch.json+'], b: ['gates.vhd*'] });

  // a document opened goes to the side worked in (the HDL's), a tab of its own there
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd', [], { what: 'the test bench' });
  assert.deepEqual(await ids(page), [`a:${SCH}`, 'b:file:sim/tb_gates.vhd*']);
  assert.deepEqual(await tabRows(page), { a: ['Design Summary', 'gates.sch.json+'], b: ['gates.vhd', 'tb_gates.vhd*'] });
  await page.click(await tab(page, 'gates.vhd'));
  await page.waitFor((id) => window.Silinx.active?.id === id, [VHD]);
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);
  // (a document of the side closed: the side's next one)
  await page.click(await tab(page, 'tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd');
  await page.click('#doc-tabs .tab.active .tclose');
  await page.waitFor(() => !window.Silinx.docs.some((d) => d.id === 'file:sim/tb_gates.vhd'), [], { what: 'the test bench closed' });
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);

  // the right side's last document closed: the schematic alone, in front
  await page.click('#doc-tabs .tab.active .tclose');
  await page.waitFor(() => !window.Silinx.docs.some((d) => d.id === 'file:src/gates.vhd'), [], { what: 'the HDL closed' });
  s = await shown(page);
  assert.deepEqual(await ids(page), [`-:${SCH}*`]);
  assert.equal(s.split, false);
  assert.equal(s.divider, false);
  assert.deepEqual(await tabRows(page), { one: ['Design Summary', 'gates.sch.json*'] });
  const w = await page.eval(() => document.getElementById('workspace').getBoundingClientRect().width);
  assert.ok(Math.abs(s.docs[0].width - w) <= 2, 'the whole workspace');
  await noWarnings(page);
});

uiTest('#1652 the Split button: the right side empty, a document opened there, a tab dragged across or moved; View ▸ Split Editor; a narrow workspace stacks the sides; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SplitAny', template: 'gates' });
  await page.openProject('SplitAny');
  // (the Design Summary, opened with the project in the background, its module loaded first: before the test bench, #2603)
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'summary'), [], { what: 'the Design Summary' });
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd' && window.Silinx.active.editor);
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor((id) => window.Silinx.active?.id === id && window.Silinx.active.editor, [VHD]);
  const viewItems = () => page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'View').items().filter((x) => x && x !== '-' && /Split|Beside/.test(x.label))
    .map((x) => `${x.label}${x.checked ? ' (checked)' : ''}${x.disabled?.() ? ' (disabled)' : ''}`));
  assert.deepEqual(await viewItems(), ['Split Editor', 'Show Generated HDL Beside (disabled)']);
  // (no Open to the Side any more: the tab's menu, not split)
  assert.ok(!(await tabMenu(page, 'tb_gates.vhd')).some((l) => /Side|Split/.test(l)));
  await page.closeMenus();

  // the button: at the header's right end (in the Tasks interface, between the messages' button and Maximize, #1657)
  const btn = await page.eval(() => {
    const b = document.getElementById('split-btn'), r = b?.getBoundingClientRect();
    return b && { right: r.right > innerWidth * 0.6, top: r.top < 90, shown: !!b.getClientRects().length, next: b.nextElementSibling?.dataset.act || null, pressed: b.getAttribute('aria-pressed'), title: b.title };
  });
  assert.deepEqual({ ...btn, next: btn.next === 'max' || btn.next === null }, { right: true, top: true, shown: true, next: true, pressed: 'false', title: 'Split the editor: two documents side by side, each side with its tabs' });
  if (await page.eval(() => !!document.getElementById('task-view'))) assert.equal(btn.next, 'max');
  await page.click('#split-btn');
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split' });
  // the right side empty, worked in: how to bring a document there under a large pen (#1720), the other documents one click away
  assert.deepEqual(await ids(page), [`a:${VHD}*`]);
  // (the Tasks interface: the Design Summary is Implement's, not a pick of Design's, #2603)
  const tasks = await page.eval(() => !!document.getElementById('task-view'));
  const empty = await page.eval(() => { const e = document.getElementById('split-empty'); return { side: e.dataset.side, front: e.classList.contains('pane-front'), text: e.querySelector('p').textContent, icon: (() => { const r = e.querySelector('.split-ico svg')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height), r.bottom <= e.querySelector('p').getBoundingClientRect().top] : null; })(), picks: [...e.querySelectorAll('.split-picks button')].filter((b) => b.getClientRects().length).map((b) => b.textContent) }; });
  assert.deepEqual(empty, { side: 'b', front: true, text: 'Drag a tab here, or right-click an open tab and choose Move to the Other Side', icon: [48, 48, true], picks: tasks ? ['tb_gates.vhd'] : ['Design Summary', 'tb_gates.vhd'] });
  assert.equal(await page.eval(() => document.getElementById('split-btn').getAttribute('aria-pressed')), 'true');
  assert.deepEqual(await viewItems(), ['Split Editor (checked)', 'Show Generated HDL Beside (disabled)']);
  // a document opened (the Design pane's schematic): there
  await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
  await page.waitFor((id) => window.Silinx.active?.id === id && window.Silinx.active.schEditor, [SCH], { what: 'the schematic' });
  assert.deepEqual(await ids(page), [`a:${VHD}`, `b:${SCH}*`]);
  assert.deepEqual((await tabRows(page)).b, ['gates.sch.json*']);
  // a tab dragged to the other side's pane: moved there, in front
  const into = await page.eval(() => { const r = document.querySelector('#workspace > .doc.pane-b').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.drag(await tab(page, 'tb_gates.vhd'), into, { steps: 12 });
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd', [], { what: 'the test bench moved' });
  assert.deepEqual(await ids(page), [`a:${VHD}`, 'b:file:sim/tb_gates.vhd*']);
  assert.deepEqual((await tabRows(page)).b, ['gates.sch.json', 'tb_gates.vhd*']);
  // its menu: Move to the Other Side, Close Split
  assert.deepEqual((await tabMenu(page, 'tb_gates.vhd')).slice(-2), ['Move to the Other Side', 'Close Split']);
  await page.click('body > .menu-popup .mi', { text: 'Move to the Other Side' });
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab-group[data-side="a"] .tab.active')?.textContent.includes('tb_gates'), [], { what: 'moved back' });
  assert.deepEqual(await ids(page), ['a:file:sim/tb_gates.vhd*', `b:${SCH}`]);

  // a narrow workspace: one above the other, each side's tabs over it
  await page.setViewport(600, 900);
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split-v'), [], { what: 'stacked' });
  await page.eval(() => { if (document.body.classList.contains('drawer-open')) document.getElementById('drawer-btn')?.click(); });
  const s = await shown(page);
  if (s.docs.length === 2) {   // (a narrow screen's drawer can cover the workspace: its documents still split)
    assert.ok(s.docs[0].bottom <= s.docs[1].top && s.docs[0].width === s.docs[1].width, JSON.stringify(s.docs));
    const g = await page.eval(() => { const r = document.querySelector('#doc-tabs > .tab-group[data-side="b"]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
    assert.ok(g.top >= s.docs[0].bottom && Math.abs(g.bottom - s.docs[1].top) <= 3, JSON.stringify({ g, docs: s.docs }));
  }
  await page.setViewport(1400, 900);
  await page.waitFor(() => !document.getElementById('workspace').classList.contains('split-v'), [], { what: 'side by side again' });

  // Portuguese: the commands, the button, the divider, the empty side
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await tabMenu(page, 'tb_gates.vhd')).slice(-2), ['Mover para o Outro Lado', 'Fechar a Divisão']);
  await page.closeMenus();
  const pt = await page.openMenu('Ver');
  for (const l of ['Dividir o Editor', 'Mostrar o HDL Gerado ao Lado']) assert.ok(pt.some((i) => i.label === l), `${l}: ${pt.map((i) => i.label).join(' | ')}`);
  await page.closeMenus();
  assert.deepEqual(await page.eval(() => [document.getElementById('split-btn').title, document.getElementById('split-divider').title]),
    ['Dividir o editor: dois documentos lado a lado, cada lado com os seus separadores', 'Arraste para mudar o tamanho dos lados (duplo clique: metades)']);
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.docs.find((d) => d.id === 'sch:src/gates.sch.json')));
  await page.waitFor(() => !document.getElementById('workspace').classList.contains('split'), [], { what: 'the right side\'s last closed' });
  await page.click('#split-btn');
  await page.waitFor(() => !document.getElementById('split-empty')?.hidden && document.querySelector('#split-empty p')?.textContent.startsWith('Arraste'), [], { what: 'the empty side in Portuguese' });
  assert.equal(await page.eval(() => document.querySelector('#split-empty p').textContent), 'Arraste para aqui um separador, ou clique com o botão direito num separador aberto e escolha Mover para o Outro Lado');
  await page.menu('Ver', 'Dividir o Editor');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.waitFor(() => !document.getElementById('workspace').classList.contains('split'), [], { what: 'one side' });
  assert.equal(await page.eval(() => document.getElementById('split-btn').getAttribute('aria-pressed')), 'false');
  assert.deepEqual(await ids(page), ['-:file:sim/tb_gates.vhd*']);
  await noWarnings(page);
});

const C = 'int mac(int a, int b, int *acc) {\n  int p = a * b;\n  *acc = *acc + p;\n  return p;\n}\n';
uiTest('#1619 a C source and its generated VHDL side by side: made again as the C is saved', E, async (page) => {
  await makeProject(env, { name: 'SplitC', top: '', files: { 'src/mac.c': C } });
  await page.openProject('SplitC');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'mac'), [], { what: 'the module mac' });
  await page.eval(() => window.SilinxApp.openFile('src/mac.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/mac.c' && window.Silinx.active.editor);
  await page.menu('View', 'Show Generated HDL Beside');
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && window.Silinx.docs.find((d) => d.id === 'chdl:src/mac.c')?.editor, [], { what: 'the C and its VHDL' });
  assert.deepEqual(await ids(page), ['a:file:src/mac.c*', 'b:chdl:src/mac.c']);
  const hdl = () => page.eval(() => window.Silinx.docs.find((d) => d.id === 'chdl:src/mac.c').editor.getValue());
  assert.match(await hdl(), /entity mac is/);
  // the C edited and saved: its VHDL beside it made again
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace('int mac(', 'int mac2(')); });
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(async () => /entity mac2 is/.test(await (window.Silinx.docs.find((d) => d.id === 'chdl:src/mac.c')?.editor.getValue() || '')), [], { what: 'the VHDL beside made again', timeout: 15000 });
  assert.deepEqual(await ids(page), ['a:file:src/mac.c*', 'b:chdl:src/mac.c']);
  await noWarnings(page);
});

uiTest('#1619 Tasks interface: the schematic and its VHDL side by side in Design; another task\'s document alone', E, async (page) => {
  await makeProject(env, { name: 'SplitTasks', template: 'gates' });
  const ui = await page.eval(() => localStorage.getItem('silinx.ui'));
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  try {
    await page.reload();
    await page.openProject('SplitTasks');
    await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
    await page.waitFor((id) => window.Silinx.active?.id === id && window.Silinx.active.schEditor, [SCH], { what: 'the schematic' });
    // (the Split button in the header's layout buttons, before Maximize: #1657)
    assert.deepEqual(await page.eval(() => [...document.getElementById('task-view').children].map((b) => b.id || b.dataset.act)), ['side', 'console', 'split-btn', 'max']);
    await page.menu('View', 'Show Generated HDL Beside');
    await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split' });
    assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
    // the Design Summary (Implement's): alone, the pair kept for Design
    await page.eval(() => window.SilinxApp.openSummary());
    await page.waitFor(() => window.Silinx.active?.id === 'summary', [], { what: 'the summary' });
    assert.deepEqual(await ids(page), ['-:summary*']);
    await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
    await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split again in Design' });
    assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
    await noWarnings(page);
  } finally {
    await page.eval((u) => (u ? localStorage.setItem('silinx.ui', u) : localStorage.removeItem('silinx.ui')), ui);
  }
});
