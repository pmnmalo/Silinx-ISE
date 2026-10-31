#!/usr/bin/env node
// Vitis HLS's reserved names (#1926): candidate names as the arguments of small C tops, through Vitis HLS's C synthesis
// (the image and the run of scripts/hls-vitis.mjs), and each one's port name read from csynth.xml. A top Vitis refuses
// is split until the name it refuses is alone. Only the names are written: test/hls-corpus/vitis-names.json, which
// test/c-names.test.js holds core/c-names.js to.
//
//   node scripts/hls-vitis-names.mjs [--update] [--names a,b,c]
//     --names: these names, one top each, merged into the file by --update
//   SILINX_ISE_HOST, SILINX_VITIS_IMAGE, SILINX_VITIS_PART, SILINX_ISE_REMOTE_DIR as scripts/hls-vitis.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PART, parseCsynth, vitisConfig } from './hls-vitis.mjs';
import { VHDL_WORDS, VERILOG_WORDS, SV_WORDS } from '../core/reserved.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'test', 'hls-corpus', 'vitis-names.json');
const words = (s) => s.trim().split(/\s+/);

/** C's own words: they cannot name an argument, so they are no candidates. */
export const C_WORDS = new Set(words(`auto break case char const continue default do double else enum extern float for goto
  if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile
  while asm typeof`));

/** The candidates, by group: the names not reserved by any language's list are the point of #1926, the reserved words
 *  are checked too (each one is renamed today, on the word of the lists in core/reserved.js alone). */
export const CANDIDATES = {
  plain: words('x size index position p value data result clk_en my_pos negate'),
  case: words('POS Pos NEG Neg IN In ENTITY Entity NEW New CLASS Class'),
  systemc: words(`pos neg sensitive sensitive_pos sensitive_neg sc_module SC_MODULE sc_in sc_out sc_inout sc_signal sc_clock
    sc_time sc_main sc_start sc_stop sc_event sc_int sc_uint sc_bigint sc_biguint sc_logic sc_lv sc_bv sc_bit sc_fifo sc_port
    sc_export sc_core sc_dt sc_lv_base sc_trace SC_CTOR SC_METHOD SC_THREAD SC_CTHREAD SC_HAS_PROCESS wait next_trigger read
    write posedge_event negedge_event default_event value_changed_event initialize bind dont_initialize reset_signal_is
    async_reset_signal_is clk clock rst reset name kind basename print dump end_of_elaboration start_of_simulation
    before_end_of_elaboration end_of_simulation thread method main std range to_int to_uint length`),
  cpp: words(`new delete this class template typename namespace using public private protected virtual friend operator throw
    try catch explicit mutable export bool true false wchar_t nullptr constexpr decltype noexcept static_assert thread_local
    alignas alignof char16_t char32_t typeid static_cast dynamic_cast const_cast reinterpret_cast and or not xor bitand bitor
    compl and_eq or_eq not_eq xor_eq`),
  vitis: words('ap_clk ap_rst ap_rst_n ap_start ap_done ap_idle ap_ready ap_return ap_ce ap_continue ap_int ap_uint ap_fixed hls stream'),
  hdl: [...new Set([...VHDL_WORDS, ...VERILOG_WORDS, ...SV_WORDS])].sort(),
};

/** Every candidate once, with no word of C. */
export function candidates() {
  return [...new Set(Object.values(CANDIDATES).flat())].filter((n) => !C_WORDS.has(n));
}

/** The top of a set of names: one scalar argument each, every one read. */
export function topOf(names) {
  return `int names_top(${names.map((n) => `unsigned char ${n}`).join(', ')}) {\n  int names_sum = 0;\n${names.map((n) => `  names_sum += ${n};`).join('\n')}\n  return names_sum;\n}\n`;
}

/** The port's name of each name of a top, from its report's ports: the name, <name>_<something>, or null if neither. */
export function portsOf(names, ports) {
  const all = ports.map((p) => p.name).filter((p) => p !== 'ap_return' || names.includes('ap_return'));
  const left = new Set(all.filter((p) => !/^ap_(clk|rst|rst_n|start|done|idle|ready|return)$/.test(p)));
  const out = {};
  // (the exact names first: a name another's port starts with stays its own)
  for (const n of names) if (left.delete(n)) out[n] = n;
  for (const n of names) {
    if (out[n]) continue;
    const m = [...left].filter((p) => p.toLowerCase().startsWith(`${n.toLowerCase()}_`) || p.toLowerCase() === n.toLowerCase()).sort((a, b) => a.length - b.length)[0];
    if (m) { left.delete(m); out[n] = m; } else out[n] = null;
  }
  return out;
}

/** The tops of a list of names: at most `size` a top, and no two that differ only in letter case, which Vitis tells
 *  apart by a further _r whatever the name (NEG, Neg, neg: NEG, Neg_r, neg_r_r). */
export function chunksOf(names, size = 40) {
  const out = [];
  for (const n of names) {
    const c = out.find((x) => x.length < size && !x.some((y) => y.toLowerCase() === n.toLowerCase()));
    if (c) c.push(n); else out.push([n]);
  }
  return out;
}

