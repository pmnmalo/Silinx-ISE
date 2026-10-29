// SSim's Console and command line (#405: out of mountISim): the simulator's messages and the commands' output, the
// command line with its history, and the commands (run, restart, ssim force (isim force: its old name, still accepted), wave add, show, zoom, marker, help).
// mountConsole(ctx) is called by mountISim where this code was, with what it uses of the simulator window.
import { h } from './dom.js';
import { fmtTime, parseTime, formatValue, parseValue } from './isim.js';

/** The Console of the SSim window: { logLine(text, kind), echo(cmd), execCommand(line) }. */
export function mountConsole(ctx) {
  const { st, sim, design, cons, cmdInput, $, cleanups, onOpenSource, rfVal, rfUnit, enqueue, findSignal, findInst, addSignals,
    addInstance, addForce, removeForces, addMarker, zoomFit, zoomAt } = ctx;
  const KIND_LABEL = { note: 'Note', warning: 'Warning', error: 'Error', failure: 'Failure' };
  let consoleLines = 0;
  function appendConsole(text, cls, src) {
    const atBottom = cons.scrollHeight - cons.scrollTop - cons.clientHeight < 30;
    const d = h('div', { class: 'isim-ln ' + (cls || '') });
    d.textContent = text;
    if (src && src.file && onOpenSource) {
      d.classList.add('link'); d.title = `${src.file}:${src.line ?? ''}`;
      d.addEventListener('dblclick', () => onOpenSource({ file: src.file, line: src.line || 1 }));
    }
    cons.appendChild(d);
    if (++consoleLines > 5000) { cons.firstChild.remove(); consoleLines--; }
    if (atBottom) cons.scrollTop = cons.scrollHeight;
  }
  function logLine(text, kind = 'info') { appendConsole(text, 'k-' + kind); }
  function echo(cmd) { appendConsole(`SSim> ${cmd}`, 'k-cmd'); }
  function formatLog(e) {
    if (e.kind === 'print') return e.text;
    const lbl = KIND_LABEL[e.kind] || e.kind;
    if (!e.proc) return e.kind === 'note' ? e.text : `${lbl.toUpperCase()}: ${e.text}`;
    const scope = e.proc ? ` (${e.file ? e.file.split('/').pop() : ''}${e.line ? `:${e.line}` : ''})` : '';
    return `at ${fmtTime(e.time)}: ${lbl}: ${e.text}${scope}`;
  }
  const prevOnLog = sim.onLog;
  sim.onLog = (e) => { prevOnLog?.(e); appendConsole(formatLog(e), 'k-' + e.kind, e); };
  cleanups.push(() => { sim.onLog = prevOnLog; });
  $('.isim-clear').addEventListener('click', () => { cons.innerHTML = ''; consoleLines = 0; });

  const HELP = [
    'Available commands:',
    '  run [<time> [<unit>]] | run all       advance the simulation (default run time from the toolbar)',
    '  restart                               restart the simulation from time 0 (forces are kept)',
    '  ssim force add <path> <value> [-radix bin|hex|dec|c1dec|oct|ascii] [-time <t>] [-value <v> -time <t>]... [-repeat <period>] [-cancel <t>]',
    '  ssim force remove <path>              release a forced signal',
    '  wave add <path>                       add a signal (or every signal of an instance) to the wave window',
    '  show value <path> [-radix <r>]        print the current value of a signal',
    '  show time                             print the current simulation time',
    '  zoom fit | zoom in | zoom out         change the wave window zoom',
    '  marker add [<time>]                   add a marker',
    '  help                                  this text',
    'Paths may use / or . separators and may be relative to the selected instance; times default to ns.',
  ];
  function tokenize(s) { return (s.match(/"[^"]*"|'[^']*'|\S+/g) || []); }
  function execCommand(line) {
    const s = line.trim();
    if (!s) return Promise.resolve();
    echo(s);
    st.history.push(s); st.histPos = st.history.length;
    return enqueue(s, () => doCommand(s));
  }
  async function doCommand(s) {
    const api = ctx.api();
    const tk = tokenize(s);
    const c0 = tk[0].toLowerCase();
    try {
      if (c0 === 'help' || c0 === '?') { HELP.forEach(l => logLine(l)); return; }
      if (c0 === 'run') {
        if (!tk[1]) { const ps = parseTime(rfVal.value, rfUnit.value); await api.runFor(ps); return; }
        if (tk[1].toLowerCase() === 'all') { await api.runAll(); return; }
        const ps = parseTime(tk.slice(1).join(''), 'ns');
        if (!(ps > 0)) throw new Error(`invalid time '${tk.slice(1).join(' ')}'`);
        await api.runFor(ps); return;
      }
      if (c0 === 'restart') { api.restart(true); return; }
      if (c0 === 'show' && tk[1] === 'time') { logLine(`Simulation time: ${fmtTime(sim.now)}`); return; }
      if (c0 === 'show' && tk[1] === 'value') {
        const sig = findSignal(tk[2] || '');
        if (!sig) throw new Error(`signal '${tk[2] || ''}' not found`);
        const ri = tk.indexOf('-radix');
        const radix = ri > 0 ? ({ dec: 'sdec', unsigned: 'udec' }[tk[ri + 1]] || tk[ri + 1]) : 'default';
        logLine(Array.isArray(sig.val) ? '(array)' : formatValue(sig.val, sig.t, radix));
        return;
      }
      if (c0 === 'wave' && tk[1] === 'add') {
        if (!tk[2]) throw new Error('usage: wave add <path>');
        for (const p of tk.slice(2)) {
          const sig = findSignal(p);
          if (sig) { addSignals([sig]); continue; }
          const inst = findInst(p) || (p === '/' ? design.top : null);
          if (inst) { addInstance(inst, false); continue; }
          throw new Error(`object '${p}' not found`);
        }
        return;
      }
      if (c0 === 'zoom') { const a = tk[1]; if (a === 'fit' || a === 'full') zoomFit(); else if (a === 'in') zoomAt(0.5); else if (a === 'out') zoomAt(2); return; }
      if (c0 === 'marker' && tk[1] === 'add') { addMarker(tk[2] ? parseTime(tk.slice(2).join(''), 'ns') : st.cursor); return; }
      if ((c0 === 'ssim' || c0 === 'isim') && tk[1] === 'force') {
        const sub = tk[2];
        const sig = findSignal(tk[3] || '');
        if (!sig) throw new Error(`signal '${tk[3] || ''}' not found`);
        if (sub === 'remove') { removeForces(sig); return; }
        if (sub !== 'add') throw new Error('usage: ssim force add|remove <path> ...');
        if (!sig.wave) throw new Error('arrays/memories cannot be forced');
        let radix = 'default';
        const ri = tk.indexOf('-radix');
        if (ri > 0) radix = ({ unsigned: 'dec', signed: 'dec', binary: 'bin', hexadecimal: 'hex' }[tk[ri + 1]] || tk[ri + 1]);
        const pattern = [];
        let pending = tk[4];
        let repeat = 0, cancel = null;
        let curOff = 0;
        const rawVals = [];
        if (pending === undefined || pending.startsWith('-')) throw new Error('missing value');
        rawVals.push({ v: pending, off: 0 });
        for (let i = 5; i < tk.length; i++) {
          const a = tk[i];
          const takeTime = () => { let t = tk[++i]; if (tk[i + 1] && /^(fs|ps|ns|us|ms|s)$/i.test(tk[i + 1])) t += tk[++i]; const ps = parseTime(t, 'ns'); if (isNaN(ps)) throw new Error(`invalid time '${t}'`); return ps; };
          if (a === '-radix') { i++; continue; }
          if (a === '-value') { rawVals.push({ v: tk[++i], off: null }); continue; }
          if (a === '-time') { curOff = takeTime(); rawVals[rawVals.length - 1].off = curOff; continue; }
          if (a === '-repeat') { repeat = takeTime(); continue; }
          if (a === '-cancel') { cancel = takeTime(); continue; }
          throw new Error(`unknown option '${a}'`);
        }
        let lastOff = 0;
        for (const r of rawVals) {
          const off = r.off ?? lastOff;
          pattern.push({ off, val: parseValue(r.v.replace(/^["']|["']$/g, (m) => m), sig.t, radix) });
          lastOff = off;
        }
        pattern.sort((a, b) => a.off - b.off);
        const base = pattern[0].off;
        for (const p of pattern) p.off -= base;
        if (repeat && pattern[pattern.length - 1].off >= repeat) throw new Error('-repeat period must exceed the last -time offset');
        addForce(sig, { pattern, start: sim.now + base, repeat, cancel: cancel == null ? null : sim.now + cancel, desc: s });
        if (!rows().some(r => r.sig === sig)) addSignals([sig]);
        return;
      }
      throw new Error(`unknown command '${tk[0]}' (type help)`);
    } catch (e) {
      logLine(`ERROR: ${e.message}`, 'error');
    }
  }
  const rows = () => st.rows.filter(r => r.kind === 'sig');
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = cmdInput.value; cmdInput.value = ''; execCommand(v); }
    else if (e.key === 'ArrowUp') { if (st.histPos > 0) { st.histPos--; cmdInput.value = st.history[st.histPos]; } e.preventDefault(); }
    else if (e.key === 'ArrowDown') { if (st.histPos < st.history.length) { st.histPos++; cmdInput.value = st.history[st.histPos] ?? ''; } e.preventDefault(); }
  });
  return { logLine, echo, execCommand };
}
