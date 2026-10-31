// Silinx HLS (#1575): a sequential C function's machine (core/c-fsmd.js) as an ASM chart (core/asm.js's model), to be
// read: the block protocol's IDLE (ap_idle; ap_start: the arguments read) and DONE (ap_done, ap_ready), with
// ap_ctrl_none an IDLE going on at once and a DONE of no outputs (#1927); its inputs and outputs the module's ports
// (core/c-hdl.js's, #1927); a state per block of the C, its statements its register transfers (in the C's order, as
// the C writes them), its ifs decision boxes and the statements under them conditional output boxes, a return, break
// or continue its exit to the state it goes to; the block's own end its next state (a decision when it is a loop's
// condition); a stream's read or write its C, the wait on the FIFO's flag a decision and its handshake under it
// (#1941); a state the clock splits (core/c-schedule.js, #2080) its chain of states, its register transfers in the last.
// Isomorphic ES module.
//
//   cAsm(source, { file, lang, clock, family }) -> { ok, model, diagnostics }   (no model for a combinational function)
import { checkC } from './c-check.js';
import { dataflow } from './c-dataflow.js';
import { scheduled } from './c-schedule.js';
import { exprText, stmtText } from './c-print.js';
import { asmLayout } from './asm-layout.js';
import { cToHdl } from './c-hdl.js';
import { portOf } from './c-names.js';
import { loadBlackboxes, applyBlackboxes } from './c-blackbox.js';

export function cAsm(source, { file = 'input.c', lang = 'vhdl', headers = null, top = null, clock, family, blackboxes = null } = {}) {
  const checked = checkC(source, file, { headers, top, synthesis: true });
  if (!checked.ok || !checked.top) return { ok: false, model: null, diagnostics: checked.diagnostics };
  // (the RTL blackboxes, #1903: cToHdl below says what is wrong with them)
  applyBlackboxes(checked, loadBlackboxes(blackboxes, headers).list, () => {});
  const df = dataflow(checked);
  const seqOnly = df.diagnostics.some((d) => d.severity === 'error') && df.diagnostics.every((d) => d.severity !== 'error' || d.message.includes('#1526'));
  if (!seqOnly) {
    const errs = df.diagnostics.filter((d) => d.severity === 'error');
    return { ok: false, model: null, diagnostics: errs.length ? errs : [{ file, line: 1, col: 1, message: `'${checked.top}' is combinational: it has no state machine`, severity: 'error' }] };
  }
  const m = scheduled(checked, {}, { clock, family });
  if (m.diagnostics.some((d) => d.severity === 'error')) return { ok: false, model: null, diagnostics: m.diagnostics };
  // (the ports the module is made with: ap_ctrl_none's none of the block protocol, an argument renamed, #1927)
  const gen = cToHdl(source, { file, lang, headers, top, clock, family, blackboxes, axis: false });
  if (!gen.ok) return { ok: false, model: null, diagnostics: gen.diagnostics };
  return { ok: true, model: asmLayout(chart(checked.top, m, lang, gen.ports)), diagnostics: m.diagnostics };
}

const HS = ['ap_start', 'ap_continue', 'ap_done', 'ap_idle', 'ap_ready'];

