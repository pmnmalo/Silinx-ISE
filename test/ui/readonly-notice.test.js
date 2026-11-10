// UI (#2697): a read-only document's notice ("Read-only, generated from …") at the right end of its toolbar, its status line at its bottom (#2763), the same in
// every editor: the HDL generated from a drawing, a truth table's schematic, a C source's HDL, its state machine and
// its C model, a Petri net's state machine; before the schematic's ⋮ menu; inside its toolbar on a narrow window; in
// Portuguese. No bar above the toolbar, no name in it (the tab's, #2710). No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, generateTableHdl } from '../../core/logic.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

function ttFiles() {
  const t = { ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'vhdl', generatedFile: 'src/maj.vhd' };
  t.table = { ...(t.table || {}), f: '00010111' };
  return { 'src/maj.tt.json': JSON.stringify(t, null, 2), 'src/maj.vhd': generateTableHdl(t, 'vhdl').code };
}
const NEG = 'module neg(input clk, input d, output reg q);\n  always @(posedge clk) q <= ~d;\nendmodule\n';
const GCD = `unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS PIPELINE off
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
`;

// the notice of the document in front: its text; the right-most of its toolbar's line (the ⋮ menu apart), at the end of
// the toolbar's content (its padding the ⋮'s room), before the ⋮; the toolbar not overflowing
const notice = (page) => page.eval(() => {
  const doc = document.querySelector('.doc:not([hidden])');
  const b = doc.querySelector('.gen-banner.read-only'), bar = b.parentElement;
  // the toolbar the document's first (no bar above it), with no name
  const r = b.getBoundingClientRect(), br = bar.getBoundingClientRect(), cs = getComputedStyle(bar);
  const end = br.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const others = [...bar.children].filter((e) => e !== b && e.getClientRects().length && !e.matches('.se-more, .tb-more'));
  const more = [...bar.querySelectorAll(':scope > :is(.se-more, .tb-more)')].find((e) => e.getClientRects().length);   // (a read-only diagram's hidden)
  return {
    text: b.textContent,
    rightmost: others.every((e) => { const o = e.getBoundingClientRect(); return o.right <= r.left + 0.5 || o.bottom <= r.top + 0.5; }),
    atEnd: Math.abs(r.right - end) < 1.5,
    beforeMore: !more || r.right <= more.getBoundingClientRect().left + 0.5,
    fits: r.left >= br.left - 0.5 && bar.scrollWidth <= bar.clientWidth + 1,
    first: Math.abs(br.top - doc.getBoundingClientRect().top) < 1.5,
    named: !!bar.querySelector('.path'),
    // (its status line, one, at the document's bottom, #2763)
    status: [...doc.querySelectorAll('.doc-status')].map((x) => Math.abs(x.getBoundingClientRect().bottom - doc.getBoundingClientRect().bottom) < 1.5),
  };
});
const OK = { rightmost: true, atEnd: true, beforeMore: true, fits: true, first: true, named: false, status: [true] };
async function check(page, text, what) {
  assert.deepEqual(await notice(page), { text, ...OK }, what);
  await page.setViewport(760, 800);
  await page.waitFor(() => window.innerWidth === 760, [], { what: 'a narrow window' });
  const narrow = await notice(page);
  await page.setViewport(1400, 900);
  await page.waitFor(() => window.innerWidth === 1400, [], { what: 'a wide window' });
  assert.deepEqual(narrow, { text, ...OK }, `${what}, narrow`);
}
async function inPortuguese(page, text, what) {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((t) => document.querySelector('.doc:not([hidden]) .gen-banner.read-only')?.textContent === t, [text], { what: `${what} in Portuguese` });
    assert.deepEqual(await notice(page), { text, ...OK }, `${what}, Portuguese`);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
}

uiTest('#2697 the HDL generated from a drawing and a truth table\'s schematic: "Read-only, generated from …" at the right of the toolbar', E, async (page) => {
  await makeProject(env, { name: 'RoNoteHdl', template: 'gates' });
  await page.openProject('RoNoteHdl');
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && document.querySelector('.doc:not([hidden]) .editor-bar .gen-banner.read-only'), [], { what: 'the generated HDL' });
  await check(page, 'Read-only, generated from gates.sch.json', 'the generated HDL');
  await inPortuguese(page, 'Só de leitura, gerado a partir de gates.sch.json', 'the generated HDL');

  await makeProject(env, { name: 'RoNoteTt', files: ttFiles() });
  await page.openProject('RoNoteTt');
  await page.eval(() => window.SilinxApp.openTtSchematic('src/maj.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/maj.tt.json' && document.querySelector('.doc:not([hidden]) .se-toolbar .se-banner'), [], { what: 'the schematic' });
  await check(page, 'Read-only, generated from maj.tt.json', 'the truth table\'s schematic');
  await inPortuguese(page, 'Só de leitura, gerado a partir de maj.tt.json', 'the truth table\'s schematic');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#2697 a C source\'s HDL and its state machine, an HDL module\'s C model: the notice at the right of the toolbar', E, async (page) => {
  await makeProject(env, { name: 'RoNoteC', top: 'gcd', files: { 'src/gcd.c': GCD, 'src/neg.v': NEG } });
  await page.openProject('RoNoteC');
  await page.leftTab('design');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'gcd'), [], { what: 'the module' });
  await page.click('#hier .row .badge', { text: 'VHDL' });
  await page.waitFor(() => window.Silinx.active?.id === 'chdl:src/gcd.c' && window.Silinx.active.editor, [], { what: 'the generated VHDL' });
  await check(page, 'Read-only, generated from gcd.c', 'the C\'s HDL');
  await page.click('#hier .row .badge', { text: 'ASM' });
  await page.waitFor(() => window.Silinx.active?.id === 'casm:src/gcd.c' && window.Silinx.active.asmEditor, [], { what: 'the ASM chart' });
  await check(page, 'Read-only, the state machine made from gcd.c', 'the C\'s state machine');
  await inPortuguese(page, 'Só de leitura, a máquina de estados feita de gcd.c', 'the C\'s state machine');
  await page.treeRow('#hier', 'neg');
  await page.treeRow('#procs', 'View C Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'cmodel:neg' && window.Silinx.active.editor, [], { what: 'the C model' });
  await check(page, 'Read-only, the C model of neg', 'the C model');
  await inPortuguese(page, 'Só de leitura, o modelo C de neg', 'the C model');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#2710 a Petri net\'s state machine: the notice at the right of the diagram\'s toolbar, no bar above it', E, async (page) => {
  await makeProject(env, { name: 'RoNotePn', top: 'ctl', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } });
  await page.openProject('RoNotePn');
  await page.eval(() => import('/js/drawings.js').then((m) => m.openPetriFsm('src/ctl.pn.json')));
  await page.waitFor(() => window.Silinx.active?.id === 'pnfsm:src/ctl.pn.json' && document.querySelector('.doc:not([hidden]) .asm-toolbar > .gen-banner.read-only'), [], { what: 'the state machine' });
  await check(page, 'Read-only, the state space of the Petri net ctl.pn.json (2 states)', 'the Petri net\'s state machine');
  await inPortuguese(page, 'Só de leitura, o espaço de estados da rede de Petri ctl.pn.json (2 estados)', 'the Petri net\'s state machine');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

