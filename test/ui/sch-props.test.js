// UI: the schematic editor's Properties panel (web/js/sch-props.js, #405: out of mountSchEditor), mounted alone in the
// page with an editor of its own whose actions are recorded: the sheet's properties (its language), a gate's (its width,
// inputs, its inverted inputs, a reserved name refused), an I/O marker's, several objects' commands, a module's
// instance opened, the panel read-only and during a live simulation, the message of a net renamed with its names, the
// properties several objects have in common set for all of them at once (#1471).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a sheet with an AND2 (U1), I/O markers A (an input) and B (an output), a module instance (M1 of 'sub'), a VCC (V1) and a GND saved before VCC / GND
// had a Width (G1, #953); the editor's edit() applies, normalizes
// the document (a new object, as the editor's) and draws the panel again
const MOUNT = async (readOnly = false) => {
  const { mountProps } = await import('/js/sch-props.js');
  const { normalizeDoc } = await import('/core/schdoc.js');
  const propBody = document.createElement('div');
  document.body.append(propBody);
  const modules = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'i', dir: 'in', width: 1 }, { name: 'o', dir: 'out', width: 1 }] } };
  let doc = normalizeDoc({ name: 'top', lang: 'vhdl', symbols: [{ id: 'S1', type: 'and2', name: 'U1', x: 100, y: 100 },
    { id: 'S2', type: 'module', name: 'M1', x: 300, y: 100, params: { module: 'sub' } },
    { id: 'S3', type: 'vcc', name: 'V1', x: 500, y: 100, params: { width: 1 } }, { id: 'S4', type: 'gnd', name: 'G1', x: 600, y: 100 }],
  ports: [{ id: 'P1', name: 'A', dir: 'in', x: 20, y: 100 }, { id: 'P2', name: 'B', dir: 'out', x: 20, y: 300 }] }, { modules });
  let sel = new Set(), genLang = 'vhdl', live = null;
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const opts = { onSelect: (s) => calls.push(['onSelect', s?.name ?? null]), onOpenModule: (m, o) => calls.push(['onOpenModule', m, o.instance]) };
  const props = mountProps({ opts, container: document.body, propBody, readOnly, doc: () => doc, sel: () => sel, nl: () => null, live: () => live,
    modules: () => modules, setGenLang: (v) => { genLang = v; }, edit: (fn) => { fn(); doc = normalizeDoc(doc, { modules }); calls.push(['edit']); props.renderProps(); },
    flash: rec('flash'), rotateSel: rec('rotateSel'), mirrorSel: rec('mirrorSel'), deleteSel: rec('deleteSel'), nextId: () => 'L1',
    openInfo: rec('openInfo'), infoTarget: () => 'target' });
  const fields = () => [...propBody.querySelectorAll('.se-field')].map((f) => f.querySelector('label').textContent);
  const field = (label) => [...propBody.querySelectorAll('.se-field')].find((f) => f.querySelector('label').textContent === label)
    .querySelector('input, select, textarea');
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); };
  window.__props = { props, calls, propBody, fields, field, set, doc: () => doc, setSel: (s) => { sel = new Set(s); }, genLang: () => genLang,
    setLive: (l) => { live = l; } };
  return true;
};

