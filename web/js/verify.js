// Verify Equivalence (#3177): the Processes panel's process of a module (the Simulation view's), its equivalence with a
// reference module proved by Yosys's SAT solver in the page's Yosys worker (core/verify.js, as the MCP server's verify),
// its messages in the console; a difference: the counterexample's test bench written into the project
// (core/verify-bench.js, sim/verify_<module>) and simulated, the waveform viewer showing where the outputs differ.
// Verify Assertions: the module's own assertions proved (core/verify-assert.js), a failure's counterexample in the same
// way (the module alone, its failing assertion reported by the simulation).
import { api } from './api.js';
import { h, dialog, toast } from './ui.js';
import { verifyEquivalence, verifyMessages, isVerifyBench, VERIFY_DEPTH, MAX_DEPTH, VERIFY_PROCESS } from '/core/verify.js';
import { counterexampleBench, benchName } from '/core/verify-bench.js';
import { verifyAssertions, assertMessages, ASSERT_PROCESS } from '/core/verify-assert.js';
import { S, app } from './app.js';
import { log } from './console.js';
import { inView } from './design.js';
import { saveAll, setStatus } from './processes.js';
import { runSimulation } from './viewers.js';

// the reference proposed for a module: one named after it (<m>_ref, ref_<m>, <m>_reference, <m>_golden), else the last one chosen
const REF_NAMES = m => [`${m}_ref`, `ref_${m}`, `${m}_reference`, `${m}_golden`].map(n => n.toLowerCase());
const last = {};

/** The reference module and the depth, asked: { reference, depth }, or null (cancelled). */
async function askReference(mod) {
  const names = [...new Set(S.modules.filter(m => m.kind !== 'package' && m.name.toLowerCase() !== mod.toLowerCase() && !isVerifyBench(S.sources.find(s => s.path === m.file)?.text)).map(m => m.name))]
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) { toast('The project has no other module to be the reference: add the reference module first', 'info'); return null; }
  const proposed = names.find(n => REF_NAMES(mod).includes(n.toLowerCase())) || (names.includes(last[mod]) ? last[mod] : names[0]);
  const sel = h('select', { style: { width: '100%' } }, ...names.map(n => h('option', { value: n, 'data-no-i18n': true, selected: n === proposed }, n)));
  const depth = h('input', { type: 'number', min: 1, max: MAX_DEPTH, value: last.depth || VERIFY_DEPTH, style: { width: '6em' } });
  const r = await dialog({
    title: VERIFY_PROCESS, width: 460,
    body: h('div', { class: 'verify-dlg' },
      h('p', {}, 'Proves that the module gives the outputs of the reference module for every input sequence, or shows the first clock cycle where they differ.'),
      h('label', {}, 'Reference module:'), sel,
      h('label', { style: { display: 'block', marginTop: '8px' } }, 'Depth (clock cycles):'), depth),
    buttons: [{ label: 'Verify', primary: true, value: true, validate: () => { const n = +depth.value; if (Number.isInteger(n) && n >= 1 && n <= MAX_DEPTH) return true; toast(`The depth is a number of clock cycles from 1 to ${MAX_DEPTH}`, 'err'); return false; } },
      { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  last[mod] = sel.value;
  last.depth = +depth.value;
  return { reference: sel.value, depth: +depth.value };
}

// the depth asked (Verify Assertions): a number, or null (cancelled)
async function askDepth() {
  const depth = h('input', { type: 'number', min: 1, max: MAX_DEPTH, value: last.depth || VERIFY_DEPTH, style: { width: '6em' } });
  const r = await dialog({
    title: ASSERT_PROCESS, width: 460,
    body: h('div', { class: 'verify-dlg' },
      h('p', {}, 'Proves that the module\'s assertions hold for every input sequence, or shows the first clock cycle where one fails.'),
      h('label', {}, 'Depth (clock cycles):'), depth),
    buttons: [{ label: 'Verify', primary: true, value: true, validate: () => { const n = +depth.value; if (Number.isInteger(n) && n >= 1 && n <= MAX_DEPTH) return true; toast(`The depth is a number of clock cycles from 1 to ${MAX_DEPTH}`, 'err'); return false; } },
      { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  last.depth = +depth.value;
  return +depth.value;
}

/** Verify Equivalence of module `mod`: the reference asked, the check run, a counterexample simulated. */
export async function verifyProcess(mod, { reference, depth } = {}) {
  if (!reference) {
    const a = await askReference(mod);
    if (!a) return null;
    ({ reference, depth } = a);
  }
  try { return await verifyInner(mod, { reference, depth: depth ?? VERIFY_DEPTH }); }
  catch (e) { setStatus('verify', 'err'); log(`ERROR:Verify - ${e.message}`, 'err'); return null; }
}

/** Verify Assertions of module `mod`: the depth asked, its assertions proved, a counterexample simulated. */
export async function assertProcess(mod, { depth } = {}) {
  if (depth == null) { depth = await askDepth(); if (depth == null) return null; }
  try { return await verifyInner(mod, { depth }); }
  catch (e) { setStatus('verify-assert', 'err'); log(`ERROR:Verify - ${e.message}`, 'err'); return null; }
}

async function verifyInner(mod, { reference = null, depth }) {
  const id = reference ? 'verify' : 'verify-assert';
  await saveAll();
  setStatus(id, 'running');
  // the simulation view's sources (the reference may be a simulation-only one), but a counterexample's test bench
  const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, true) && !isVerifyBench(s.text));
  // (Yosys: the page's workers, or the browser edition's own, as the emulator's compiled engine runs it)
  const run = await (await import('./emulator.js')).emulatorYosys(api.standalone);
  const r = reference ? await verifyEquivalence(srcs, { top: mod, reference, depth, run }) : await verifyAssertions(srcs, { top: mod, depth, run });
  let bench = null;
  if (r.status === 'failed') {
    const tb = benchName(r.top);
    bench = `sim/${tb}.${r.lang === 'vhdl' ? 'vhd' : 'v'}`;
    const mine = S.sources.find(s => s.path === bench);
    const other = S.modules.find(m => m.name.toLowerCase() === tb.toLowerCase() && !isVerifyBench(S.sources.find(x => x.path === m.file)?.text));
    if ((mine && !isVerifyBench(mine.text)) || other) {
      log(`WARNING:Verify - the counterexample's test bench is not written: ${other ? `a module named '${tb}' already exists (${other.file})` : `${bench} exists and is not a test bench of Verify`}.`, 'warn');
      bench = null;
    } else {
      // (an earlier one in the other language, the MCP server's: replaced by this one)
      const twin = S.sources.find(s => s.path === `sim/${tb}.${r.lang === 'vhdl' ? 'v' : 'vhd'}` && isVerifyBench(s.text));
      if (twin) await api.deleteFile(S.project.name, twin.path);
      await api.writeFile(S.project.name, bench, counterexampleBench(r, { name: tb }));   // (registers it: a simulation source)
      await app.reloadProject();
    }
  }
  for (const m of (reference ? verifyMessages : assertMessages)(r, { bench })) log(m.text, m.kind === 'info' ? undefined : m.kind);
  setStatus(id, r.status === 'proved' && !r.warnings.length ? 'ok' : r.status === 'proved' || r.status === 'bounded' ? 'warn' : 'err');
  // the counterexample replayed: the waveform viewer shows it, the console the same difference
  if (bench) await runSimulation(benchName(r.top));
  return r;
}
