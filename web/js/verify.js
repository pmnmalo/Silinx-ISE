// Verify Equivalence (#3177): the Processes panel's process of a module (the Simulation view's), its equivalence with a
// reference module proved by Yosys's SAT solver in the page's Yosys worker (core/verify.js, as the MCP server's verify),
// its messages in the console; a difference: the counterexample's test bench written into the project
// (core/verify-bench.js, sim/verify_<module>) and simulated, the waveform viewer showing where the outputs differ.
// Verify Assertions: the module's own assertions proved (core/verify-assert.js), a failure's counterexample in the same
// way (the module alone, its failing assertion reported by the simulation).
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { verifyEquivalence, verifyMessages, isVerifyBench, VERIFY_DEPTH, MAX_DEPTH, VERIFY_PROCESS, VERIFY_TIME_LIMIT, MAX_TIME_LIMIT } from '/core/verify.js';
import { counterexampleBench, benchName } from '/core/verify-bench.js';
import { verifyAssertions, assertMessages, ASSERT_PROCESS } from '/core/verify-assert.js';
import { naturalCompare } from '/core/hier-order.js';
import { S, app } from './app.js';
import { log, logInfo } from './console.js';
import { inView } from './design.js';
import { saveAll, setStatus } from './processes.js';
import { runSimulation } from './viewers.js';

// the reference proposed for a module: one named after it (<m>_ref, ref_<m>, <m>_reference, <m>_golden), else the last one chosen
const REF_NAMES = m => [`${m}_ref`, `ref_${m}`, `${m}_reference`, `${m}_golden`].map(n => n.toLowerCase());
const last = {};

/** The line of a check's dialog that says what is wrong with its fields, beside them (#3540: not a toast): { el,
 *  say(message) (shown, and false) }. */
export function fieldError() {
  const el = h('div', { class: 'hint verify-error', style: { color: 'var(--error-fg)', minHeight: '16px', marginTop: '8px' } });
  return { el, say: (m) => { el.textContent = m; return false; } };
}

/**
 * The time limit's field of a check's dialog (#3261: Yosys stopped when it passes), its label and input: { row, input,
 * ok() (valid, or its error said on the dialog's line err, and false) }; the value kept for the next dialogs.
 */
export function timeLimitField(err) {
  const input = h('input', { type: 'number', min: 1, max: MAX_TIME_LIMIT, value: limits.timeLimit || VERIFY_TIME_LIMIT, style: { width: '6em' } });
  const row = h('div', {}, h('label', { style: { display: 'block', marginTop: '8px' } }, 'Time limit (s):'), input);
  const ok = () => {
    const n = +input.value;
    if (Number.isInteger(n) && n >= 1 && n <= MAX_TIME_LIMIT) { limits.timeLimit = n; return true; }
    return err.say(`The time limit is a number of seconds from 1 to ${MAX_TIME_LIMIT}`);
  };
  return { row, input, ok };
}
const limits = {};