uiTest('#405 schematic Properties: the sheet, a gate (inputs, inverted inputs, a reserved name), an I/O marker, several objects', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { props, calls, propBody, fields, field, set, doc, setSel, genLang } = window.__props;
    const r = {};
    const tick = () => new Promise((res) => setTimeout(res, 0));
    // nothing selected: the sheet's; its language, the HDL generated in it
    props.renderProps();
    r.sheet = fields();
    set(field('Language'), 'verilog');
    r.lang = [doc().lang, genLang()];
    calls.splice(0);
    // the AND2: its inputs and inverted inputs make it another gate; a reserved word refused, said
    setSel(['sym:S1']);
    props.renderProps();
    r.title = propBody.querySelector('.se-ptitle').textContent;
    r.gate = fields();
    r.inputs = [...field('Inputs').options].map((o) => o.value);
    set(field('Inputs'), '3');
    set(field('Inverted inputs'), '1');
    r.type = doc().symbols[0].type;
    set(field('Instance name'), 'signal');
    r.refused = doc().symbols[0].name;
    set(field('Instance name'), 'G1');
    r.name = doc().symbols[0].name;
    propBody.querySelector('.se-infobtn').click();
    await tick();
    r.gateCalls = calls.splice(0).map((c) => c[0] === 'flash' ? `flash ${/reserved/i.test(c[1])}` : c.map(String).join(' '));
    // an I/O marker: its width
    setSel(['port:P1']);
    props.renderProps();
    r.port = fields();
    set(field('Width'), '8');
    r.width = doc().ports[0].width;
    // several objects: their commands
    setSel(['sym:S1', 'port:P1']);
    props.renderProps();
    r.many = propBody.querySelector('.se-ptitle').textContent;
    calls.splice(0);
    for (const b of propBody.querySelectorAll('button')) b.click();
    r.manyCalls = calls.splice(0).map((c) => c[0]);
    return r;
  });
  assert.deepEqual(out.sheet.slice(0, 4), ['Module name', 'Language', 'Description', 'Sheet size']);
  assert.deepEqual(out.lang, ['verilog', 'verilog']);
  assert.equal(out.title, 'AND2');
  // (Pins per bit since #2079)
  assert.deepEqual(out.gate, ['Instance name', 'Width', 'Pins per bit (I0_0.., O0..)', 'Inputs', 'Inverted inputs']);
  assert.deepEqual(out.inputs, ['2', '3', '4']);
  assert.equal(out.type, 'and3b1');
  assert.equal(out.refused, 'U1');
  assert.equal(out.name, 'G1');
  assert.deepEqual(out.gateCalls, ['onSelect null', 'edit', 'onSelect null', 'edit', 'onSelect null', 'flash true', 'edit', 'onSelect null', 'edit',
    'onSelect null', 'openInfo target']);
  assert.deepEqual(out.port, ['Name', 'Direction', 'Width', 'HDL type']);
  assert.equal(out.width, 8);
  assert.equal(out.many, '2 objects selected');
  assert.deepEqual(out.manyCalls, ['rotateSel', 'mirrorSel', 'deleteSel']);
});

uiTest('#405 schematic Properties: a module instance opened, read-only, a live simulation, a net renamed with its names', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { props, calls, propBody, setSel, setLive } = window.__props;
    const r = {};
    // the module instance: selected, opened
    setSel(['sym:S2']);
    props.renderProps();
    r.title = propBody.querySelector('.se-ptitle').textContent;
    r.open = props.openSelected();
    setSel(['sym:S1']);
    r.notModule = props.openSelected();
    r.calls = calls.splice(0);
    // a live simulation draws its own panel
    setLive({ renderProps: (el) => { el.textContent = 'live'; } });
    props.renderProps();
    r.live = propBody.textContent;
    setLive(null);
    // a net renamed with two other names and an I/O marker: said in the status line
    props.renamed({ labels: [{}, {}, {}], ports: [{ name: 'q' }] }, 'd(7:0)');
    props.renamed({ labels: [{}], ports: [] }, 'x');
    await new Promise((res) => setTimeout(res, 0));
    r.flash = calls.splice(0).filter((c) => c[0] === 'flash').map((c) => c[1]);
    return r;
  });
  assert.equal(out.title, 'Module sub');
  assert.equal(out.open, true);
  assert.equal(out.notModule, false);
  assert.deepEqual(out.calls, [['onSelect', 'M1'], ['onOpenModule', 'sub', 'M1']]);
  assert.equal(out.live, 'live');
  assert.deepEqual(out.flash, ["Renamed to 'd' with the net: 2 other net names and the I/O marker 'q' (a port of the module)"]);
});

uiTest('#405 schematic Properties: read-only, the fields cannot be changed (Symbol Info can be opened)', E, async (page) => {
  await page.eval(MOUNT, true);
  const out = await page.eval(() => {
    const { props, propBody, setSel } = window.__props;
    setSel(['sym:S1']);
    props.renderProps();
    return [...propBody.querySelectorAll('input, select, button')].map((el) => `${el.tagName}:${el.readOnly || el.disabled ? 'ro' : 'rw'}`);
  });
  // (the gate's Pins per bit, #2079: read-only too)
  assert.deepEqual(out, ['BUTTON:rw', 'INPUT:ro', 'INPUT:ro', 'INPUT:ro', 'SELECT:ro', 'SELECT:ro']);
});

