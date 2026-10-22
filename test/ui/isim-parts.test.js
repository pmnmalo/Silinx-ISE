// UI: the parts of ISim's window (#405: out of mountISim in web/js/isim.js), the window mounted in the page on a design
// of its own: the toolbar (isim-toolbar.js: its buttons, a run for the time typed in, Break disabled while no run goes
// on, a marker, the cursor moved, the zooms, Save and Load Wave Configuration, #1019), the view (isim-view.js: the zoom about the cursor, the
// fit), the status bar (isim-status.js: the simulated time, the cursor, the marker's delta), the public API
// (isim-api.js: the state saved and restored, restart; the wave configuration, isim-wcfg.js) and the theme's colours (isim-colors.js: the wave window's
// background drawn in the theme's colour).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end tb;
architecture sim of tb is
  signal clk : std_logic := '0';
  signal q : unsigned(3 downto 0) := (others => '0');
begin
  clk <= not clk after 5 ns;
  process (clk) begin if rising_edge(clk) then q <= q + 1; end if; end process;
end sim;
`;

uiTest('#405 ISim window parts: the toolbar, the view, the status, the API, the colours', E, async (page) => {
  const out = await page.eval(async (text) => {
    const { compile, elaborate } = await import('/core/compile.js');
    const { Simulator } = await import('/core/simulator.js');
    const { mountISim } = await import('/js/isim.js');
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 600px; z-index: 9999; background: white; display: flex';
    document.body.append(host);
    const design = elaborate(compile([{ path: 'tb.vhd', lang: 'vhdl', text }]), 'tb');
    const sim = new Simulator(design);
    // the wave configuration's file: what Save hands over, what Load gives (the app's: web/js/sim-wcfg.js)
    const files = { saved: null, toLoad: null };
    const wcfg = { save: async (t) => { files.saved = t; return 'tb.wcfg'; }, load: async () => files.toLoad };
    const isim = mountISim(host, { design, sim, title: 'tb', wcfg });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(100);
    const $ = (s) => host.querySelector(s);
    const btn = (title) => [...host.querySelectorAll('.isim-toolbar .tb-btn')].find((b) => b.title === title);
    const r = {};
    r.buttons = [...host.querySelectorAll('.isim-toolbar .tb-btn')].map((b) => b.title);
    r.runTime = [$('.isim-rf-val').value, $('.isim-rf-unit').value, btn('Break').disabled];
    // a run for 100 ns, typed in
    $('.isim-rf-val').value = '100'; $('.isim-rf-unit').value = 'ns';
    $('.isim-rf-val').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 50 && sim.now < 100000; i++) await wait(20);
    await wait(100);
    r.afterRun = [sim.now, $('.isim-st-time').textContent, $('.isim-cursor-info').textContent];
    // the cursor to time 0, a marker there, the cursor to the latest time: the delta
    btn('Go to Time 0').click();
    btn('Add Marker at cursor').click();
    btn('Go to Latest Time').click();
    await wait(50);
    r.marker = [isim.state.markers.map((m) => m.t), isim.state.cursor, $('.isim-st-delta').textContent];
    // the zooms
    btn('Zoom to Full View').click();
    const fit = [isim.state.fit, isim.state.scale];
    btn('Zoom In').click();
    r.zoom = [fit[0], isim.state.fit, isim.state.scale / fit[1]];
    // the state saved and restored
    const s = isim.getState();
    r.state = [s.rows.map((x) => x.path), s.runTime, s.markers, s.cursor];
    isim.setState({ ...s, runTime: { value: '7', unit: 'ps' }, cursor: 20000, markers: [5000, 15000] });
    await wait(50);
    r.restored = [$('.isim-rf-val').value, $('.isim-rf-unit').value, isim.state.cursor, isim.state.markers.map((m) => m.t)];
    // the colours: the theme's wave background changed, read again (refresh): the wave window drawn in it (sampled down
    // its middle: a marker's or the cursor's line may cross one sample)
    const cw = $('.isim-waves');
    const samples = () => [0.1, 0.3, 0.5, 0.7, 0.9, 0.98].map((f) => [...cw.getContext('2d').getImageData(Math.floor(cw.width / 2), Math.floor(cw.height * f), 1, 1).data.slice(0, 3)]);
    isim.redraw();
    const before = samples();
    $('.isim').style.setProperty('--wave-bg', '#2040c0');
    isim.refresh(); isim.redraw();
    r.bg = [before, samples()];
    // restart
    isim.restart();
    await wait(50);
    r.restart = [sim.now, $('.isim-st-time').textContent];
    // the wave configuration (#1019): a divider, a group, a radix, markers; saved, the window changed, loaded back
    isim.setState({ rows: [{ kind: 'div', name: 'Clock' }, { kind: 'sig', path: 'tb.clk' }, { kind: 'group', name: 'Count', expanded: true },
      { kind: 'sig', path: 'tb.q', radix: 'udec', group: 2 }], markers: [10000, 30000] });
    const rows = () => isim.state.rows.map((x) => [x.kind, x.name, x.radix ?? null, x.group != null ? isim.state.rows.find((g) => g.id === x.group).name : null]);
    r.cfgRows = rows();
    btn('Save Wave Configuration').click();
    await wait(50);
    r.saved = files.saved;
    isim.setState({ rows: [{ kind: 'sig', path: 'tb.q' }], markers: [] });
    files.toLoad = { name: 'tb.wcfg', text: files.saved };
    btn('Load Wave Configuration').click();
    await wait(50);
    r.loaded = [rows(), isim.state.markers.map((m) => m.t), isim.state.activeMarker?.t];
    // a configuration with a signal the design does not have: said, left out; one that is not a configuration: an error
    files.toLoad = { name: 'other.wcfg', text: files.saved.replace('/tb/clk', '/tb/gone') };
    btn('Load Wave Configuration').click();
    await wait(50);
    r.other = rows();
    files.toLoad = { name: 'bad.wcfg', text: '{}' };
    btn('Load Wave Configuration').click();
    await wait(50);
    r.bad = rows();
    r.cfgLog = [...$('.isim-console').children].map((l) => [l.className.replace('isim-ln ', ''), l.textContent]).slice(-5);
    isim.destroy(); host.remove();
    return r;
  }, VHDL);
  assert.deepEqual(out.buttons, ['Restart', 'Run All', 'Run for the specified time', 'Step (advance to the next scheduled event)', 'Break', 'Zoom In',
    'Zoom Out', 'Zoom to Full View', 'Go to Time 0', 'Go to Latest Time', 'Previous Transition (selected signal)', 'Next Transition (selected signal)',
    'Add Marker at cursor', 'Radix of selected signals', 'Save Wave Configuration', 'Load Wave Configuration']);
  assert.deepEqual(out.runTime, ['1', 'us', true]);
  assert.deepEqual(out.afterRun, [100000, 'Sim Time: 100,000 ps', 'Cursor: 100 ns']);
  assert.deepEqual(out.marker, [[0], 100000, 'Marker: 0 ns   Δ = 100 ns']);
  assert.deepEqual(out.zoom, [true, false, 0.5]);
  assert.deepEqual(out.state, [['tb.clk', 'tb.q'], { value: '100', unit: 'ns' }, [0], 100000]);
  assert.deepEqual(out.restored, ['7', 'ps', 20000, [5000, 15000]]);
  // (the theme's #2040c0 under the window's faint shading: most samples; none before)
  const blue = ([r0, g0, b0]) => Math.abs(r0 - 0x20) <= 16 && Math.abs(g0 - 0x40) <= 16 && Math.abs(b0 - 0xc0) <= 16;
  assert.equal(out.bg[0].filter(blue).length, 0, JSON.stringify(out.bg[0]));
  assert.ok(out.bg[1].filter(blue).length >= 4, JSON.stringify(out.bg[1]));
  assert.deepEqual(out.restart, [0, 'Sim Time: 0 ps']);
  // the wave configuration: saved as ISim's .wcfg, loaded back the same
  const cfg = [['div', 'Clock', null, null], ['sig', 'clk', 'default', null], ['group', 'Count', null, null], ['sig', 'q', 'udec', 'Count']];
  assert.deepEqual(out.cfgRows, cfg);
  assert.match(out.saved, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<wave_config>/);
  assert.match(out.saved, /<top_module name="tb" \/>/);
  assert.match(out.saved, /<wvobject fp_name="\/tb\/q" type="array">[\s\S]*?<obj_property name="Radix">UNSIGNEDDECRADIX<\/obj_property>/);
  assert.match(out.saved, /<marker time="10000" label="" \/>\n {6}<marker time="30000" label="" \/>/);
  assert.deepEqual(out.loaded, [cfg, [10000, 30000], 30000]);
  assert.deepEqual(out.other, cfg.filter(([, n]) => n !== 'clk'));
  assert.deepEqual(out.bad, out.other, 'not a configuration: the window as it was');
  assert.deepEqual(out.cfgLog, [
    ['k-info', 'Wave configuration saved to tb.wcfg'],
    ['k-info', 'Wave configuration tb.wcfg loaded: 2 signals, 2 markers'],
    ['k-warning', 'WARNING: /tb/gone is not a signal of this design: not shown'],
    ['k-info', 'Wave configuration other.wcfg loaded: 1 signal, 2 markers'],
    ['k-error', 'ERROR: the wave configuration was not loaded: not a wave configuration (no <wave_config>)'],
  ]);
});

uiTest('#1019 ISim without a project (no opts.wcfg): no Save nor Load Wave Configuration, no VCD export', E, async (page) => {
  const titles = await page.eval(async (text) => {
    const { compile, elaborate } = await import('/core/compile.js');
    const { Simulator } = await import('/core/simulator.js');
    const { mountISim } = await import('/js/isim.js');
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 600px; display: flex';
    document.body.append(host);
    const design = elaborate(compile([{ path: 'tb.vhd', lang: 'vhdl', text }]), 'tb');
    const isim = mountISim(host, { design, sim: new Simulator(design), title: 'tb' });
    const out = [...host.querySelectorAll('.isim-toolbar .tb-btn')].map((b) => b.title);
    isim.destroy(); host.remove();
    return out;
  }, VHDL);
  assert.equal(titles.at(-1), 'Radix of selected signals');
  assert.ok(!titles.some((x) => /Wave Configuration|VCD/.test(x)), titles.join(', '));
});
