// Silinx - the slowest paths of a placed and routed design, stage by stage, back to their source (#3178): the timing
// analysis's paths (fpga/timing.js analyze().paths) with each stage's site, net and delay, its slack against its clock's
// PERIOD, and the source lines of the logic it goes through.
//
//   const r = timingPaths(sta, design, { n: 10, periods, netlist, synText, top })   // sta: analyzeTiming's result
//   r.paths   [{ clock, port, required, delay, period, half, slack, stages: [{ kind, inst, pin, site, net, delay,
//              arrival, sources: [{ file, line, block }], signals: [the named signals its cells drive] }],
//              lines: [{ file, line }] }]
//   pathsText(r)                                            // the paths as text (the MCP's timing_paths)
//   pathHighlight(r.paths[i])                               // what Show Path highlights: { files, insts, sites, nets }
//   (between: true) r.points [the registers: a flip-flop's named signal], r.pairs [the worst path of each two, as r.paths'
//              with from, to]; betweenPaths(r, from, to)  // those from a register and / or into one, slowest first
//
// Back to the source: an instance of the routed design (a slice, a block RAM, a multiplier) holds Yosys's cells (its
// cfg's `F:<cell>:#LUT`, `FFY:<cell>:#FF`, the names' ':' written '_'); a cell's `src` attribute points into the flat
// Verilog made for synthesis (<top>_syn.v), whose blocks each start with the place they come from
// (`// process_26 (src/sevenseg.vhd:26)`, core/synth-module.js). abc's LUTs and the block RAMs keep only Yosys's own
// map files as their `src`: for those, the named signals on the cell's outputs lead to the block that assigns them.

/** The blocks of the synthesis Verilog: [{ from, to (its lines, 1-based), file, line, name, writes: Set of the names it
 *  assigns, calls: Set of the names it calls }], from the `// name (file:line)` line before each block; and its
 *  functions (out.funcs: [{ from, to, name, calls }], before the blocks: a cell made in one is its callers'). */
export function synBlocks(synText) {
  const lines = String(synText || '').split('\n'), out = [], funcs = [];
  let cur = null, fn = null;
  lines.forEach((l, i) => {
    const f = /^ {2}function\s+(?:automatic\s+)?(?:\[[^\]]*\]\s*)?(\w+)/.exec(l);
    if (f) { fn = { from: i + 1, to: i + 1, name: f[1], calls: new Set() }; funcs.push(fn); return; }
    if (fn) {
      if (/^ {2}endfunction\b/.test(l)) { fn.to = i + 1; fn = null; } else for (const c of l.matchAll(/\b(\w+)\s*\(/g)) fn.calls.add(c[1]);
      return;
    }
    const m = /^ {2}\/\/ (.+) \(([^()]+):(\d+)\)$/.exec(l);
    if (m) { if (cur) cur.to = i; cur = { from: i + 2, to: lines.length, file: m[2], line: +m[3], name: m[1], writes: new Set(), calls: new Set() }; out.push(cur); return; }
    if (/^endmodule\b/.test(l) && cur) { cur.to = i; cur = null; return; }
    if (!cur) return;
    for (const c of l.matchAll(/\b(\w+)\s*\(/g)) cur.calls.add(c[1]);
    // (an assignment's target: `\display.count  <= …`, `x[3] = …`, `assign y = …`; an escaped name ends at a space, as
    // Verilog's: in linear time, CodeQL js/polynomial-redos, #3271)
    const a = /^\s*(?:assign\s+)?(\\\S+(?=\s)|[A-Za-z_][\w$]*)\s*(?:\[[^\]]*\]\s*)*<?=(?!=)/.exec(l);
    if (a) cur.writes.add(a[1].replace(/^\\/, ''));
  });
  return Object.assign(out, { funcs });
}

// a cell's Yosys name as the XDL writes it (':' -> '_')
const xdlName = n => n.replace(/:/g, '_');

/** The source of each cell of the design: (cell name as in the XDL) -> [{ file, line, block }] (empty when unknown):
 *  its own src in the synthesis Verilog (in a function: the blocks that call it); else the blocks that assign the named
 *  signals on its outputs; else the sources of the cells its outputs feed (abc's LUTs: the logic of the block they
 *  compute for), a few levels on. */