/** A results table's names that Vitis renames <name>_r. */
export const renamedByVitis = (names) => Object.keys(names).filter((n) => names[n] === `${n}_r`).sort();

async function main() {
  const { iseWorkBase, configPath } = await import('../server/toolchain.js');
  const { DOCKER_ISOLATION } = await import('../server/ise.js');
  const a = process.argv.slice(2);
  const IMAGE = process.env.SILINX_VITIS_IMAGE || 'xilinx/vitis-hls:2025.2';
  const part = process.env.SILINX_VITIS_PART || PART;
  let HOST = process.env.SILINX_ISE_HOST;
  if (!HOST) try { const s = JSON.parse(fs.readFileSync(configPath(), 'utf8')).ssh; if (s?.host) HOST = s.user ? `${s.user}@${s.host}` : s.host; } catch { /* no config */ }
  if (!HOST) { console.error('set SILINX_ISE_HOST=user@host (the machine with the Vitis HLS image, reached by ssh with a key)'); process.exit(2); }
  const SSH = ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=4', '-o', 'ConnectTimeout=30'];
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
  const ssh = (cmd) => run('ssh', [...SSH, '--', HOST, `export PATH="$PATH:/usr/local/bin"; ${cmd}`]);
  const rsync = (from, to) => run('rsync', ['-a', '-e', `ssh ${SSH.join(' ')}`, from, to]);

  /** The chunks through Vitis, one container: [{ names, ports }] (ports: null, the top refused). */
  function round(chunks) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-vitis-'));
    const name = path.basename(work), remote = `${iseWorkBase('silinx-vitis')}/${name}`;
    const mount = remote.startsWith('/') ? remote : `$HOME/${remote}`;
    try {
      const list = chunks.map((names, i) => {
        const dir = path.join(work, 'src', `n${i}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'names_top.c'), topOf(names));
        fs.writeFileSync(path.join(dir, 'silinx_vitis.cfg'), vitisConfig('[hls]\nsyn.file=names_top.c\nsyn.top=names_top\nclock=10ns\n', { part }));
        return `n${i} n${i}`;
      });
      fs.writeFileSync(path.join(work, 'designs.txt'), `${list.join('\n')}\n`);
      fs.copyFileSync(path.join(ROOT, 'scripts', 'vitis-hls-image', 'hls-vitis-run.sh'), path.join(work, 'hls-vitis-run.sh'));
      ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
      rsync(`${work}/`, `${HOST}:${remote}/`);
      try {
        // (detached, its end awaited by short calls: a dropped connection loses no run)
        ssh(`docker run -d --name ${name} --rm ${DOCKER_ISOLATION.join(' ')} --platform linux/amd64 -v "${mount}":/w ${IMAGE} bash /w/hls-vitis-run.sh /w > /dev/null`);
        for (let left = 360; ; left--) {
          execFileSync('sleep', ['30']);
          let state;
          try { state = ssh(`test -e ${remote}/done && echo done || (docker ps -q -f name=${name} | sed 's/.*/running/')`).trim(); } catch { state = 'running'; }
          if (state === 'done') break;
          if (state !== 'running' || !left) throw new Error(`${name}: stopped before its end`);
        }
        rsync(`${HOST}:${remote}/results/`, `${work}/results/`);
      } finally { ssh(`rm -rf ${remote}`); }
      return chunks.map((names, i) => {
        const f = path.join(work, 'results', `n${i}`, 'csynth.xml');
        return { names, ports: fs.existsSync(f) ? parseCsynth(fs.readFileSync(f, 'utf8')).ports : null };
      });
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  }

  const given = a.includes('--names') ? a[a.indexOf('--names') + 1].split(',') : null;
  const names = given || candidates();
  const results = {}, refused = [];
  let chunks = chunksOf(names, given ? 1 : 40);
  while (chunks.length) {
    console.log(`${chunks.length} tops, ${chunks.flat().length} names`);
    const next = [];
    for (const r of round(chunks)) {
      if (r.ports) Object.assign(results, portsOf(r.names, r.ports));
      else if (r.names.length === 1) refused.push(r.names[0]);
      else { const m = r.names.length >> 1; next.push(r.names.slice(0, m), r.names.slice(m)); }
    }
    chunks = next;
  }
  const lost = Object.keys(results).filter((n) => !results[n]);
  console.log(`renamed <name>_r: ${renamedByVitis(results).join(' ')}`);
  console.log(`other: ${Object.keys(results).filter((n) => results[n] && results[n] !== n && results[n] !== `${n}_r`).map((n) => `${n}->${results[n]}`).join(' ')}`);
  console.log(`refused: ${refused.sort().join(' ')}`);
  console.log(`no port: ${lost.join(' ')}`);
  if (a.includes('--update')) {
    const old = given && fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { ports: {}, refused: [] };
    const sorted = Object.fromEntries(Object.entries({ ...old.ports, ...results }).sort(([x], [y]) => (x < y ? -1 : 1)));
    fs.writeFileSync(FILE, `${JSON.stringify({ image: IMAGE, part, refused: [...new Set([...old.refused, ...refused])].sort(), ports: sorted }, null, 1)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
