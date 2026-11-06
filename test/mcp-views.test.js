// The MCP server's related views (#2834, server/mcp-views.js): related_view makes, read-only and writing nothing, the
// views the interface shows beside a source: an HDL source's translation (traffic's VHDL to Verilog, pong's Verilog to
// VHDL), a state diagram's ASM chart (traffic's), a truth table's schematic (traffic's lamps), a Petri net's state machine,
// each the same as the core's converters make; a truth table's results, as the editor's results panel (#2927); an ASM chart that is not a plain state machine, a state diagram with errors
// and the wrong kinds of source refused, each with its reason.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { translateSource } from '../core/translate.js';
import { fsmToAsm, normalizeFsm } from '../core/fsm.js';
import { schematicFromTable, normalizeTable, newTable, canonicalAsts, formatExpr } from '../core/logic.js';
import { newPetri } from '../core/petri.js';
import { petriToFsm } from '../core/petri-fsm.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (args) => { const r = await call('related_view', args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (args, message) => { const r = await call('related_view', args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `related_view: ${message}`); };
const read = (project, f) => fs.readFileSync(path.join(P.projectDir(project), f), 'utf8');
const files = (project) => fs.readdirSync(P.projectDir(project), { recursive: true }).sort();

before(async () => { tmp = await scratchEnv('silinx-mcp-views-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('related_view: traffic\'s translation, ASM chart and table\'s schematic, as the core makes them, nothing written', async () => {
  await call('new_project_from_example', { name: 't', example: 'traffic' });
  const before = files('t');
  const hdl = await P.readSources('t');
  const sources = hdl.filter((s) => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  // the generated HDL in Verilog
  const tr = await ok({ project: 't', path: 'src/traffic.vhd', view: 'translation' });
  const want = translateSource(read('t', 'src/traffic.vhd'), { path: 'src/traffic.vhd', to: 'verilog', sources });
  assert.equal(want.ok, true);
  assert.equal(tr.text, want.text);
  assert.match(tr.text, /^module traffic/m);
  assert.deepEqual({ ...tr.data, text: undefined }, { project: 't', path: 'src/traffic.vhd', view: 'translation', lang: 'verilog', name: 'traffic.v', text: undefined });
  // the state diagram's ASM chart
  const asm = await ok({ project: 't', path: 'src/traffic.fsm.json', view: 'asm' });
  assert.deepEqual(asm.data.model, fsmToAsm(normalizeFsm(JSON.parse(read('t', 'src/traffic.fsm.json')))));
  assert.equal(asm.text, JSON.stringify(asm.data.model, null, 2));
  assert.ok(asm.data.model.nodes.filter((n) => n.type === 'state').length > 1);
  // the truth table's schematic
  const sch = await ok({ project: 't', path: 'src/lamps.bool.json', view: 'schematic' });
  assert.deepEqual(sch.data.model, schematicFromTable(normalizeTable(JSON.parse(read('t', 'src/lamps.bool.json')))));
  assert.deepEqual(files('t'), before);
});

test('related_view: a Verilog source in VHDL; a Petri net\'s state machine', async () => {
  await call('new_project_from_example', { name: 'p', example: 'pong' });
  const tr = await ok({ project: 'p', path: 'src/sevenseg.v', view: 'translation' });
  assert.equal(tr.data.lang, 'vhdl');
  assert.equal(tr.data.name, 'sevenseg.vhd');
  assert.match(tr.text, /^entity sevenseg is/m);
  const net = newPetri('ctl', 'vhdl');
  await call('write_file', { project: 'p', path: 'src/ctl.pn.json', text: JSON.stringify(net, null, 2) });
  const fsm = await ok({ project: 'p', path: 'src/ctl.pn.json', view: 'fsm' });
  const want = petriToFsm(net);
  assert.deepEqual([fsm.data.model, fsm.data.states, fsm.data.truncated], [want.fsm, want.states, !!want.truncated]);
});

test('related_view: a truth table\'s results, as its editor shows them: the canonical SOP and POS first, then their lists (#2927)', async () => {
  await call('new_project', { name: 'q' });
  await call('write_file', { project: 'q', path: 'src/m.bool.json', text: JSON.stringify({ ...newTable('m', ['a', 'b', 'c'], ['f', 'z']), table: { f: '01X10X10', z: '00000000' } }) });
  const before = files('q');
  const r = await ok({ project: 'q', path: 'src/m.bool.json', view: 'results', notation: 'textbook' });
  assert.equal(r.text, `Canonical SOP: f = a'·b'·c + a'·b·c + a·b·c'
Canonical POS: f = (a + b + c)·(a' + b + c)·(a' + b' + c')
Minterm and maxterm lists: f = Σm(1, 3, 6) + d(2, 5); f = ΠM(0, 4, 7) · D(2, 5)
Minimal SOP: f = a'·c + b·c'   (2 term(s), 4 literal(s))
Minimal POS: f = (b + c)·(a' + c')   (2 term(s), 4 literal(s))
XOR form: f = c ⊕ a·b
NAND form: f = ((a'·c)'·(b·c')')'
NOR form: f = ((b + c)' + (a' + c')')'
Least number of gates: XOR form: f = c ⊕ a·b
Least delay: XOR form: f = c ⊕ a·b

Canonical SOP: z = 0
Canonical POS: z = (a + b + c)·(a + b + c')·(a + b' + c)·(a + b' + c')·(a' + b + c)·(a' + b + c')·(a' + b' + c)·(a' + b' + c')
Minterm and maxterm lists: z = Σm(); z = ΠM(0, 1, 2, 3, 4, 5, 6, 7)
Minimal SOP: z = 0   (0 term(s), 0 literal(s))
Minimal POS: z = 0   (1 term(s), 0 literal(s))
NAND form: z = 0
NOR form: z = 0
Least number of gates: Minimal SOP: z = 0
Least delay: Minimal SOP: z = 0`);
  assert.deepEqual([r.data.view, r.data.notation, r.data.inputs, r.data.outputs.map(o => o.output)], ['results', 'textbook', ['a', 'b', 'c'], ['f', 'z']]);
  // the editor's default notation, the core's canonical forms
  const s = await ok({ project: 'q', path: 'src/m.bool.json', view: 'results' });
  assert.equal(s.data.notation, 'slash');
  assert.equal(s.data.outputs[0].canonicalSop, `f = ${formatExpr(canonicalAsts('01X10X10', ['a', 'b', 'c']).sop, 'slash')}`);
  assert.equal(s.data.outputs[0].canonicalPos, 'f = (a + b + c).(/a + b + c).(/a + /b + /c)');
  assert.deepEqual(files('q'), before);
  await fails({ project: 'q', path: 'src/m.bool.json', view: 'results', notation: 'latex' }, 'notation: slash, slash-compact, textbook, compact, ascii, vhdl, verilog');
});

test('related_view refuses: an ASM chart that is not a plain state machine, a state diagram with errors, the wrong kind of source, a file not there', async () => {
  await call('new_project_from_example', { name: 'b', example: 'blinky' });
  await fails({ project: 'b', path: 'src/speed_ctrl.asm.json', view: 'fsm' }, 'speed_ctrl.asm.json cannot be shown as a state diagram: it is not a plain state machine: it has internal registers (cnt_f, deb_f, cnt_s, deb_s, level, ticks); it has generics/parameters (DEBOUNCE); it has registered outputs (step); it synchronises inputs; it has logic that runs on every cycle besides the states');
  await call('write_file', { project: 'b', path: 'src/empty.fsm.json', text: JSON.stringify({ name: 'empty', states: [], transitions: [], inputs: [], outputs: [] }) });
  const r = await call('related_view', { project: 'b', path: 'src/empty.fsm.json', view: 'asm' });
  assert.equal(r.isError, true);
  assert.match(r.text, /^related_view: the ASM chart of empty\.fsm\.json: /);
  await fails({ project: 'b', path: 'src/top.vhd', view: 'asm' }, 'src/top.vhd: a state diagram (.fsm.json) has an ASM chart');
  await fails({ project: 'b', path: 'src/top.vhd', view: 'schematic' }, 'src/top.vhd: a truth table (.bool.json, .tt.json) has a schematic');
  await fails({ project: 'b', path: 'src/top.vhd', view: 'results' }, 'src/top.vhd: a truth table (.bool.json, .tt.json) has results');
  await fails({ project: 'b', path: 'src/top.vhd', view: 'fsm' }, 'src/top.vhd: an ASM chart (.asm.json) or a Petri net (.pn.json) has a state diagram');
  await fails({ project: 'b', path: 'src/speed_ctrl.asm.json', view: 'translation' }, 'src/speed_ctrl.asm.json: an HDL source (.vhd, .v) is translated');
  await fails({ project: 'b', path: 'src/none.vhd', view: 'translation' }, 'no file \'src/none.vhd\' in the project \'b\'');
});
