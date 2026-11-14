// UI: a state's and a transition's look in the FSM editor's Properties (#3883, web/js/fsm-look.js): in the app, a
// state's fill and border colours, border width, text colour, size, style and font, a transition's line colour, width
// and style, its label's colour, size, style and font, each drawn (the computed style of the circle, the arc, its
// arrowhead and the texts; the circle grown with its text), a value refused (the console's warning, the value in force
// shown again), a colour back to the theme's (✕) and Default look, Undo and Redo; the theme: a colour not chosen follows
// it, a chosen one is kept; the diagram saved with its look only (the defaults not written), its HDL as before
// (VHDL and Verilog: the same text, compiled and elaborated with no warnings), reopened as it was; the labels in
// Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm, generateFsm } from '../../core/fsm.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A (initial) --x--> B (z=1) --!x--> A
const machine = (lang) => normalizeFsm({
  name: 'lk', lang, inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 120, y: 160, outputs: {} }, { id: 'b', name: 'B', x: 360, y: 160, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'b', to: 'a', cond: '!x' }], initial: 'a',
});

/** The computed look of the state `id` and of the transition `tid` as drawn. */
const drawn = (page) => page.eval((ed) => {
  const q = (s) => document.querySelector(`${ed} ${s}`), cs = (s) => getComputedStyle(q(s));
  const c = cs('[data-state=b] .fsm-circle'), n = cs('[data-state=b] .fsm-name'), o = cs('[data-state=b] .fsm-outs');
  const l = cs('[data-trans=t1] .fsm-edge-line'), t = cs('[data-trans=t1] .fsm-label');
  const mk = q('[data-trans=t1] .fsm-edge-line').getAttribute('marker-end').slice(5, -1);
  return {
    state: { fill: c.fill, stroke: c.stroke, width: c.strokeWidth, r: +q('[data-state=b] .fsm-circle').getAttribute('r'),
      name: [n.fill, n.fontSize, n.fontWeight, n.fontStyle, n.fontFamily], outs: [o.fill, o.fontSize, o.fontWeight, o.fontStyle, o.fontFamily] },
    trans: { stroke: l.stroke, width: l.strokeWidth, dash: l.strokeDasharray, marker: mk.replace(/^fsm\d+-/, ''),
      head: getComputedStyle(document.querySelector(`${ed} #${mk} path`)).fill, label: [t.fill, t.fontSize, t.fontWeight, t.fontStyle, t.fontFamily] },
  };
}, ED);
const look = (page) => page.eval(() => { const m = window.Silinx.active.fsmEditor.getModel(); return [m.states.map((s) => s.look ?? null), m.transitions.map((t) => t.look ?? null)]; });
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmLook${lang}`, hdl = `src/lk.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#3883 FSM: a state's and a transition's look set in Properties, drawn, undone, saved and reopened; the ${lang === 'vhdl' ? 'VHDL' : 'Verilog'} unchanged`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/lk.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
    await page.eval(() => window.SilinxApp.openFsm('src/lk.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/lk.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
    const d0 = await drawn(page);
    // (the default look, as before: the CSS's)
    assert.deepEqual([d0.state.width, d0.state.name.slice(1, 4), d0.state.outs.slice(1, 4), d0.trans.width, d0.trans.dash, d0.trans.marker, d0.trans.label.slice(1, 4)],
      ['1.6px', ['13px', '700', 'normal'], ['12px', '400', 'normal'], '1.6px', 'none', 'arr', ['12px', '400', 'normal']]);

    // ---- the state B: its fields (empty: the default), each set
    await page.click(`${ED} [data-state=b] .fsm-circle`);
    await page.waitForSelector(`${ED} .fsm-look-title`);
    const labels = await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-selection .asm-field > .asm-label`)].map((l) => l.textContent).slice(-7), ED);
    assert.deepEqual(labels, ['Fill colour', 'Border colour', 'Border width', 'Text colour', 'Text size', 'Text style', 'Font']);
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-colour-reset`)].map((b) => b.hidden), ED), [true, true, true]);
    await page.fill(`${ED} input[data-key="look:fill"]`, '#ffcc00');
    await page.fill(`${ED} input[data-key="look:stroke"]`, '#0000ff');
    await page.fill(`${ED} input[data-key="look:strokeWidth"]`, '3');
    await page.fill(`${ED} input[data-key="look:color"]`, '#800000');
    await page.fill(`${ED} input[data-key="look:fontSize"]`, '20');
    await page.fill(`${ED} .fsm-look-sel.textStyle`, 'italic');
    await page.fill(`${ED} .fsm-look-sel.font`, 'serif');
    assert.deepEqual((await look(page))[0], [null, { fill: '#ffcc00', stroke: '#0000ff', strokeWidth: 3, color: '#800000', fontSize: 20, textStyle: 'italic', font: 'serif' }]);
    // (selected or under the mouse, its border the accent: drawn with A selected, the mouse away)
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ state: 'a' }); });
    await page.mouse('mouseMoved', 2, 2);
    const d1 = await drawn(page);
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ state: 'b' }); });
    await page.waitForSelector(`${ED} .fsm-look-title`);
    assert.deepEqual(d1.state, { fill: 'rgb(255, 204, 0)', stroke: 'rgb(0, 0, 255)', width: '3px', r: d1.state.r,
      name: ['rgb(128, 0, 0)', '20px', '400', 'italic', 'serif'], outs: ['rgb(128, 0, 0)', '18.5px', '400', 'italic', 'serif'] });
    assert.ok(d1.state.r > d0.state.r, `the circle grown with its text (${d0.state.r} → ${d1.state.r})`);
    // a size refused: the console's warning, the value in force shown again
    await page.fill(`${ED} input[data-key="look:fontSize"]`, '60');
    const want = 'WARNING: src/lk.fsm.json: State B: the text size \'60\' must be a whole number from 6 to 48 (not applied)';
    await page.waitFor((w) => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === w), [want], { what: 'the warning' });
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} input[data-key="look:fontSize"]`).value, ED), '20');
    // a colour back to the theme's (✕): the fill's reset, now shown for the four colours set
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-colour-reset`)].map((b) => b.hidden), ED), [false, false, false]);
    await page.click(`${ED} .fsm-colour.stroke + .fsm-colour-reset`);
    assert.equal((await look(page))[0][1].stroke, undefined);
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ state: 'a' }); });
    await page.mouse('mouseMoved', 2, 2);
    assert.equal((await drawn(page)).state.stroke, d0.state.stroke);
    // Undo: the border colour again; Redo: gone again
    await page.eval(() => window.Silinx.active.fsmEditor.undo());
    assert.equal((await look(page))[0][1].stroke, '#0000ff');
    assert.equal((await drawn(page)).state.stroke, 'rgb(0, 0, 255)');
    await page.eval(() => window.Silinx.active.fsmEditor.redo());
    assert.equal((await look(page))[0][1].stroke, undefined);

    // ---- the transition A → B: its line and its label
    await page.click(`${ED} [data-trans=t1] .fsm-label`);
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-selection h3`)?.textContent === 'Transition' && document.querySelector(`${ed} .fsm-look-sel.dash`), [ED], { what: 'the transition\'s look' });
    await page.fill(`${ED} input[data-key="look:stroke"]`, '#cc0000');
    await page.fill(`${ED} input[data-key="look:strokeWidth"]`, '2');
    await page.fill(`${ED} .fsm-look-sel.dash`, 'dashed');
    await page.fill(`${ED} input[data-key="look:color"]`, '#008000');
    await page.fill(`${ED} input[data-key="look:fontSize"]`, '16');
    await page.fill(`${ED} .fsm-look-sel.textStyle`, 'bold');
    await page.fill(`${ED} .fsm-look-sel.font`, 'sans-serif');
    // (its click selected it: drawn selected, the accent over its colour; unselected, its own)
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ state: 'a' }); });
    await page.mouse('mouseMoved', 2, 2);
    const d2 = await drawn(page);
    assert.deepEqual(d2.trans, { stroke: 'rgb(204, 0, 0)', width: '2px', dash: '10px, 6px', marker: 'arr-cc0000', head: 'rgb(204, 0, 0)',
      label: ['rgb(0, 128, 0)', '16px', '700', 'normal', 'sans-serif'] });
    assert.deepEqual((await look(page))[1], [{ stroke: '#cc0000', strokeWidth: 2, dash: 'dashed', color: '#008000', fontSize: 16, textStyle: 'bold', font: 'sans-serif' }, null]);
    // dotted, then Default look
    await page.click(`${ED} [data-trans=t1] .fsm-label`);
    await page.waitForSelector(`${ED} .fsm-look-sel.dash`);
    await page.fill(`${ED} .fsm-look-sel.dash`, 'dotted');
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ state: 'a' }); });
    await page.mouse('mouseMoved', 2, 2);
    assert.deepEqual([(await drawn(page)).trans.dash, await page.eval((ed) => getComputedStyle(document.querySelector(`${ed} [data-trans=t1] .fsm-edge-line`)).strokeLinecap, ED)], ['0px, 5px', 'round']);
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ transition: 't1' }); });
    await page.waitForSelector(`${ED} .fsm-look-default`);
    await page.click(`${ED} .fsm-look-default`);
    assert.equal((await look(page))[1][0], null);
    await page.eval(() => { window.Silinx.active.fsmEditor.focus({ state: 'a' }); });
    await page.mouse('mouseMoved', 2, 2);
    assert.deepEqual((await drawn(page)).trans, d0.trans);
    await page.eval(() => window.Silinx.active.fsmEditor.undo());
    assert.equal((await look(page))[1][0].dash, 'dotted');

    // ---- the theme: a colour not chosen follows it (A's fill, the arc t2 has none), a chosen one is kept (B's fill)
    const fills = () => page.eval((ed) => ['a', 'b'].map((s) => getComputedStyle(document.querySelector(`${ed} [data-state=${s}] .fsm-circle`)).fill), ED);
    const light = await fills();
    await page.eval(async () => (await import('/js/silinx.js')).setTheme('dark'));
    const dark = await fills();
    await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
    assert.notEqual(dark[0], light[0]);
    assert.deepEqual([light[1], dark[1]], ['rgb(255, 204, 0)', 'rgb(255, 204, 0)']);

    // ---- saved: the look only, the defaults not written; its HDL as before, compiled and elaborated with no warnings
    const saved = await page.waitFor(async (p) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Flk.fsm.json`)).json();
      return m.transitions[0].look?.dash === 'dotted' && m;
    }, [pj], { what: 'the diagram saved', timeout: 15000 });
    assert.deepEqual([saved.states.map((s) => s.look ?? null), saved.transitions.map((t) => t.look ?? null)],
      [[null, { fill: '#ffcc00', strokeWidth: 3, color: '#800000', fontSize: 20, textStyle: 'italic', font: 'serif' }],
        [{ stroke: '#cc0000', strokeWidth: 2, dash: 'dotted', color: '#008000', fontSize: 16, textStyle: 'bold', font: 'sans-serif' }, null]]);
    const code = await page.eval(async (p, h) => (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text(), pj, hdl);
    assert.equal(code, generateFsm(machine(lang), lang).code);
    const lib = compile([{ path: hdl.slice(4), lang, text: code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'lk').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);

    // ---- reopened: drawn as it was
    const before = await drawn(page);
    await page.eval(async () => { await window.SilinxApp.closeDoc(window.SilinxApp.findDoc('fsm:src/lk.fsm.json')); });
    await page.eval(() => window.SilinxApp.openFsm('src/lk.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/lk.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor again' });
    assert.deepEqual(await drawn(page), before);
    // (the console: the size refused only; the Check's Errors and Warnings: none)
    assert.deepEqual(await warnings(page), [want]);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent)),
      [`WARNING:Silinx - ${want.slice(9)}`]);
  });
}