export function cellSources(netlist, synText, top) {
  const mod = netlist?.modules?.[top] || Object.values(netlist?.modules || {}).find(m => m.attributes?.top) || null;
  if (!mod) return Object.assign(() => [], { signals: () => [] });
  const blocks = synBlocks(synText);
  const cells = new Map(), byBit = new Map(), readers = new Map();
  for (const [name, c] of Object.entries(mod.cells || {})) {
    const k = xdlName(name);
    cells.set(k, c);
    for (const [port, bits] of Object.entries(c.connections || {})) {
      if (c.port_directions?.[port] !== 'input') continue;
      for (const b of bits) if (typeof b === 'number') { if (!readers.has(b)) readers.set(b, new Set()); readers.get(b).add(k); }
    }
  }
  for (const [name, n] of Object.entries(mod.netnames || {})) {
    if (name.startsWith('$') || n.hide_name) continue;
    for (const b of n.bits || []) if (typeof b === 'number') { if (!byBit.has(b)) byBit.set(b, []); byBit.get(b).push(name); }
  }
  const synFile = new RegExp(`^${`${top}_syn.v`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)\\.\\d+-(\\d+)\\.\\d+$`);   // (#3278)
  // the blocks that call a function, directly or through other functions
  const callers = (name, seen = new Set()) => {
    if (seen.has(name)) return [];
    seen.add(name);
    return [...blocks.filter(b => b.calls.has(name)), ...blocks.funcs.filter(g => g.calls.has(name)).flatMap(g => callers(g.name, seen))];
  };
  const blocksAt = line => {
    const b = blocks.find(x => line >= x.from && line <= x.to);
    if (b) return [b];
    const g = blocks.funcs.find(x => line >= x.from && line <= x.to);
    return g ? callers(g.name) : [];
  };
  const outBits = c => Object.entries(c.connections || {}).filter(([p]) => c.port_directions?.[p] === 'output').flatMap(([, bits]) => bits).filter(b => typeof b === 'number');
  const own = (c) => {
    const found = new Set();
    for (const s of String(c?.attributes?.src || '').split('|')) {
      const m = synFile.exec(s);
      if (m) for (let l = +m[1]; l <= +m[2]; l++) for (const b of blocksAt(l)) found.add(b);
    }
    if (!found.size) for (const b of outBits(c)) for (const sig of byBit.get(b) || []) for (const k of blocks) if (k.writes.has(sig)) found.add(k);
    return found;
  };
  const cache = new Map();
  // (the XDL's names of a cell's parts: a block RAM's `laps_ram.0.0.RAMB16`, a carry's `….muxcy$s`)
  const cellOf = n => cells.get(n) ?? cells.get(n.replace(/\$[a-z]+$/, '')) ?? cells.get(n.replace(/\.[^.]*$/, ''));
  const sourcesOf = (cellName) => {
    if (cache.has(cellName)) return cache.get(cellName);
    const c = cellOf(cellName);
    let found = c ? own(c) : new Set();
    // (forward, breadth first, up to 4 levels: the first level that finds any)
    for (let level = 0, front = c && !found.size ? [c] : [], seen = new Set([c]); level < 4 && front.length && !found.size; level++) {
      const next = [];
      for (const x of front) for (const b of outBits(x)) for (const r of readers.get(b) || []) { const y = cells.get(r); if (!seen.has(y)) { seen.add(y); next.push(y); } }
      for (const y of next) for (const b of own(y)) found.add(b);
      front = next;
    }
    const out = [...found].map(b => ({ file: b.file, line: b.line, block: b.name }));
    cache.set(cellName, out);
    return out;
  };
  // the named signals a cell drives (a flip-flop's: its register; #3178's drawings find their elements by them)
  sourcesOf.signals = (cellName) => { const c = cellOf(cellName); return c ? [...new Set(outBits(c).flatMap(b => byBit.get(b) || []))] : []; };
  return sourcesOf;
}

