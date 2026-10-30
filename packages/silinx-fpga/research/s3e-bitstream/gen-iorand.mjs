// A check of the pads' database: gen-iob.mjs's base designs (every pad of the package used as an output,
// or as an input) with random settings on every pad, one output standard per design (the banks share
// their VCCO): drive, slew and pull of the outputs, the standard and pull of the inputs. ISE's bitgen
// of these designs is compared with the writer's (check-writer.mjs).
//   node gen-iorand.mjs iob-dir outdir [n=2] [seed=1]      (iob-dir: gen-iob.mjs --perpad's O_BASE / I_BASE)
import fs from 'node:fs';

const [src, out, ns = '2', seeds = '1'] = process.argv.slice(2);
let seed = +seeds;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return Math.floor((seed / 0x80000000) * n); };
const pick = a => a[rnd(a.length)];
fs.mkdirSync(out, { recursive: true });
const PULL = [null, 'PULLUP', 'PULLDOWN', 'KEEPER'];
const set = (cfg, attr, v) => { const re = new RegExp(`(^|\\s)${attr}::\\S*`); const c = cfg.replace(re, ''); return v === null ? c : `${c} ${attr}::${v} `; };
for (let k = 0; k < +ns; k++) {
  for (const [std, drives] of [['LVCMOS33', ['2', '4', '6', '8', '12', '16']], ['LVTTL', ['2', '4', '6', '8', '12', '16']]]) {
    const o = fs.readFileSync(`${src}/O_BASE.xdl`, 'utf8').replace(/(inst "p_\S+" "IOB",placed \S+ \S+\s*,\s*cfg ")([^"]*)(")/g, (m, a, cfg, b) => {
      let c = set(cfg, 'IOATTRBOX', std);
      c = set(c, 'DRIVEATTRBOX', pick(drives));
      c = set(c, 'SLEW', pick(['SLOW', 'FAST']));
      c = set(c, 'PULL', pick(PULL));
      return a + c + b;
    });
    fs.writeFileSync(`${out}/O_${std}_${k}.xdl`, o);
  }
  const i = fs.readFileSync(`${src}/I_BASE.xdl`, 'utf8').replace(/(inst "p_\S+" "(?:IOB|IBUF)",placed \S+ \S+\s*,\s*cfg ")([^"]*)(")/g, (m, a, cfg, b) => a + set(set(cfg, 'IOATTRBOX', pick(['LVCMOS33', 'LVTTL', 'LVCMOS25', 'LVCMOS18'])), 'PULL', pick(PULL)) + b);
  fs.writeFileSync(`${out}/I_${k}.xdl`, i);
}
console.log(`${3 * +ns} designs`);
