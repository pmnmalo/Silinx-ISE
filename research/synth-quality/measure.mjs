// Size (and the placer's estimate of the critical path) of the open synthesis's netlists, three ways:
//   stock   core/synth-verilog.js without tables + Yosys's own synth_xilinx (Silinx 15.10.1)
//   luts    without tables + the LUT mapping of packages/silinx-fpga/src/synth-open.js (ABC on LUT4_COSTS)
//   nosrl   tables + that mapping, shift registers left in flip-flops (Silinx 15.10.2 before SRL16)
//   now     what the open synthesis does (tables of expressions of few input bits + that mapping,
//           shift registers in SRL16E)
// on the fixture designs the packer supports, the blinky example and the Silinx projects given:
//   node research/synth-quality/measure.mjs [project folder…]
// Columns: cells, LUTs, MUXF5-8, carry cells, flip-flops, slices after packages/silinx-fpga/src/fpga/pack.js (carryOut
// 'xor', as the open flow packs). (Its --place, the estimate of Silinx's placer, went with it: #2137.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { toVerilog } from '../../core/synth-verilog.js';
import { synthCommands, yosysFiles, SRL_CELLS_FILE, cellCounts, utilization, YOSYS_FAMILY } from '../../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../../packages/silinx-fpga/src/synth-open-node.js';
import { readYosysJson } from '../../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../../packages/silinx-fpga/src/fpga/pack.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const projects = args;
const langOf = f => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');

const designs = [];
const D = path.join(ROOT, 'test/fixtures/designs');
for (const n of fs.readdirSync(D).sort()) {
  const spec = JSON.parse(fs.readFileSync(path.join(D, n, 'design.json'), 'utf8'));
  designs.push({ name: n, top: spec.top, sources: spec.files.map(f => ({ path: f, lang: langOf(f), text: fs.readFileSync(path.join(D, n, f), 'utf8') })) });
}
for (const dir of [path.join(ROOT, 'examples/blinky'), ...projects]) {
  const proj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const files = proj.files.filter(f => (f.role || 'design') === 'design' && (f.lang === 'vhdl' || f.lang === 'verilog'));
  designs.push({ name: dir.includes('examples') ? 'examples/blinky' : path.basename(dir), top: proj.top, sources: files.map(f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.join(dir, f.path), 'utf8') })) });
}

const WAYS = {
  stock: { tables: false, synth: top => `synth_xilinx -family ${YOSYS_FAMILY.spartan3e} -ise -flatten -top ${top}` },
  luts: { tables: false, synth: top => synthCommands(top, 'spartan3e', { srl: false }) },
  nosrl: { tables: true, synth: top => synthCommands(top, 'spartan3e', { srl: false }) },
  now: { tables: true, synth: top => synthCommands(top, 'spartan3e') },
};
const pad = (x, n) => String(x).padStart(n);
console.log(`${'design'.padEnd(16)} ${'way'.padEnd(5)} ${pad('cells', 5)} ${pad('LUTs', 5)} ${pad('MUXF', 5)} ${pad('carry', 5)} ${pad('FFs', 4)} ${pad('slices', 6)}`);
for (const d of designs) {
  const lib = compile([...primitiveSources(d.sources), ...d.sources]);
  const design = elaborate(lib, d.top);
  for (const [way, w] of Object.entries(WAYS)) {
    const { text, top } = toVerilog(design, { tables: w.tables });
    const out = await yosysNode(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; ${w.synth(top)}; delete t:$scopeinfo; write_json ${top}.json`], yosysFiles(top, text));
    const u = utilization(cellCounts(out[`${top}.json`], top));
    let slices = '-';
    try {
      const p = pack(readYosysJson(out[`${top}.json`]), { carryOut: 'xor' });
      slices = p.stats.slices;
    } catch (e) { slices = `(${e.message.replace(/^pack: /, '').slice(0, 40)})`; }
    console.log(`${d.name.padEnd(16)} ${way.padEnd(5)} ${pad(u.cells, 5)} ${pad(u.luts, 5)} ${pad(u.muxes, 5)} ${pad(u.carry, 5)} ${pad(u.flipFlops, 4)} ${pad(slices, 6)}`);
  }
}