// The lane of a slice's pin and of its elements: the Spartan-3E's F / X half or G / Y half, the Spartan-6's A … D
// (a pin or an element of no lane: the whole slice's)
const S3E_PIN = { X: /^(F[1-4]|X|XQ|XB|BX)$/, Y: /^(G[1-4]|Y|YQ|YB|BY)$/ };
const S3E_BEL = { X: /^(F|FFX|XORF|CYMUXF|F5MUX)$/, Y: /^(G|FFY|XORG|CYMUXG|FXMUX)$/ };
function pinLane(pin) {
  for (const [k, re] of Object.entries(S3E_PIN)) if (re.test(pin)) return k;
  const m = /^([A-D])(\d|Q|MUX|X|I)?$/.exec(pin);
  return m ? m[1] : null;
}
function belLane(bel) {
  for (const [k, re] of Object.entries(S3E_BEL)) if (re.test(bel)) return k;
  const m = /^([A-D])(6LUT|5LUT|FF|5FF)$/.exec(bel);
  return m ? m[1] : null;
}
const isCell = c => c.name && /^#(LUT|FF|LATCH|RAM|ROM)/.test(c.value || '') || (c.name && /^(RAMB|MULT|DSP|CARRY4|XOR[FG]|CYMUX[FG])/.test(c.attr));

/** The cells of an instance a stage goes through (the ones of its pin's lane; all of them when the pin has no lane or
 *  none of its lane is used). */
export function stageCells(inst, pin) {
  const cells = (inst?.cfg || []).filter(isCell);
  const lane = pinLane(pin);
  const own = lane ? cells.filter(c => belLane(c.attr) === lane) : [];
  // (a block RAM, a multiplier: the instance is its cell)
  return own.length || cells.length ? [...new Set((own.length ? own : cells).map(c => c.name))] : inst ? [inst.name] : [];
}
// the cells whose signals a stage drives: a clock-to-out's flip-flop (the register it reads, not the LUT beside it), a
// logic stage's cells but the flip-flops (it goes through the LUT), a setup's all (the logic before the register, and it)
const isFlop = c => /^#(FF|LATCH)/.test(c.value || '');
function signalCells(inst, s, cells) {
  if (s.kind === 'setup') return cells;
  const flop = new Set((inst?.cfg || []).filter(c => c.name && isFlop(c)).map(c => c.name));
  const own = cells.filter(n => flop.has(n) === (s.kind === 'clock-to-out'));
  return own.length ? own : cells;
}

/**
 * The n slowest paths (sta.paths(n), the worst into each end) as stages, back to the source. opts: { n (10), periods
 * (checkPeriods' results: each clock's PERIOD), netlist (Yosys's JSON), synText (<top>_syn.v), top }.
 */