uiTest('#3883 FSM: a file\'s look not valid drawn with the default look, its error in the console; the Look\'s labels in Portuguese', E, async (page) => {
  const m = machine('vhdl');
  m.states[1].look = { fill: 'yellow', fontSize: 20 };
  await makeProject(env, { name: 'FsmLookBad', files: { 'src/lk.fsm.json': JSON.stringify(m, null, 2) } });
  await page.openProject('FsmLookBad');
  await page.eval(() => window.SilinxApp.openFsm('src/lk.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/lk.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
  const err = 'State B: the fill colour \'yellow\' is not a colour: #rrggbb (e.g. #ffcc00)';
  await page.waitFor((e) => [...document.querySelectorAll('#console-errors .diag')].some((d) => d.textContent.includes(e)), [err], { what: 'the error' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent)),
    [`ERROR:FSM - "src/lk.fsm.json": ${err}`]);
  // (the fill: the theme's, as A's; the valid size drawn)
  assert.deepEqual(await page.eval((ed) => {
    const c = (s) => getComputedStyle(document.querySelector(`${ed} [data-state=${s}] .fsm-circle`)).fill;
    return [c('a') === c('b'), getComputedStyle(document.querySelector(`${ed} [data-state=b] .fsm-name`)).fontSize];
  }, ED), [true, '20px']);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.click(`${ED} [data-state=b] .fsm-circle`);
    await page.waitForSelector(`${ED} .fsm-look-title`);
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-look-title`).textContent === 'Aspeto', [ED], { what: 'translated' });
    const pt = await page.eval((ed) => {
      const S = document.querySelector(`${ed} .fsm-selection`);
      return [S.querySelector('.fsm-look-title').textContent, [...S.querySelectorAll('.asm-field > .asm-label')].map((l) => l.textContent).slice(-7),
        [...S.querySelectorAll('.fsm-look-sel.textStyle option, .fsm-look-sel.font option')].map((o) => o.textContent), S.querySelector('.fsm-look-default').textContent];
    }, ED);
    assert.deepEqual(pt, ['Aspeto', ['Cor de preenchimento', 'Cor do contorno', 'Largura do contorno', 'Cor do texto', 'Tamanho do texto', 'Estilo do texto', 'Tipo de letra'],
      ['Predefinido (nome a negrito)', 'Normal', 'Negrito', 'Itálico', 'Negrito itálico', 'Predefinida', 'Sem serifa', 'Com serifa', 'Monoespaçado'], 'Aspeto predefinido']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});
