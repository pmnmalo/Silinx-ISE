// An ISE schematic's I/O markers named as a keyword of one language only (#1808): a Verilog module's ports next and
// block (secworks-aes, -sha1, -sha256) are VHDL keywords, not Verilog ones. The import renamed them in a Verilog
// schematic too, so its ports differed from the module's; a name is renamed only where the schematic's language
// refuses it, and the schematic read back behaves as the module, in Verilog and (renamed) in VHDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { exportIseSch, importIseSch } from '../core/isesch.js';
import { compile, elaborate } from '../core/compile.js';
import { generateHdl, normalizeDoc, modulesFromLibrary } from '../core/schdoc.js';
import { compareBehaviour } from './schematic-corpus/lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

// a register (an HDL block whose pins are next and block too) and gates
const SEQ = `module kw (clk, next, block, y, q);
  input clk, next, block;
  output y, q;
  reg q;
  assign y = next & ~block;
  always @(posedge clk) q <= q ^ block;
endmodule
`;
// gates only, and the same with the names a VHDL schematic gives its ports (the reference of the VHDL round trip)
const comb = (nx, bl) => `module kw (${nx}, ${bl}, a, y, z);
  input ${nx}, ${bl}, a;
  output y, z;
  assign y = ${nx} & ~${bl};
  assign z = (${nx} | ${bl}) ^ a;
endmodule
`;
// generateHdl's warning on a name reserved in the other language (#679)
const reserved = ['next', 'block'].map(n => `'${n}' is a reserved word of VHDL: rename it`);

// the module as a Verilog schematic, exported to ISE with its markers' names: { ex, hdl, modules, symbols }
const toIse = async src => {
  const c = await convertModuleToSchematic({ sources: [{ path: 'kw.v', text: src, role: 'design' }], module: 'kw', layout });
  assert.ok(c.doc.ports.some(p => p.name === 'next') && c.doc.ports.some(p => p.name === 'block'));
  const ex = exportIseSch(c.doc, { lang: 'verilog', timestamp: 'T' });
  assert.match(ex.xml, /<iomarker [^>]*name="next"/);
  assert.match(ex.xml, /<iomarker [^>]*name="block"/);
  assert.ok(!ex.warnings.some(w => /names written as identifiers/.test(w)), ex.warnings.join('\n'));
  const hdl = ex.files.filter(f => f.kind === 'hdl');
  const symbols = Object.fromEntries(ex.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
  const modules = modulesFromLibrary(compile(hdl), { sources: Object.fromEntries(hdl.map(f => [f.path, f.text])) });
  return { ex, hdl, modules, symbols };
};

const elaborates = (sources, top) => {
  const lib = compile(sources);
  assert.deepEqual(lib.errors.map(e => `${e.file}:${e.line} ${e.message}`), []);
  assert.deepEqual((elaborate(lib, top).diags || []).map(e => `${e.severity}: ${e.message}`), []);
};

test('#1808 a Verilog schematic keeps its markers next and block through the ISE export and import: the module\'s ports and behaviour', async () => {
  for (const src of [SEQ, comb('next', 'block')]) {
    const { ex, hdl, modules, symbols } = await toIse(src);
    const back = importIseSch(ex.xml, { name: 'kw', lang: 'verilog', modules, symbols });
    assert.deepEqual(back.warnings, []);
    const names = back.doc.ports.map(p => p.name).sort();
    assert.ok(names.includes('next') && names.includes('block'), names.join(', '));
    const g = generateHdl(normalizeDoc(back.doc, { modules }), { lang: 'verilog', modules });
    assert.deepEqual(g.diagnostics.map(d => `${d.severity}: ${d.message}`), reserved.map(m => `warning: ${m}`));
    assert.match(g.code, /^module kw\b[^;]*\bnext\b[^;]*\bblock\b/m);
    const sources = [...hdl, { path: 'kw.gen.v', text: g.code }];
    elaborates(sources, 'kw');
    assert.equal(compareBehaviour({ sources: [{ path: 'kw.v', text: src }], top: 'kw' }, { sources, top: 'kw' }, 'kw'), null);
    // exported again: the same marker names, none renamed
    const again = exportIseSch(back.doc, { lang: 'verilog', timestamp: 'T', modules });
    assert.match(again.xml, /<iomarker [^>]*name="next"/);
    assert.match(again.xml, /<iomarker [^>]*name="block"/);
    assert.ok(!again.warnings.some(w => /names written as identifiers/.test(w)), again.warnings.join('\n'));
  }
});

test('#1808 a VHDL schematic still renames the markers next and block (VHDL keywords), a warning each; its VHDL behaves as the module', async () => {
  const { ex, symbols } = await toIse(comb('next', 'block'));
  const back = importIseSch(ex.xml, { name: 'kw', lang: 'vhdl', symbols });
  assert.deepEqual(back.warnings.sort(), [
    "I/O marker 'block' renamed 'block_1' (not a valid HDL identifier or name clash)",
    "I/O marker 'next' renamed 'next_1' (not a valid HDL identifier or name clash)",
  ]);
  assert.deepEqual(back.doc.ports.map(p => p.name).sort(), ['a', 'block_1', 'next_1', 'y', 'z']);
  const g = generateHdl(normalizeDoc(back.doc), { lang: 'vhdl' });
  assert.deepEqual(g.diagnostics, []);
  const sources = [{ path: 'kw.vhd', text: g.code }];
  elaborates(sources, 'kw');
  assert.equal(compareBehaviour({ sources: [{ path: 'kw.v', text: comb('next_1', 'block_1') }], top: 'kw' }, { sources, top: 'kw' }, 'kw'), null);
});
