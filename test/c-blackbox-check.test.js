// Silinx HLS (#2995): a C source whose RTL blackbox (syn.blackbox, #1903) is refused: Check Syntax of the C checks the
// descriptions of the blackboxes it calls as its synthesis does (core/c-blackbox.js blackboxChecks), each message in its
// description; the HDL a C source cannot make, its errors each in its own file (core/view-hdl.js), as the Design pane and
// the Console say them. #3022: a C source that does not declare a blackbox's function made without it; a description no
// C source declares, a warning of the project. The errors and the warnings exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkC } from '../core/c-check.js';
import { blackboxChecks, blackboxesIn, undeclaredBlackboxes } from '../core/c-blackbox.js';
import { viewHdl } from '../core/view-hdl.js';
import { cToHdl } from '../core/c-hdl.js';
import { MSUM_V, MSUM_C, MDESC, EXT, H } from './hls-blackbox-ports-lib.mjs';

const OTHER = 'int f(int a) { return a + 1; }\n';
const project = (over = {}) => ({ 'src/top.cpp': EXT, 'src/msum.json': JSON.stringify(MDESC(), null, 2), 'src/msum.v': MSUM_V, 'src/msum.cpp': MSUM_C, 'src/other.c': OTHER, ...over });
const hlsOf = (files) => blackboxesIn(Object.keys(files), async (f) => files[f]);
const said = (ds) => ds.map((d) => `${d.severity} ${d.file}:${d.line} ${d.message}`);
const check = (files, f) => { const r = checkC(files[f], f); assert.deepEqual(said(r.diagnostics), [], f); return r; };
const RENAMED = { 'src/msum.v': MSUM_V.split('m_q0').join('m_qq') };
const NO_PORT = "error src/msum.json:1 syn.blackbox: msum.json: the argument 'm': the module 'msum' has no port 'm_q0'";
const UNCONNECTED = "warning src/msum.json:1 syn.blackbox: msum.json: the input 'm_qq' of 'msum' is not in the description: left unconnected";

test('#2995 blackboxChecks: the descriptions of the blackboxes a C source calls, as its synthesis checks them; no message when they fit', async () => {
  const files = project();
  assert.deepEqual(said(blackboxChecks(check(files, 'src/top.cpp'), await hlsOf(files))), []);
  // (the synthesis makes it)
  assert.equal(cToHdl(EXT, { file: 'src/top.cpp', ...(await hlsOf(files)) }).ok, true);
});

test('#2995 blackboxChecks: a port the module no longer has, its error (and its new input\'s warning) in the description, the synthesis\'s', async () => {
  const files = project(RENAMED), hls = await hlsOf(files);
  assert.deepEqual(said(blackboxChecks(check(files, 'src/top.cpp'), hls)), [NO_PORT, UNCONNECTED]);
  assert.deepEqual(said(cToHdl(EXT, { file: 'src/top.cpp', ...hls }).diagnostics), [NO_PORT, UNCONNECTED]);
});

test('#2995 blackboxChecks: a width that differs, a module not found, a description that does not parse: each refused as the synthesis refuses it', async () => {
  const cases = [
    [{ 'src/msum.v': MSUM_V.replace('input [9:0] m_q0', 'input [7:0] m_q0') }, ["error src/msum.json:1 syn.blackbox: msum.json: the argument 'm': the port 'm_q0' has 8 bit(s), the C type 10"]],
    [{ 'src/msum.v': MSUM_V.replace('module msum(', 'module msum2(') }, ["error src/msum.json:1 syn.blackbox: msum.json: the RTL files do not define the module 'msum'"]],
  ];
  for (const [over, want] of cases) {
    const files = project(over), hls = await hlsOf(files);
    assert.deepEqual(said(blackboxChecks(check(files, 'src/top.cpp'), hls)), want);
    assert.deepEqual(said(cToHdl(EXT, { file: 'src/top.cpp', ...hls }).diagnostics.filter((d) => d.severity === 'error')), want);
  }
});

