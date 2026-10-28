// Silinx HLS (#1575): a sequential C function's machine (core/c-fsmd.js) as an ASM chart (core/asm.js's model), to be
// read: the block protocol's IDLE (ap_idle; ap_start: the arguments read) and DONE (ap_done, ap_ready); a state per
// block of the C, its statements its register transfers (in the C's order, as the C writes them), its ifs decision
// boxes and the statements under them conditional output boxes, a return, break or continue its exit to the state
// it goes to; the block's own end its next state (a decision when it is a loop's condition). Isomorphic ES module.
//
//   cAsm(source, { file, lang }) -> { ok, model, diagnostics }   (no model for a combinational function)
import { checkC } from './c-check.js';
import { dataflow } from './c-dataflow.js';
import { fsmd } from './c-fsmd.js';
import { exprText, stmtText } from './c-print.js';
import { asmLayout } from './asm-layout.js';

export function cAsm(source, { file = 'input.c', lang = 'vhdl', headers = null, top = null } = {}) {
  const checked = checkC(source, file, { headers, top, synthesis: true });
  if (!checked.ok || !checked.top) return { ok: false, model: null, diagnostics: checked.diagnostics };
  const df = dataflow(checked);
  const seqOnly = df.diagnostics.some((d) => d.severity === 'error') && df.diagnostics.every((d) => d.severity !== 'error' || d.message.includes('#1526'));
  if (!seqOnly) {
    const errs = df.diagnostics.filter((d) => d.severity === 'error');
    return { ok: false, model: null, diagnostics: errs.length ? errs : [{ file, line: 1, col: 1, message: `'${checked.top}' is combinational: it has no state machine`, severity: 'error' }] };
  }
  const m = fsmd(checked);
  if (m.diagnostics.some((d) => d.severity === 'error')) return { ok: false, model: null, diagnostics: m.diagnostics };
  return { ok: true, model: asmLayout(chart(checked.top, m, lang)), diagnostics: m.diagnostics };
}

function chart(top, m, lang) {
  const nodes = [], edges = [];
  let nid = 0, eid = 0;
  const node = (n) => { const x = { id: `n${++nid}`, x: 0, y: 0, ...n }; nodes.push(x); return x; };
  const edge = (from, to, port = 'next') => edges.push({ id: `e${++eid}`, from: from.id, to: to.id, port });
  const states = new Map();
  const idle = node({ type: 'state', name: 'IDLE', actions: ['ap_idle = 1'] });
  const done = node({ type: 'state', name: 'DONE', actions: ['ap_done = 1', 'ap_ready = 1'] });
  for (const b of m.blocks) states.set(b.num, node({ type: 'state', name: `S${b.num}`, actions: [] }));
  const st = (b) => (b ? states.get(b.num) : done);
  // IDLE: on ap_start the arguments read, the first state
  const start = node({ type: 'decision', cond: 'ap_start' });
  edge(idle, start);
  // (the registers by the C's names: an argument's x_reg is x)
  const read = m.regs.filter((r) => r.latch != null).map((r) => m.graph.get(r.latch).port.name);
  const latches = read.length ? [`read ${read.join(', ')}`] : [];
  if (latches.length) { const o = node({ type: 'output', actions: latches }); edge(start, o, 'true'); edge(o, states.get(m.entry) || done); }
  else edge(start, states.get(m.entry) || done, 'true');
  edge(start, idle, 'false');
  edge(done, idle);

  for (const b of m.blocks) {
    const s = states.get(b.num);
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
    inputs: [{ name: 'ap_start', width: 1 }, ...m.ports.filter((p) => p.dir === 'in').map((p) => ({ name: p.name, width: p.w }))],
    outputs: [{ name: 'ap_done', width: 1, default: '0' }, { name: 'ap_idle', width: 1, default: '0' }, { name: 'ap_ready', width: 1, default: '0' },
      ...m.ports.filter((p) => p.dir === 'out').map((p) => ({ name: p.name, width: p.w, default: '0', registered: true }))],
    registers: m.regs.map((r) => ({ name: r.name.replace(/_reg$/, ''), width: r.w, init: String(r.reset) })),
    nodes, edges, initial: idle.id,
  };
}

const loopText = (x) => {
  const body = x.body?.kind === 'block' ? x.body.items : [x.body];
  return body.filter((s) => s && s.kind !== 'pragma').map((s) => (s.kind === 'expr' || s.kind === 'decl' ? stmtText(s) : `${s.kind} …`)).join('; ');
};
