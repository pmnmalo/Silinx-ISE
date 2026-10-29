// Silinx - the HDL of a schematic's symbols, the first group of kinds (#405: out of generateHdl in schdoc-hdl.js):
// multiplexers, demultiplexers, tri-state buffers, decoders and encoders; the other kinds go to the second group
// (schdoc-hdl-more.js). Isomorphic ES module: no DOM and no Node APIs.
import { MUX_INPUTS, int } from './schdoc.js';

/** { symbolCases } of generateHdl. */
export function mountSymbolCases(ctx) {
  const {
    INN, OUTN, PW, assign, body, ci, clsOf, diags, extra, fresh, inNet, name, netName, outRead, symbolCasesMore,
    warnOpen, zero
  } = ctx;

  // a multiplexer's assignment, its pins named through P (a pin per bit: those of one row, #2081)
  const muxRow = (s, p, cmt, P, IN) => {
    const o = OUTN(s, P('O')); if (!o) return;
    if (s.type === 'mux2' && !p.en) {
      const d0 = IN('D0'), d1 = IN('D1'), sel = IN('S0');
      if (ci) body.push(`${o} <= ${d1} when ${sel} = '1' else ${d0};`); else assign(o, `${sel} ? ${d1} : ${d0}`);
    } else if (s.type === 'mux4' && !p.en && p.selBus) {
      const d = [0, 1, 2, 3].map(i => IN(`D${i}`)), sel = IN('S', true);
      if (ci) body.push(`with ${sel} select ${o} <=\n  ${d[0]} when "00",\n  ${d[1]} when "01",\n  ${d[2]} when "10",\n  ${d[3]} when others;`);
      else assign(o, `${sel}[1] ? (${sel}[0] ? ${d[3]} : ${d[2]}) : (${sel}[0] ? ${d[1]} : ${d[0]})`);
    } else {
      // the select bits (S1 S0, or the bus S's) and the enable E (#301): O = D<S> when E = 1, else 0
      const n = MUX_INPUTS[s.type], k = Math.log2(n);
      const d = [...Array(n).keys()].map(i => IN(`D${i}`));
      const bus = k > 1 && p.selBus ? IN('S', true) : null;
      const sel = [...Array(k).keys()].map(j => (bus ? (ci ? `${bus}(${j})` : `${bus}[${j}]`) : IN(`S${j}`, true)));
      const e = p.en ? IN('E', true) : null, z = zero(PW(s, P('O')));
      if (ci) {
        const when = i => [...(e ? [`${e} = '1'`] : []), ...sel.map((x, j) => `${x} = '${(i >> j) & 1}'`).reverse()].join(' and ');
        const arms = d.map((x, i) => (i === n - 1 && !e ? x : `${x} when ${when(i)}`));
        body.push(`${o} <= ${arms.join(' else\n  ')}${e ? ` else\n  ${z}` : ''};`);
      } else {
        const tree = (j, base) => (j < 0 ? d[base] : `${sel[j]} ? ${wrap(tree(j - 1, base | (1 << j)), j)} : ${wrap(tree(j - 1, base), j)}`);
        const wrap = (x, j) => (j > 0 ? `(${x})` : x);
        assign(o, e ? `${e} ? (${tree(k - 1, 0)}) : ${z}` : tree(k - 1, 0));
      }
    }
  };
  // a demultiplexer's assignments, its pins named through P
  const demuxRow = (s, p, cmt, P, first = true) => {
    const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k;
    const dn = inNet(s, P('D'));
    if (!dn) warnOpen(s, P('D'));
    const d = dn ? (outRead.get(dn) || netName(dn)) : null;
    // (a shared pin, the select or the enable, said once: by the first row, #2081)
    const net = pin => { const x = inNet(s, pin); if (!x && first) warnOpen(s, pin); return x ? (outRead.get(x) || netName(x)) : null; };
    // the enable E (#301): an unconnected one is 0, the outputs then 0
    const e = p.en ? net('E') : true;
    const lines = [];
    if (k === 1 || p.selBus) {
      const sp = k === 1 ? 'S0' : 'S', sel = net(sp);
      const on = e === true ? '' : ci ? `${e} = '1' and ` : `${e} && `;
      for (let i = 0; i < n; i++) {
        const o = OUTN(s, P(`O${i}`)); if (!o) continue;
        const w = PW(s, P(`O${i}`));
        const z = zero(w);
        let rhs;
        if (!d || (!sel && i) || e === null) rhs = z;
        else if (!sel) rhs = e === true ? d : ci ? `${d} when ${e} = '1' else ${z}` : `${e} ? ${d} : ${z}`;
        else if (ci) rhs = `${d} when ${on}${sel} = ${k === 1 ? `'${i}'` : `"${i.toString(2).padStart(k, '0')}"`} else ${z}`;
        else rhs = `(${on}${sel} == ${k}'d${i}) ? ${d} : ${z}`;
        lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
      }
    } else {
      // the select bits S<k-1> … S0 on pins of their own (#301); an unconnected one is 0
      const sel = [...Array(k).keys()].map(j => net(`S${j}`));
      for (let i = 0; i < n; i++) {
        const o = OUTN(s, P(`O${i}`)); if (!o) continue;
        const z = zero(PW(s, P(`O${i}`)));
        const terms = e === true ? [] : [ci ? `${e} = '1'` : e];
        let never = !d || e === null;
        for (let j = k - 1; j >= 0; j--) {
          const bit = (i >> j) & 1;
          if (sel[j] === null) { if (bit) never = true; continue; }
          terms.push(ci ? `${sel[j]} = '${bit}'` : bit ? sel[j] : `!${sel[j]}`);
        }
        const rhs = never ? z : !terms.length ? d : ci ? `${d} when ${terms.join(' and ')} else ${z}` : `(${terms.join(' && ')}) ? ${d} : ${z}`;
        lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
      }
    }
    if (lines.length) body.push([cmt, ...lines].join('\n'));
  };

  const symbolCases = (s, def, p, S, cmt) => {
    switch (s.type) {
      case 'mux2': case 'mux4': case 'mux8': case 'mux16': {
        // (Pins per bit, #2081: a multiplexer a bit, D<i>_<r> to O<r>, the select and the enable shared)
        // (the select and the enable read once, shared by the rows: an unconnected one tied to 0 once)
        const shared = new Map();
        const IN = (P) => (pin, named) => (P(pin) !== pin ? INN(s, P(pin), named) : shared.get(pin) ?? shared.set(pin, INN(s, pin, named)).get(pin));
        if (def.rows > 1) for (let r = 0; r < def.rows; r++) { const P = (x) => (x === 'O' ? `O${r}` : /^D\d+$/.test(x) ? `${x}_${r}` : x); muxRow(s, p, cmt, P, IN(P)); }
        else muxRow(s, p, cmt, (x) => x, (pin, named) => INN(s, pin, named));
        break;
      }
      case 'demux': {
        // (Pins per bit, #2081: a demultiplexer a bit, D<r> to O<i>_<r>, the select and the enable shared)
        if (def.rows > 1) for (let r = 0; r < def.rows; r++) demuxRow(s, p, cmt, (x) => (x === 'D' ? `D${r}` : /^O\d+$/.test(x) ? `${x}_${r}` : x), r === 0);
        else demuxRow(s, p, cmt, (x) => x);
        break;
      }
      case 'tbuf': {
        // tri-state buffer: O = I while enabled, else Z; several of them may drive the same (resolved) net
        const en = p.enable === 'T' ? 'T' : 'E';
        const pairs = def.pins.filter(q => q.dir === 'out').map(q => [q.name.replace(/^O/, 'I'), q.name]);
        const live = pairs.map(([i, o]) => [i, o, OUTN(s, o)]).filter(x => x[2]);
        if (!live.length) { diags.push({ severity: 'warning', message: `${s.name}: output not connected, tri-state buffer skipped`, ref: { kind: 'symbol', id: s.id } }); return; }
        // (an unconnected enable is tied to 0 through a signal: '0' = '1' would be ambiguous in VHDL)
        const e = INN(s, en, true);
        const lines = [cmt];
        for (const [i, op, o] of live) {
          const w = PW(s, op), x = INN(s, i);
          if (ci) lines.push(`${o} <= ${x} when ${e} = '${en === 'T' ? 0 : 1}' else ${w > 1 ? "(others => 'Z')" : "'Z'"};`);
          else { const z = w > 1 ? `{${w}{1'bz}}` : "1'bz"; lines.push(`assign ${o} = ${en === 'T' ? `${e} ? ${z} : ${x}` : `${e} ? ${x} : ${z}`};`); }
        }
        body.push(lines.join('\n'));
        break;
      }
      case 'decoder': case 'encoder': {
        // bit j of an input pin group: bus pin (bus mode) or one pin per bit; null when unconnected (tied to 0)
        const bitIn = (bus, base, j) => {
          const pin = bus ? base : `${base}${j}`;
          const n = inNet(s, pin);
          if (!n) { if (!bus || j === 0) warnOpen(s, pin); return null; }
          const nm = outRead.get(n) || netName(n);
          return bus ? (ci ? `${nm}(${j})` : `${nm}[${j}]`) : nm;
        };
        const AND = ci ? ' and ' : ' & ', OR = ci ? ' or ' : ' | ';
        const NOT = x => (ci ? `(not ${x})` : `~${x}`);
        const B0 = ci ? "'0'" : "1'b0";
        const lines = [cmt];
        if (s.type === 'decoder') {
          const n = Math.max(1, Math.min(5, int(p.n, 2)));
          const a = [...Array(n).keys()].map(j => bitIn(!!p.bus, 'A', j));
          const e = p.en ? bitIn(false, 'E', '') : true;
          const outBus = p.bus ? OUTN(s, 'D') : null;
          if (p.bus && !outBus) return;
          for (let i = 0; i < 1 << n; i++) {
            const o = p.bus ? (ci ? `${outBus}(${i})` : `${outBus}[${i}]`) : OUTN(s, `D${i}`);
            if (!o) continue;
            const terms = [];
            let zeroT = e === null;
            if (e !== true && e !== null) terms.push(e);
            for (let j = n - 1; j >= 0; j--) {
              const bit = (i >> j) & 1;
              if (a[j] === null) { if (bit) zeroT = true; continue; }
              terms.push(bit ? a[j] : NOT(a[j]));
            }
            const rhs = zeroT ? B0 : terms.length ? terms.join(AND) : (ci ? "'1'" : "1'b1");
            lines.push(ci ? `${o} <= ${rhs};` : `assign ${o} = ${rhs};`);
          }
        } else {
          const n = Math.max(2, Math.min(5, int(p.n, 2))), m = 1 << n;
          const I = [...Array(m).keys()].map(i => bitIn(!!p.bus, 'I', i));
          const oA = p.bus ? OUTN(s, 'A') : null;
          const oBits = p.bus ? [] : [...Array(n).keys()].map(j => OUTN(s, `A${j}`));
          const oV = OUTN(s, 'V');
          const live = I.map((x, i) => [x, i]).filter(([x]) => x !== null);
          if (oA || oBits.some(Boolean)) {
            const t = fresh(`${s.name}_a`);
            if (ci) extra.push({ name: t, type: `std_logic_vector(${n - 1} downto 0)` }); else extra.push({ name: t, width: n });
            const lit = i => (ci ? `"${i.toString(2).padStart(n, '0')}"` : `${n}'d${i}`);
            if (p.mode === 'one-hot') {
              for (let j = 0; j < n; j++) {
                const ors = live.filter(([, i]) => (i >> j) & 1).map(([x]) => x);
                const rhs = ors.length ? ors.join(OR) : B0;
                lines.push(ci ? `${t}(${j}) <= ${rhs};` : `assign ${t}[${j}] = ${rhs};`);
              }
            } else {
              const chain = live.slice().reverse().filter(([, i]) => i > 0);
              if (ci) lines.push(`${t} <= ${chain.map(([x, i]) => `${lit(i)} when ${x} = '1' else `).join('')}${lit(0)};`);
              else lines.push(`assign ${t} = ${chain.map(([x, i]) => `${x} ? ${lit(i)} : `).join('')}${lit(0)};`);
            }
            if (oA) {
              const cls = ci ? clsOf(oA) : 'v';
              lines.push(ci ? `${oA} <= ${cls === 'u' ? `unsigned(${t})` : cls === 's' ? `signed(${t})` : t};` : `assign ${oA} = ${t};`);
            }
            oBits.forEach((o, j) => { if (o) lines.push(ci ? `${o} <= ${t}(${j});` : `assign ${o} = ${t}[${j}];`); });
          }
          if (oV) {
            const rhs = live.length ? live.map(([x]) => x).join(OR) : B0;
            lines.push(ci ? `${oV} <= ${rhs};` : `assign ${oV} = ${rhs};`);
          }
        }
        if (lines.length > 1) body.push(lines.join('\n'));
        break;
      }
      default:
        symbolCasesMore(s, def, p, S, cmt);
    }
  };

  return { symbolCases };
}