test('#2995 blackboxChecks: a C source that calls no blackbox, and a blackbox\'s C model (its function the top): none checked, no message', async () => {
  const files = project(RENAMED), hls = await hlsOf(files);
  assert.deepEqual(said(blackboxChecks(check(files, 'src/other.c'), hls)), []);
  assert.deepEqual(said(blackboxChecks(check(files, 'src/msum.cpp'), hls)), []);
  assert.deepEqual(blackboxChecks(check(files, 'src/top.cpp'), {}), []);
});

test('#2995 viewHdl: a C source whose blackbox is refused: no HDL, its module named, its errors each in its own file', async () => {
  const files = project(RENAMED), hls = await hlsOf(files);
  const r = viewHdl('src/top.cpp', EXT, { hls });
  assert.deepEqual([r.text, r.module, r.errors], ['', 'top', ["src/top.cpp: line 1: syn.blackbox: msum.json: the argument 'm': the module 'msum' has no port 'm_q0'"]]);
  assert.deepEqual(said(r.diagnostics), [NO_PORT]);
  // (a C error: in the C source)
  const bad = viewHdl('src/top.cpp', EXT.replace('data_t t;', 'data_t t'), { hls });
  assert.equal(bad.text, '');
  assert.deepEqual([...new Set(bad.diagnostics.map((d) => d.file))], ['src/top.cpp']);
  // (made: its HDL, no error)
  const good = viewHdl('src/top.cpp', EXT, { hls: await hlsOf(project()) });
  assert.deepEqual([good.module, good.errors, good.diagnostics, /entity top is/.test(good.text)], ['top', [], [], true]);
});

const UNDECLARED = "warning src/msum.json:1 syn.blackbox: msum.json: the function 'msum' is not declared in the C sources: not used";
const cOf = (files, skip = []) => Object.fromEntries(Object.entries(files).filter(([p]) => /\.(c|cpp)$/.test(p) && !skip.includes(p)));

test('#3022 a C source that does not declare the blackbox\'s function: made, no message, also when the description is refused; one that declares it, refused', async () => {
  for (const over of [{}, RENAMED, { 'src/msum.json': '{ "c_function_name": "msum", "rtl_top_module_name": "msum" }' }]) {
    const files = project(over), hls = await hlsOf(files);
    const g = cToHdl(OTHER, { file: 'src/other.c', ...hls });
    assert.deepEqual([g.ok, said(g.diagnostics)], [true, []]);
    const v = viewHdl('src/other.c', OTHER, { hls });
    assert.deepEqual([v.module, v.errors, v.diagnostics, /entity f is/.test(v.text)], ['f', [], [], true]);
  }
  // (a prototype of msum, never called: its description checked, refused)
  const files = project(RENAMED), hls = await hlsOf(files);
  assert.deepEqual(said(cToHdl(`${H}void msum(data_t m[8], data_t &z);\n${OTHER}`, { file: 'src/other.cpp', top: 'f', ...hls }).diagnostics), [NO_PORT, UNCONNECTED]);
});

test('#3022 undeclaredBlackboxes: a description no C source of the design declares, a warning; its C model not counted; none when one declares it or with no blackbox', async () => {
  const files = project(), hls = await hlsOf(files);
  assert.deepEqual(said(undeclaredBlackboxes(hls, cOf(files))), []);
  assert.deepEqual(said(undeclaredBlackboxes(hls, cOf(files, ['src/top.cpp']))), [UNDECLARED]);
  assert.deepEqual(said(undeclaredBlackboxes(hls, {})), [UNDECLARED]);
  // (a C source with an error still declares it)
  assert.deepEqual(said(undeclaredBlackboxes(hls, { 'src/top.cpp': EXT.replace('data_t t;', 'data_t t') })), []);
  assert.deepEqual(undeclaredBlackboxes(null, cOf(files)), []);
  assert.deepEqual(undeclaredBlackboxes(await hlsOf({ 'src/other.c': OTHER }) ?? {}, { 'src/other.c': OTHER }), []);
});