// a follower's page of a shared project (#3181): its link opened in a page of its own, Rui's name given
async function follower(page) {
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await fp.waitDialog('Follow a Shared Project');
  await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
  await fp.dialogButton('Follow');
  await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 20000 });
  return fp;
}

uiTest('#3181 a project followed: "Read-only, following Ana\'s project" at the right of the toolbar of a text file, a truth table and a Petri net, each in its read-only mode', E, async (page) => {
  await makeProject(env, { name: 'RoNoteFollow', top: 'ctl', files: { ...ttFiles(), 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2), 'src/neg.v': NEG } });
  await page.openProject('RoNoteFollow');
  const fp = await follower(page);
  const NOTE = 'Read-only, following Ana\'s project';
  try {
    // a text file
    await fp.eval(() => window.SilinxApp.openFile('src/neg.v'));
    await fp.waitFor(() => window.Silinx.active?.id === 'file:src/neg.v' && document.querySelector('.doc:not([hidden]) [data-follow-notice]'), [], { what: 'the text file' });
    await check(fp, NOTE, 'a text file followed');
    // the truth table: its fields read only; Fill Table, the ⋮ menu, the cells' hint and the tick boxes not offered; a cell clicked changes nothing
    await fp.eval(() => window.SilinxApp.openTt('src/maj.tt.json'));
    await fp.waitFor(() => window.Silinx.active?.id === 'tt:src/maj.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor.tt-readonly [data-follow-notice]'), [], { what: 'the truth table' });
    await check(fp, NOTE, 'a truth table followed');
    const T = '.doc:not([hidden]) .tt-editor';
    assert.deepEqual(await fp.eval((t) => ({
      readOnly: [...document.querySelectorAll(`${t} :is(.tt-inputs, .tt-outputs, .tt-notes, .tt-expr-in)`)].map((x) => x.readOnly),
      shown: ['.tt-toolbar .tb-more', '.tt-row .tt-btn', '.tt-left > .hint'].map((s) => !!document.querySelector(`${t} ${s}`)?.getClientRects().length),
      ticks: [...document.querySelectorAll(`${t} .tt-hdl`)].every((x) => x.disabled),
    }), T), { readOnly: [true, true, true, true], shown: [false, false, false], ticks: true });
    await fp.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
    assert.equal(await fp.eval((t) => document.querySelector(`${t} .tt-cell[data-out=f][data-row="0"]`).textContent, T), '0');
    assert.equal(await fp.eval(() => window.Silinx.active.ttEditor.getModel().table.f), '00010111');
    // the Petri net: no drawing tools, no Delete, no Import PNML; a place selected, its fields disabled, Delete changes nothing
    await fp.eval(() => window.SilinxApp.openPetri('src/ctl.pn.json'));
    await fp.waitFor(() => window.Silinx.active?.id === 'pn:src/ctl.pn.json' && document.querySelector('.doc:not([hidden]) .petri-editor.asm-readonly [data-follow-notice]'), [], { what: 'the Petri net' });
    await check(fp, NOTE, 'a Petri net followed');
    const P = '.doc:not([hidden]) .petri-editor';
    assert.deepEqual(await fp.eval((p) => ['.pn-tool', '.asm-danger', '.pn-pnml-in'].map((s) => [...document.querySelectorAll(`${p} ${s}`)].some((x) => x.getClientRects().length)), P), [false, false, false]);
    const at = await fp.eval((p) => { const r = document.querySelector(`${p} .pn-place[data-id=p1] circle`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 4 }; }, P);
    await fp.click(at);
    await fp.waitFor((p) => document.querySelector(`${p} .pn-selection h3`)?.textContent === 'Place idle', [P], { what: 'idle selected' });
    assert.equal(await fp.eval((p) => [...document.querySelectorAll(`${p} .asm-side :is(input, textarea, select)`)].every((x) => x.disabled), P), true);
    await fp.key('Delete');
    assert.equal(await fp.eval((p) => !!document.querySelector(`${p} .pn-place[data-id=p1]`), P), true);
    assert.equal(await fp.eval(() => window.Silinx.active.petriEditor.canDelete()), false);
    assert.equal(await fp.eval(() => !!window.Silinx.active.dirty), false);
    assert.deepEqual(fp.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