/** The reference module, the depth and the time limit, asked: { reference, depth, timeLimit }, or null (cancelled). */
async function askReference(mod) {
  const names = [...new Set(S.modules.filter(m => m.kind !== 'package' && m.name.toLowerCase() !== mod.toLowerCase() && !isVerifyBench(S.sources.find(s => s.path === m.file)?.text)).map(m => m.name))]
    .sort(naturalCompare);   // (natural order, #3819)
  if (!names.length) { logInfo('The project has no other module to be the reference: add the reference module first'); return null; }
  const proposed = names.find(n => REF_NAMES(mod).includes(n.toLowerCase())) || (names.includes(last[mod]) ? last[mod] : names[0]);
  const sel = h('select', { style: { width: '100%' } }, ...names.map(n => h('option', { value: n, 'data-no-i18n': true, selected: n === proposed }, n)));
  const depth = h('input', { type: 'number', min: 1, max: MAX_DEPTH, value: last.depth || VERIFY_DEPTH, style: { width: '6em' } });
  const err = fieldError(), limit = timeLimitField(err);
  const r = await dialog({
    title: VERIFY_PROCESS, width: 460,
    body: h('div', { class: 'verify-dlg' },
      h('p', {}, 'Proves that the module gives the outputs of the reference module for every input sequence, or shows the first clock cycle where they differ.'),
      h('label', {}, 'Reference module:'), sel,
      h('label', { style: { display: 'block', marginTop: '8px' } }, 'Depth (clock cycles):'), depth, limit.row, err.el),
    buttons: [{ label: 'Verify', primary: true, value: true, validate: () => depthOk(depth, err) && limit.ok() },
      { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  last[mod] = sel.value;
  last.depth = +depth.value;
  return { reference: sel.value, depth: +depth.value, timeLimit: +limit.input.value };
}

// the depth's field valid, or its error said on the dialog's line err and false
export const depthOk = (depth, err) => {
  const n = +depth.value;
  if (Number.isInteger(n) && n >= 1 && n <= MAX_DEPTH) return true;
  return err.say(`The depth is a number of clock cycles from 1 to ${MAX_DEPTH}`);
};

// the depth and the time limit asked (Verify Assertions): { depth, timeLimit }, or null (cancelled)
async function askDepth() {
  const depth = h('input', { type: 'number', min: 1, max: MAX_DEPTH, value: last.depth || VERIFY_DEPTH, style: { width: '6em' } });
  const err = fieldError(), limit = timeLimitField(err);
  const r = await dialog({
    title: ASSERT_PROCESS, width: 460,
    body: h('div', { class: 'verify-dlg' },
      h('p', {}, 'Proves that the module\'s assertions hold for every input sequence, or shows the first clock cycle where one fails.'),
      h('label', {}, 'Depth (clock cycles):'), depth, limit.row, err.el),
    buttons: [{ label: 'Verify', primary: true, value: true, validate: () => depthOk(depth, err) && limit.ok() },
      { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  last.depth = +depth.value;
  return { depth: +depth.value, timeLimit: +limit.input.value };
}

/** Verify Equivalence of module `mod`: the reference asked, the check run, a counterexample simulated. */
export async function verifyProcess(mod, { reference, depth, timeLimit } = {}) {
  if (!reference) {
    const a = await askReference(mod);
    if (!a) return null;
    ({ reference, depth, timeLimit } = a);
  }
  try { return await verifyInner(mod, { reference, depth: depth ?? VERIFY_DEPTH, timeLimit }); }
  catch (e) { setStatus('verify', 'err'); log(`ERROR:Verify - ${e.message}`, 'err'); return null; }
}

/** Verify Assertions of module `mod`: the depth asked, its assertions proved, a counterexample simulated. */
export async function assertProcess(mod, { depth, timeLimit } = {}) {
  if (depth == null) { const a = await askDepth(); if (!a) return null; ({ depth, timeLimit } = a); }
  try { return await verifyInner(mod, { depth, timeLimit }); }
  catch (e) { setStatus('verify-assert', 'err'); log(`ERROR:Verify - ${e.message}`, 'err'); return null; }
}

async function verifyInner(mod, { reference = null, depth, timeLimit }) {
  const id = reference ? 'verify' : 'verify-assert';
  await saveAll();
  setStatus(id, 'running');
  const srcs = verifySources();
  // (Yosys: the page's workers, or the browser edition's own, as the emulator's compiled engine runs it)
  const run = await (await import('./emulator.js')).emulatorYosys(api.standalone);
  const r = reference ? await verifyEquivalence(srcs, { top: mod, reference, depth, timeLimit, run }) : await verifyAssertions(srcs, { top: mod, depth, timeLimit, run });
  const tb = benchName(r.top);
  const bench = r.status === 'failed' ? await writeBench(tb, `sim/${tb}.${r.lang === 'vhdl' ? 'vhd' : 'v'}`, () => counterexampleBench(r, { name: tb })) : null;
  for (const m of (reference ? verifyMessages : assertMessages)(r, { bench })) log(m.text, m.kind === 'info' ? undefined : m.kind);
  setStatus(id, r.status === 'proved' && !r.warnings.length ? 'ok' : r.status === 'proved' || r.status === 'bounded' || (r.status === 'timeout' && r.checked) ? 'warn' : 'err');
  // the counterexample replayed: the waveform viewer shows it, the console the same difference
  if (bench) await runSimulation(tb);
  return r;
}

/**
 * A counterexample's test bench `tb` written at `bench` (text(): its text), the project reloaded: its path, or null
 * when a file or a module of the user's is in its place (a warning).
 */
export async function writeBench(tb, bench, text) {
  const mine = S.sources.find(s => s.path === bench);
  const other = S.modules.find(m => m.name.toLowerCase() === tb.toLowerCase() && !isVerifyBench(S.sources.find(x => x.path === m.file)?.text));
  if ((mine && !isVerifyBench(mine.text)) || other) {
    log(`WARNING:Verify - the counterexample's test bench is not written: ${other ? `a module named '${tb}' already exists (${other.file})` : `${bench} exists and is not a test bench of Verify`}.`, 'warn');
    return null;
  }
  // (an earlier one in the other language, the MCP server's: replaced by this one)
  const twin = S.sources.find(s => s.path !== bench && s.path.replace(/\.(vhd|v)$/, '') === bench.replace(/\.(vhd|v)$/, '') && isVerifyBench(s.text));
  if (twin) await api.deleteFile(S.project.name, twin.path);
  await api.writeFile(S.project.name, bench, text());   // (registers it: a simulation source)
  await app.reloadProject();
  return bench;
}

/** The sources Verify reads: the simulation view's (a reference may be a simulation-only one), but its test benches. */
export const verifySources = () => S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, true) && !isVerifyBench(s.text));