uiTest('#953 schematic Properties: the Width of a VCC and of a GND (one saved without one: empty, its net\'s); in Portuguese', E, async (page) => {
  await page.eval(MOUNT);
  const read = () => page.eval(() => {
    const { propBody } = window.__props;
    return [...propBody.querySelectorAll('.se-field')].map((f) => [f.querySelector('label').textContent, f.querySelector('input, select')?.value ?? '',
      f.querySelector('.se-note')?.textContent ?? '']);
  });
  const select = (id) => page.eval((i) => { const { props, setSel } = window.__props; setSel([`sym:${i}`]); props.renderProps(); }, id);
  const setWidth = (label, v) => page.eval((l, x) => { const { field, set } = window.__props; set(field(l), x); }, label, v);
  // the VCC: its Width, 1; 8 makes its output a bus of 8 bits
  await select('S3');
  assert.deepEqual(await read(), [['Instance name', 'V1', ''], ['Width', '1', '']]);
  await setWidth('Width', '8');
  assert.deepEqual(await page.eval(async () => {
    const { symbolPins } = await import('/core/schdoc.js');
    const s = window.__props.doc().symbols.find((x) => x.id === 'S3');
    return [s.params.width, symbolPins(s, {}).map((p) => `${p.name}:${p.width}`)];
  }), [8, ['P:8']]);
  // the GND saved without a Width: empty, said; in Portuguese
  await select('S4');
  assert.deepEqual(await read(), [['Instance name', 'G1', ''], ['Width', '', 'empty: the width of its net']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await select('S4');
    await page.waitFor(() => window.__props.propBody.querySelector('.se-note:not(.se-sum)')?.textContent === 'vazia: a largura da sua rede', [], { what: 'the PT note' });
    assert.deepEqual((await read()).map((r) => r[0]), ['Nome da instância', 'Largura']);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  // a Width given: 4, no note any more
  await select('S4');
  await setWidth('Width', '4');
  assert.deepEqual(await read(), [['Instance name', 'G1', ''], ['Width', '4', '']]);
  assert.equal(await page.eval(() => window.__props.doc().symbols.find((x) => x.id === 'S4').params.width), 4);
});

uiTest('#1471 schematic Properties: several I/O markers\' direction and width set at once (one edit), a mixed value; in Portuguese', E, async (page) => {
  await page.eval(MOUNT);
  const read = () => page.eval(() => {
    const { propBody } = window.__props;
    return [propBody.querySelector('.se-ptitle').textContent, ...[...propBody.querySelectorAll('.se-field')].map((f) => {
      const el = f.querySelector('input, select');
      return `${f.querySelector('label').textContent}=${el.value}${el.placeholder ? ` [${el.placeholder}]` : ''}${el.tagName === 'SELECT' ? ` {${[...el.options].map((o) => o.textContent).join('|')}}` : ''}`;
    })];
  });
  const select = (ids) => page.eval((i) => { const { props, setSel, calls } = window.__props; setSel(i); props.renderProps(); calls.splice(0); }, ids);
  const set = (label, v) => page.eval((l, x) => { const { field, set: s, calls } = window.__props; s(field(l), x); return calls.splice(0).filter((c) => c[0] === 'edit').length; }, label, v);
  const ports = () => page.eval(() => window.__props.doc().ports.map((p) => `${p.name}:${p.dir}:${p.width}${p.type ? `:${p.type}` : ''}`));
  // the two markers: their direction mixed, their width 1, no HDL type; no name
  await select(['port:P1', 'port:P2']);
  assert.deepEqual(await read(), ['2 objects selected', 'Direction= {(mixed)|Input|Output|Bidirectional}',
    'Width=1', 'HDL type=']);
  // a mixed field left empty: nothing changed
  assert.equal(await set('Direction', ''), 0);
  assert.deepEqual(await ports(), ['A:in:1', 'B:out:1']);
  // Bidirectional for both, in one edit; no longer mixed
  assert.equal(await set('Direction', 'inout'), 1);
  assert.deepEqual(await ports(), ['A:inout:1', 'B:inout:1']);
  assert.deepEqual(await read(), ['2 objects selected', 'Direction=inout {Input|Output|Bidirectional}', 'Width=1', 'HDL type=']);
  // one marker's HDL type: the type mixed; a width of 4 for both, in one edit
  await select(['port:P1']);
  await set('HDL type', 'std_logic_vector(3 downto 0)');
  await select(['port:P1', 'port:P2']);
  assert.deepEqual((await read()).slice(2), ['Width=1', 'HDL type= [(mixed)]']);
  assert.equal(await set('HDL type', ''), 0);
  assert.equal(await set('Width', '4'), 1);
  assert.deepEqual(await ports(), ['A:inout:4:std_logic_vector(3 downto 0)', 'B:inout:4']);
  // the commands are still there
  assert.deepEqual(await page.eval(() => [...window.__props.propBody.querySelectorAll('button')].map((b) => b.textContent)), ['Rotate', 'Mirror', 'Delete']);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await select(['port:P1', 'port:P2']);
    await page.waitFor(() => window.__props.propBody.querySelector('.se-ptitle')?.textContent === '2 objetos selecionados', [], { what: 'the PT title' });
    assert.deepEqual(await read(), ['2 objetos selecionados', 'Direção=inout {Entrada|Saída|Bidirecional}', 'Largura=4', 'Tipo HDL= [(vários)]']);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