function chart(top, m, lang, ports) {
  const hs = ports.some((p) => p.name === 'ap_start'), chain = ports.some((p) => p.name === 'ap_continue');
  const nodes = [], edges = [];
  let nid = 0, eid = 0;
  const node = (n) => { const x = { id: `n${++nid}`, x: 0, y: 0, ...n }; nodes.push(x); return x; };
  const edge = (from, to, port = 'next') => edges.push({ id: `e${++eid}`, from: from.id, to: to.id, port });
  const states = new Map();
  const idle = node({ type: 'state', name: 'IDLE', actions: hs ? ['ap_idle = 1'] : [] });
  const done = node({ type: 'state', name: 'DONE', actions: hs ? ['ap_done = 1', 'ap_ready = 1', ...(chain ? ['ap_done_reg = !ap_continue'] : [])] : [] });
  // (a state split by the clock: its chain, entered by its first state, its register transfers in its last, #2080)
  const chains = new Map();
  for (const b of m.blocks) {
    const chain = [b.num, ...(m.subStates?.get(b.num) || [])].map((k) => node({ type: 'state', name: `S${k}`, actions: [] }));
    states.set(b.num, chain[0]);
    chains.set(b.num, chain);
  }
  const st = (b) => (b ? states.get(b.num) : done);
  // IDLE: on ap_start the arguments read, the first state (ap_ctrl_none: at once, ap_start 1 inside the module)
  const start = hs ? node({ type: 'decision', cond: chain ? 'ap_start && !ap_done_reg' : 'ap_start' }) : idle;
  if (hs) edge(idle, start);
  const port = hs ? 'true' : 'next';
  // (the registers by the C's names: an argument's x_reg is x)
  const read = m.regs.filter((r) => r.latch != null).map((r) => m.graph.get(r.latch).port.name);
  const latches = read.length ? [`read ${read.join(', ')}`] : [];
  if (latches.length) { const o = node({ type: 'output', actions: latches }); edge(start, o, port); edge(o, states.get(m.entry) || done); }
  else edge(start, states.get(m.entry) || done, port);
  if (hs) edge(start, idle, 'false');
  edge(done, idle);

  for (const b of m.blocks) {
    const chain = chains.get(b.num), s = chain.at(-1);
    chain.slice(1).forEach((x, k) => edge(chain[k], x));
    // the statements: the actions of the box the path is in; an if: a decision, its branches' paths
    let cur = s, pending = [{ from: s, port: 'next' }];
    const act = (text) => {
      if (!cur && !pending.length) return;   // (after a return, break or continue on every path: never run)
      if (!cur) { cur = node({ type: 'output', actions: [] }); for (const p of pending) edge(p.from, cur, p.port); pending = [{ from: cur, port: 'next' }]; }
      cur.actions.push(text);
    };
    const jump = (to) => { if (!cur && !pending.length) return; for (const p of pending) edge(p.from, to, p.port); pending = []; cur = null; };
    const walk = (x) => {
      if (!x) return;
      switch (x.kind) {
        case 'pragma': case 'empty': return;
        case 'block': x.items.forEach(walk); return;
        case 'label': walk(x.stmt); return;
        case 'if': {
          const d = node({ type: 'decision', cond: exprText(x.cond) });
          for (const p of pending) edge(p.from, d, p.port);
          const out = [];
          for (const [branch, port] of [[x.then, 'true'], [x.else, 'false']]) {
            cur = null; pending = [{ from: d, port }];
            walk(branch);
            out.push(...pending);
          }
          cur = null; pending = out;
          return;
        }
        case 'return': if (x.e) act(`ap_return = ${exprText(x.e)}`); jump(done); return;
        case 'break': jump(st(b.loop?.exit)); return;
        case 'continue': jump(st(b.loop?.cont)); return;
        case 'memread': act(`${x.mem}_address0 = ${exprText(x.i)}; ${x.mem}_ce0 = 1`); return;
        case 'memlatch': act(`${x.tmp} = ${x.mem}_q0`); return;
        case 'memwrite': act(`${x.mem}_address0 = ${exprText(x.i)}; ${x.mem}_we0 = 1; ${x.mem}_d0 = ${exprText(x.v)}`); return;
        // a stream's read or write (#1941): the C's, then the state waits while the FIFO is empty (full), the
        // handshake under it (by the module's ports: a stream named in, in_r_empty_n, core/c-hdl.js)
        case 'fiforead': case 'fifowrite': {
          if (!cur && !pending.length) return;
          const rd = x.kind === 'fiforead', f = portOf(x.fifo);
          act(stmtText(x));
          const d = node({ type: 'decision', cond: `${f}_${rd ? 'empty_n' : 'full_n'}` });
          for (const p of pending) edge(p.from, d, p.port);
          edge(d, s, 'false');
          cur = null; pending = [{ from: d, port: 'true' }];
          act(rd ? `${f}_read = 1; ${x.tmp} = ${f}_dout` : `${f}_din = ${exprText(x.v)}; ${f}_write = 1`);
          return;
        }
        // an RTL blackbox's call (#1903): its module started, the state waiting for its end, its outputs then read
        case 'bbcall': {
          if (!cur && !pending.length) return;
          const P = `ap_bb${x.inst.i}`;
          act(`${P} (${x.inst.d.module}): ap_start = 1`);
          const d = node({ type: 'decision', cond: `${P}_done` });
          for (const p of pending) edge(p.from, d, p.port);
          edge(d, s, 'false');
          cur = null; pending = [{ from: d, port: 'true' }];
          act(x.inst.outs.map((o) => `${o.q} = ${P}_${o.name}_v`).join('; ') || `${P} done`);
          return;
        }
        case 'for': case 'while': case 'do': act(`${x.kind} (…) unrolled: ${loopText(x)}`); return;
        case 'switch': act(`switch (${exprText(x.e)}) { … }`); return;
        default: act(stmtText(x));
      }
    };
    b.stmts.forEach(walk);
    if (!pending.length) continue;
    if (b.term.done) jump(done);
    else if (b.term.goto) jump(st(b.term.goto));
    else {
      const d = node({ type: 'decision', cond: exprText(b.term.cond) });
      for (const p of pending) edge(p.from, d, p.port);
      edge(d, st(b.term.t), 'true');
      edge(d, st(b.term.f), 'false');
    }
  }
  return {
    version: 1, name: top, lang, clock: 'ap_clk', reset: { name: 'ap_rst', active: 'high', sync: true }, encoding: 'binary',
    inputs: ports.filter((p) => p.dir === 'in' && p.name !== 'ap_clk' && p.name !== 'ap_rst').map((p) => ({ name: p.name, width: p.w })),
    outputs: ports.filter((p) => p.dir === 'out').map((p) => ({ name: p.name, width: p.w, default: '0', ...(HS.includes(p.name) ? {} : { registered: true }) })),
    registers: m.regs.map((r) => ({ name: r.name.replace(/_reg$/, ''), width: r.w, init: String(r.reset) })),
    nodes, edges, initial: idle.id,
  };
}

const loopText = (x) => {
  const body = x.body?.kind === 'block' ? x.body.items : [x.body];
  return body.filter((s) => s && s.kind !== 'pragma').map((s) => (s.kind === 'expr' || s.kind === 'decl' ? stmtText(s) : `${s.kind} …`)).join('; ');
};
