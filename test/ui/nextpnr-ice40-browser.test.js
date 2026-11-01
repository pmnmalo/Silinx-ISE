// UI: the iCE40's nextpnr in the published editions, from its tarball (#2444): the real bundle run from its files in memory under
// the page's Content-Security-Policy, nextpnr and icepack to a .bin; a tarball downloaded once and kept in Cache Storage, a wrong
// SHA-512 refused; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest } from './harness.js';
import { yosysNode } from '../../packages/silinx-fpga/src/node.js';
import { fakeTgz } from '../helpers-fake-tgz.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const GEN = new URL('../../node_modules/@yowasp/nextpnr-ice40/gen/', import.meta.url);

uiTest('#2444 the real bundle from its files in memory: nextpnr-ice40 and icepack to a bitstream', E, async (page) => {
  const out = await yosysNode(['-q', '-p', 'read_verilog b.v; synth_ice40 -top b -json b.json'], { 'b.v': 'module b(input clk, output reg led); always @(posedge clk) led <= !led; endmodule\n' }, () => {});
  const json = typeof out['b.json'] === 'string' ? out['b.json'] : new TextDecoder().decode(out['b.json']);
  const names = fs.readdirSync(GEN);
  const r = await page.eval(async (netlist, names) => {
    const { ice40FromFiles } = await import('/js/nextpnr-ice40-browser.js');
    const { ice40Io } = await import('/packages/silinx-fpga/src/index.js');
    const files = {};
    await Promise.all(names.map(async n => { files[`gen/${n}`] = new Uint8Array(await (await fetch(`/vendor/nextpnr-ice40/gen/${n}`)).arrayBuffer()); }));
    const io = ice40Io(() => ice40FromFiles(files));
    const placed = await io.run(['--up5k', '--package', 'sg48', '--json', 'b.json', '--pcf', 'b.pcf', '--asc', 'b.asc'], { 'b.json': netlist, 'b.pcf': 'set_io clk 35\nset_io led 11\n' }, () => {});
    const asc = new TextDecoder().decode(placed['b.asc']);
    return { size: (await io.pack(asc)).length };
  }, json, names);
  assert.equal(r.size, 104090);
});

uiTest('#2444 a tarball downloaded once, kept by the browser; another version replaces it; a wrong SHA-512 is refused and not kept', E, async (page) => {
  const bundle = 'var runNextpnrIce40 = async () => (await (await fetch(new URL("./data.bin", import.meta.url))).text());\nvar other = 1;\nexport {\n  runNextpnrIce40,\n  other as renamed\n};\n';
  const a = fakeTgz({ 'gen/bundle.js': bundle, 'gen/data.bin': 'the data' }), b = fakeTgz({ 'gen/bundle.js': bundle, 'gen/data.bin': 'other' });
  const b64 = x => Buffer.from(x.bytes).toString('base64');
  const r = await page.eval(async (a, b, integrityA, integrityB) => {
    const { ice40FromTarball, ICE40_CACHE } = await import('/js/nextpnr-ice40-browser.js');
    await caches.delete(ICE40_CACHE);
    const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    let calls = 0;
    const log = [];
    const opts = data => ({ log: l => log.push(l), fetchFn: async () => { calls++; return new Response(bytes(data)); } });
    const A = { url: 'https://registry.test/a.tgz', integrity: integrityA }, B = { url: 'https://registry.test/b.tgz', integrity: integrityB };
    const m = await ice40FromTarball(A, opts(a));
    const first = { data: await m.runNextpnrIce40(), renamed: m.renamed, calls };
    await ice40FromTarball(A, opts(a));
    const again = calls;
    const bad = await ice40FromTarball({ url: 'https://registry.test/c.tgz', integrity: integrityB }, opts(a)).then(() => 'no error', e => e.message);
    const keptAfterBad = (await (await caches.open(ICE40_CACHE)).keys()).map(k => k.url);
    const other = await (await ice40FromTarball(B, opts(b))).runNextpnrIce40();
    const kept = (await (await caches.open(ICE40_CACHE)).keys()).map(k => k.url);
    const offline = await ice40FromTarball({ url: 'https://registry.test/d.tgz', integrity: integrityA }, { fetchFn: async () => { throw new Error('offline'); } }).then(() => 'no error', e => e.message);
    await caches.delete(ICE40_CACHE);
    return { first, again, bad, keptAfterBad, other, kept, log, offline };
  }, b64(a), b64(b), a.integrity, b.integrity);
  assert.deepEqual(r.first, { data: 'the data', renamed: 1, calls: 1 });
  assert.equal(r.again, 1);
  assert.match(r.bad, /downloaded from https:\/\/registry\.test\/c\.tgz: its SHA-512 is not the one of package-lock\.json: not used/);
  assert.deepEqual(r.keptAfterBad, ['https://registry.test/a.tgz']);
  assert.equal(r.other, 'other');
  assert.deepEqual(r.kept, ['https://registry.test/b.tgz']);
  assert.ok(r.log.every(l => l === 'Downloading nextpnr-ice40 and icepack (about 80 MB, from registry.test: once, then kept by this browser)…'));
  assert.equal(r.log.length, 3);
  assert.match(r.offline, /could not be downloaded from https:\/\/registry\.test\/d\.tgz \(offline\)/);
});