export function timingPaths(sta, design, { n = 10, periods = [], netlist = null, synText = '', top = '', between = false } = {}) {
  const insts = new Map(design.insts.map(i => [i.name, i]));
  const netInto = new Map();
  for (const net of design.nets) for (const p of net.inpins) netInto.set(`${p.inst}\u0000${p.pin}`, net.name);
  const sourcesOf = cellSources(netlist, synText, top);
  const req = new Map(periods.filter(c => c.clock && !c.missing).map(c => [c.clock, c]));
  const r3 = x => +x.toFixed(3);
  const asPath = p => {
    const c = req.get(p.clock);
    const required = c ? (p.half ? c.required / 2 : c.required) : null;
    const stages = p.path.map(s => {
      const inst = insts.get(s.inst);
      const stage = { kind: s.kind, inst: s.inst, pin: s.pin, site: inst?.site || null, delay: r3(s.delay), arrival: r3(s.arrival) };
      if (s.kind === 'net') stage.net = netInto.get(`${s.inst}\u0000${s.pin}`) || null;
      const seen = new Set();
      const cellsOf = s.kind === 'net' ? [] : stageCells(inst, s.pin);
      stage.sources = cellsOf.flatMap(sourcesOf).filter(x => { const k = `${x.file}:${x.line}`; return !seen.has(k) && seen.add(k); });
      stage.signals = [...new Set(signalCells(inst, s, cellsOf).flatMap(sourcesOf.signals))];
      return stage;
    });
    const seen = new Set(), lines = [];
    for (const s of stages) for (const x of s.sources) { const k = `${x.file}:${x.line}`; if (!seen.has(k)) { seen.add(k); lines.push({ file: x.file, line: x.line }); } }
    return { clock: p.clock, port: c?.port ?? null, required, delay: r3(p.delay), period: r3(p.period), half: p.half,
      slack: required == null ? null : r3(required - p.delay), stages, lines };
  };
  const paths = (sta.paths ? sta.paths(n) : []).map(asPath);
  if (!between || !sta.paths) return { top, paths };
  // the paths between two points (#3178): a point is a register, the named signal of a flip-flop (its instance's name
  // when it has none); the worst path from each to each other it reaches
  const memo = new Map();
  const pointsOf = ({ inst, pin }) => {
    const k = `${inst}\u0000${pin}`;
    if (!memo.has(k)) {
      const i = insts.get(inst), lane = pinLane(pin);
      const flops = (i?.cfg || []).filter(c => c.name && isFlop(c) && (!lane || belLane(c.attr) === lane)).map(c => c.name);
      const sigs = [...new Set(flops.flatMap(sourcesOf.signals))];
      memo.set(k, sigs.length ? sigs : [inst]);
    }
    return memo.get(k);
  };
  const starts = new Set(sta.pins ? sta.pins().starts.flatMap(pointsOf) : []);
  const pairs = [];
  for (const a of [...starts].sort()) {
    const worst = new Map();
    for (const q of sta.paths(Infinity, { from: x => pointsOf(x).includes(a) })) for (const b of pointsOf(q.path.at(-1))) if (!worst.has(b) || q.period > worst.get(b).period) worst.set(b, q);
    for (const [b, q] of [...worst].sort((x, y) => y[1].period - x[1].period)) pairs.push({ from: a, to: b, ...asPath(q) });
  }
  return { top, paths, points: [...new Set(pairs.flatMap(p => [p.from, p.to]))].sort(), pairs };
}

/** The paths between two registers (#3178, timingPaths' pairs: their worst paths, from `from` and into `to`, either ''
 *  for any register), slowest first. */
export function betweenPaths(r, from = '', to = '') {
  return (r.pairs || []).filter(p => (!from || p.from === from) && (!to || p.to === to)).sort((a, b) => b.period - a.period);
}

/** The paths as text: one line per path, then its stages when `detail` (the index of one path). */
export function pathsText(r, detail = null) {
  const ends = p => `${p.stages[0].inst}.${p.stages[0].pin} -> ${p.stages.at(-1).inst}.${p.stages.at(-1).pin}`;
  // (a path between two registers: their names first)
  const head = (p, i) => `path ${i + 1}: ${p.from ? `${p.from} -> ${p.to} (${ends(p)})` : ends(p)}, clock ${p.clock}${p.half ? ' (between its two edges)' : ''}: ${p.delay.toFixed(3)} ns${p.required == null ? ' (no PERIOD constraint)' : `, required ${p.required.toFixed(3)} ns, slack ${p.slack.toFixed(3)} ns`}`;
  if (detail == null) return r.paths.map(head);
  const p = r.paths[detail];
  return [head(p, detail), ...p.stages.map(s => `  ${s.kind.padEnd(12)} ${s.delay.toFixed(3).padStart(7)} ${s.arrival.toFixed(3).padStart(8)}  ${s.inst}.${s.pin}${s.site ? ` (${s.site})` : ''}${s.net ? `, net ${s.net}` : ''}${s.sources.length ? `  <- ${s.sources.map(x => `${x.file}:${x.line}`).join(', ')}` : ''}`)];
}

/** What Show Path highlights (#3178): a path's source lines by file ({ file: [line…] }), its instances, sites and nets. */
export function pathHighlight(p) {
  const files = {};
  for (const l of p.lines) (files[l.file] ||= []).push(l.line);
  const uniq = xs => [...new Set(xs.filter(Boolean))];
  return { files, insts: uniq(p.stages.map(s => s.inst)), sites: uniq(p.stages.map(s => s.site)), nets: uniq(p.stages.map(s => s.net)) };
}
