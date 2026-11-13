// Silinx - the HDL of a schematic's symbols, the second group of kinds (#405: out of generateHdl in schdoc-hdl.js):
// adders and subtractors, comparators, constants, slices and bus joins, registers and counters, module instances and
// HDL blocks; an unknown kind skipped with a warning. Isomorphic ES module: no DOM and no Node APIs.
import { arithIo, constBits, findMod, int, vhdlBits, vlogBits } from './schdoc.js';
import { compareOps, comparePin, constWidth } from './schdoc-symbols.js';
import { hdlName, vhdlClass } from './schdoc-hdl.js';

/** { symbolCasesMore } of generateHdl. */
export function mountSymbolCasesMore(ctx) {
  const {
    INN, OUTN, assign, blockLang, body, ci, clsOf, declared, diags, extra, fresh, inNet, init, lang, modules, name, netName,
    isolated, netType, nk, nl, outRead, used, vtype, wrapV
  } = ctx;

  const symbolCasesMore = (s, def, p, S, cmt) => {
    switch (s.type) {
      case 'add': case 'sub': {
        const io = arithIo(s.type, p);
        if (p.bits && Math.max(1, int(p.width, 1)) > 1) {
          // a pin per bit (#304, #322): the operands A<w-1> … A0, B<w-1> … B0, the result's bits S0 … / D0 …
          // through one sum / difference (its bit w the carry / the borrow)
          const w = Math.max(1, int(p.width, 1));
          const ops = g => [...Array(w).keys()].reverse().map(i => INN(s, `${g}${i}`, true));
          const outs = [...Array(w).keys()].map(i => OUTN(s, `${io.o}${i}`)), co = io.cout ? OUTN(s, io.co) : null;
          if (!outs.some(Boolean) && !co) return;
          const cin = io.cin ? INN(s, io.ci, true) : null, t = fresh(`${s.name}_${s.type === 'sub' ? 'diff' : 'sum'}`);
          if (ci) {
            extra.push({ name: t, type: `unsigned(${w} downto 0)` });
            const base = `resize(unsigned'(${ops('A').join(' & ')}), ${w + 1}) ${io.op} resize(unsigned'(${ops('B').join(' & ')}), ${w + 1})`;
            body.push(cin ? `${t} <= ${base} ${io.op} 1 when ${cin} = '1' else ${base};` : `${t} <= ${base};`);
            outs.forEach((o, i) => o && body.push(`${o} <= ${t}(${i});`));
            if (co) body.push(`${co} <= ${t}(${w});`);
          } else {
            extra.push({ name: t, width: w + 1 });
            assign(t, `{${ops('A').join(', ')}} ${io.op} {${ops('B').join(', ')}}${cin ? ` ${io.op} ${cin}` : ''}`);
            outs.forEach((o, i) => o && assign(o, `${t}[${i}]`));
            if (co) assign(co, `${t}[${w}]`);
          }
          break;
        }
        const o = OUTN(s, io.o), co = io.cout ? OUTN(s, io.co) : null;
        if (!o && !co) return;
        const a = INN(s, 'A'), b = INN(s, 'B');
        const w = Math.max(1, int(p.width, 1));
        const cin = io.cin ? INN(s, io.ci) : null;
        const op = io.op;
        if (ci) {
          // a 1-bit operand is a std_logic: unsigned'(0 => x) makes it a 1-bit vector
          const U = x => (w === 1 ? `unsigned'(0 => ${x})` : `unsigned(${x})`);
          if (!co && !cin) {
            if (o) body.push(w === 1 ? `${o} <= ${a} xor ${b};` : `${o} <= ${wrapV(`unsigned(${a}) ${op} unsigned(${b})`, clsOf(o))};`);
          } else {
            const t = fresh(`${s.name}_sum`);
            extra.push({ name: t, type: `unsigned(${w} downto 0)` });
            const base = `resize(${U(a)}, ${w + 1}) ${op} resize(${U(b)}, ${w + 1})`;
            body.push(cin ? `${t} <= ${base} ${op} 1 when ${cin} = '1' else ${base};` : `${t} <= ${base};`);
            if (o) body.push(w === 1 ? `${o} <= ${t}(0);` : `${o} <= ${wrapV(`${t}(${w - 1} downto 0)`, clsOf(o))};`);
            if (co) body.push(`${co} <= ${t}(${w});`);
          }
        } else {
          const rhs = `${a} ${op} ${b}${cin ? ` ${op} ${cin}` : ''}`;
          if (co && o) assign(`{${co}, ${o}}`, rhs);
          else if (co) { const t = fresh(`${s.name}_sum`); extra.push({ name: t, width: w + 1 }); assign(`${t}`, rhs); assign(co, `${t}[${w}]`); }
          else assign(o, rhs);
        }
        break;
      }
      case 'compare': {
        // (several comparisons, #1555: an output each, EQ … GE; one, its output O)
        const outs = compareOps(p).map(op => [op, OUTN(s, comparePin(p, op))]).filter(([, o]) => o);
        if (!outs.length) return;
        // (a pin per bit, #319: the operands made of their bits, the most significant first)
        const per = p.bits && Math.max(1, int(p.width, 1)) > 1, bw = Math.max(1, int(p.width, 1));
        const opnd = g => [...Array(bw).keys()].reverse().map(i => INN(s, `${g}${i}`, true));
        const a = per ? (ci ? `std_logic_vector'(${opnd('A').join(' & ')})` : `{${opnd('A').join(', ')}}`) : INN(s, 'A');
        const b = per ? (ci ? `std_logic_vector'(${opnd('B').join(' & ')})` : `{${opnd('B').join(', ')}}`) : INN(s, 'B');
        for (const [op, o] of outs) {
          if (ci) {
            const vo = { eq: '=', ne: '/=', lt: '<', le: '<=', gt: '>', ge: '>=' }[op];
            const cw = Math.max(1, int(p.width, 1));
            const cast = x => (cw === 1 ? `${p.signed ? 'signed' : 'unsigned'}'(0 => ${x})` : p.signed ? `signed(${x})` : `unsigned(${x})`);
            body.push(`${o} <= '1' when ${cast(a)} ${vo} ${cast(b)} else '0';`);
          } else {
            const vo = { eq: '==', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=' }[op];
            assign(o, p.signed ? `($signed(${a}) ${vo} $signed(${b}))` : `(${a} ${vo} ${b})`);
          }
        }
        break;
      }
      case 'constant': case 'vcc': case 'gnd': {
        const pin = s.type === 'constant' ? 'O' : s.type === 'vcc' ? 'P' : 'G';
        const o = OUTN(s, pin); if (!o) return;
        const n = nl.pinNet.get(`${s.id}/${pin}`);
        const w = n.width;
        let bits;
        if (s.type === 'constant') {
          bits = constBits(p.value, w);
          if (bits == null) { diags.push({ severity: 'error', message: `${s.name}: invalid constant value '${p.value}'`, ref: { kind: 'symbol', id: s.id } }); bits = '0'.repeat(w); }
        } else bits = (s.type === 'vcc' ? '1' : '0').repeat(w);
        init.set(n, bits);
        const ty = ci ? netType(n) : '';
        // (a VCC / GND with a Width, #953: every bit, (others => '1') / {N{1'b1}})
        const all = s.type !== 'constant' && constWidth(s) != null && w > 1;
        if (ci) body.push(`${o} <= ${w === 1 && vhdlClass(ty) === 'sl' ? vhdlBits(bits, true) : all ? `(others => '${bits[0]}')` : vhdlBits(bits, false)};`);
        else assign(o, all ? `{${w}{1'b${bits[0]}}}` : vlogBits(bits));
        break;
      }
      case 'slice': {
        // (a tap whose bit wire is driven by something else drives those bits of its bus, as in ISE, #1796)
        const onet = nl.pinNet.get(`${s.id}/O`), bnet = inNet(s, 'I');
        if (onet?.tapsIn?.includes(s.id) && bnet) {
          const b = netName(bnet), m = int(p.msb, 0), l = int(p.lsb, 0), one = m === l;
          if (ci) body.push(`${bnet.width === 1 ? b : one ? `${b}(${m})` : `${b}(${m} downto ${l})`} <= ${netName(onet)};`);
          else assign(bnet.width === 1 ? b : one ? `${b}[${m}]` : `${b}[${m}:${l}]`, netName(onet));
          break;
        }
        const o = OUTN(s, 'O'); if (!o) return;
        const i = INN(s, 'I', true);
        const msb = int(p.msb, 0), lsb = int(p.lsb, 0);
        const ow = Math.abs(msb - lsb) + 1;
        const outIsVec = ci ? clsOf(o) !== 'sl' : true;
        // (a tap of bit 0 of a net of one bit, a scalar: the net itself, no index, #859)
        const n1 = inNet(s, 'I');
        // (its wire named with the bits it takes, a(0) of a, as ISE names it, #1688: those bits themselves, nothing to
        // write; other bits of the same bus: an error)
        const on = nl.pinNet.get(`${s.id}/O`);
        if (on?.part && n1 && on.part.bus === n1) {
          if (on.part.msb !== msb || on.part.lsb !== lsb) diags.push({ severity: 'error', message: `bus tap ${s.name} takes ${msb === lsb ? `bit ${msb}` : `bits ${msb}..${lsb}`} of '${n1.name}' but its wire is named ${on.name}`, ref: { kind: 'symbol', id: s.id } });
          break;
        }
        if (msb === 0 && lsb === 0 && n1?.width === 1 && (!ci || clsOf(i) === 'sl')) {
          if (ci) body.push(`${outIsVec ? `${o}(0)` : o} <= ${i};`); else assign(o, i);
          break;
        }
        if (ci) body.push(`${o} <= ${ow === 1 && !outIsVec ? `${i}(${msb})` : `${i}(${msb} ${msb >= lsb ? 'downto' : 'to'} ${lsb})`};`);
        else assign(o, ow === 1 ? `${i}[${msb}]` : `${i}[${msb}:${lsb}]`);
        break;
      }
      case 'busjoin': {
        const o = OUTN(s, 'O'); if (!o) return;
        const ins = def.pins.filter(q => q.dir === 'in').map(q => INN(s, q.name));
        if (ci) body.push(`${o} <= ${ins.join(' & ')};`); else assign(o, `{${ins.join(', ')}}`);
        break;
      }
      case 'register': case 'counter': {
        // (a counter with a pin per bit, #319: its count in a signal of its own, Q0 .. its bits)
        const perQ = s.type === 'counter' && p.bits && Math.max(1, int(p.width, 1)) > 1;
        const qBits = perQ ? [...Array(Math.max(1, int(p.width, 1))).keys()].map(i => OUTN(s, `Q${i}`)) : null;
        const q = perQ ? (qBits.some(Boolean) ? fresh(`${s.name}_q`) : null) : OUTN(s, 'Q');
        if (!q) { diags.push({ severity: 'warning', message: `${s.name}: output Q not connected, skipped`, ref: { kind: 'symbol', id: s.id } }); return; }
        const has = nm => def.pins.some(x => x.name === nm);
        const c = INN(s, 'C');
        const d = has('D') ? INN(s, 'D') : null;
        // unconnected controls: CLR / R inactive, CE always enabled (left out of the logic)
        const ctl = nm => {
          if (!has(nm)) return null;
          if (!inNet(s, nm)) { diags.push({ severity: 'warning', message: `${s.name}: input ${nm} unconnected, ${nm === 'CE' ? 'always enabled' : 'inactive'}`, ref: { kind: 'symbol', id: s.id, pin: nm } }); return null; }
          return INN(s, nm);
        };
        const ce = ctl('CE'), clr = ctl('CLR'), r = ctl('R');
        const qn = perQ ? null : nl.pinNet.get(`${s.id}/Q`);
        const w = perQ ? Math.max(1, int(p.width, 1)) : qn.width;
        if (perQ) {
          if (ci) extra.push({ name: q, type: `std_logic_vector(${w - 1} downto 0)` });
          else extra.push({ name: q, width: w, reg: true });
          qBits.forEach((o, i) => o && (ci ? body.push(`${o} <= ${q}(${i});`) : assign(o, `${q}[${i}]`)));
        }
        const rv = s.type === 'counter' ? '0'.repeat(w) : (constBits(p.init ?? '0', w) || '0'.repeat(w));
        if (ci) {
          const rval = w > 1 ? (/^0+$/.test(rv) ? '(others => \'0\')' : `"${rv}"`) : `'${rv}'`;
          let tgt = q, nextv = d, lines = [];
          if (s.type === 'counter') {
            tgt = fresh(`${s.name}_cnt`);
            extra.push({ name: tgt, type: `unsigned(${w - 1} downto 0)`, init: rv });
            nextv = `${tgt} ${p.dir === 'down' ? '-' : '+'} 1`;
          }
          const upd = ce ? [`if ${ce} = '1' then`, `  ${tgt} <= ${nextv};`, 'end if;'] : [`${tgt} <= ${nextv};`];
          const rvT = s.type === 'counter' ? '(others => \'0\')' : rval;
          lines.push(cmt);
          if (clr) {
            lines.push(`process (${c}, ${clr})`, 'begin', `  if ${clr} = '1' then`, `    ${tgt} <= ${rvT};`, `  elsif rising_edge(${c}) then`, ...upd.map(l => '    ' + l), '  end if;', 'end process;');
          } else if (r) {
            lines.push(`process (${c})`, 'begin', `  if rising_edge(${c}) then`, `    if ${r} = '1' then`, `      ${tgt} <= ${rvT};`, ...(ce ? [`    elsif ${ce} = '1' then`, `      ${tgt} <= ${nextv};`] : ['    else', `      ${tgt} <= ${nextv};`]), '    end if;', '  end if;', 'end process;');
          } else {
            lines.push(`process (${c})`, 'begin', `  if rising_edge(${c}) then`, ...upd.map(l => '    ' + l), '  end if;', 'end process;');
          }
          if (s.type === 'counter') lines.push(`${q} <= ${perQ ? `std_logic_vector(${tgt})` : wrapV(tgt, clsOf(q))};`);
          body.push(lines.join('\n'));
        } else {
          const nextv = s.type === 'counter' ? `${q} ${p.dir === 'down' ? '-' : '+'} 1'b1` : d;
          const rz = vlogBits(rv);
          const lines = [cmt];
          if (clr) lines.push(`always @(posedge ${c} or posedge ${clr})`, `  if (${clr}) ${q} <= ${rz};`, `  else${ce ? ` if (${ce})` : ''} ${q} <= ${nextv};`);
          else if (r) lines.push(`always @(posedge ${c})`, `  if (${r}) ${q} <= ${rz};`, `  else${ce ? ` if (${ce})` : ''} ${q} <= ${nextv};`);
          else lines.push(`always @(posedge ${c})`, `  ${ce ? `if (${ce}) ` : ''}${q} <= ${nextv};`);
          if (s.type === 'counter' && qn) init.set(qn, rv);
          body.push(lines.join('\n'));
        }
        break;
      }
      case 'module': {
        const m = findMod(modules, p.module);
        const mname = m?.name || p.module;
        if (!mname) { diags.push({ severity: 'error', message: `${s.name}: no module selected`, ref: { kind: 'symbol', id: s.id } }); return; }
        const gens = Object.entries(p.generics || {}).filter(([, v]) => String(v ?? '').trim() !== '');
        // (a symbol of its own, #3755: its connections in the module's order, whatever its drawing's)
        const at = new Map((m?.ports || []).map((q, i) => [q.name.toLowerCase(), i]));
        const pins = p.layout && m ? [...def.pins].sort((a, b) => (at.get(a.name.toLowerCase()) ?? 1e9) - (at.get(b.name.toLowerCase()) ?? 1e9)) : def.pins;
        const conns = pins.map(q => {
          // (an output left unconnected: open, #2544)
          const pn = nl.pinNet.get(`${s.id}/${q.name}`), n = q.dir === 'out' && pn?.auto && isolated(pn) ? null : pn;
          let a = n ? (outRead.get(n) && q.dir !== 'out' ? outRead.get(n) : (q.dir === 'out' && outRead.get(n)) || netName(n)) : null;
          if (!a && q.dir !== 'out') diags.push({ severity: 'warning', message: `${s.name}: input ${q.name} of '${mname}' is unconnected`, ref: { kind: 'symbol', id: s.id, pin: q.name } });
          return [q.name, a];
        });
        if (ci) {
          const lines = [`${s.name} : entity work.${mname}`];
          if (gens.length) lines.push(`  generic map (\n${gens.map(([k, v]) => `    ${k} => ${v}`).join(',\n')}\n  )`);
          const cs = conns.filter(([, a]) => a || true).map(([k, a]) => `    ${k} => ${a ?? 'open'}`);
          if (cs.length) lines.push(`  port map (\n${cs.join(',\n')}\n  );`); else lines[lines.length - 1] += ';';   // (a module without ports, #1695)
          body.push(lines.join('\n'));
        } else {
          const g = gens.length ? ` #(${gens.map(([k, v]) => `.${k}(${v})`).join(', ')})` : '';
          body.push(`${mname}${g} ${s.name} (\n${conns.map(([k, a]) => `  .${k}(${a ?? ''})`).join(',\n')}\n);`);
        }
        break;
      }
      case 'hdlblock': {
        const code = String(s.hdl || '').replace(/\s+$/, '');
        // alias pins whose net name differs from the pin name
        const pre = [], post = [];
        for (const q of def.pins) {
          const n = nl.pinNet.get(`${s.id}/${q.name}`);
          if (!n) continue;
          // an unconnected input is tied: CE (clock enable) to 1 = always enabled, others to 0
          const open = q.dir === 'in' && !inNet(s, q.name);
          if (open) {
            const one = /^CE$/i.test(q.name), w = q.width || 1;
            diags.push({ severity: 'warning', message: `${s.name}: input ${q.name} unconnected, ${one ? 'tied to 1 (always enabled)' : 'tied to 0'}`, ref: { kind: 'symbol', id: s.id, pin: q.name } });
            const k = ci ? (w > 1 ? `(others => '${one ? 1 : 0}')` : `'${one ? 1 : 0}'`) : `{${w}{1'b${one ? 1 : 0}}}`;
            if (!declared.has(nk(q.name))) { used.add(nk(q.name)); extra.push({ name: q.name, width: w, type: ci ? vtype(w) : null }); }
            pre.push(ci ? `${hdlName(q.name, lang)} <= ${k};` : `assign ${hdlName(q.name, lang)} = ${k};`);
            continue;
          }
          const nn = q.dir !== 'out' && outRead.has(n) ? outRead.get(n) : netName(n);
          if (nk(nn) === nk(hdlName(q.name, lang))) continue;
          if (!used.has(nk(q.name)) || declared.has(nk(q.name))) {
            if (!declared.has(nk(q.name))) { used.add(nk(q.name)); extra.push({ name: q.name, width: q.width, type: ci ? vtype(q.width) : null, reg: q.reg }); }
          } else diags.push({ severity: 'warning', message: `${s.name}: pin ${q.name} is wired to net '${nn}' but '${q.name}' is also another net`, ref: { kind: 'symbol', id: s.id, pin: q.name } });
          if (q.dir === 'out') post.push(ci ? `${nn} <= ${hdlName(q.name, lang)};` : `assign ${nn} = ${hdlName(q.name, lang)};`);
          else pre.push(ci ? `${hdlName(q.name, lang)} <= ${nn};` : `assign ${hdlName(q.name, lang)} = ${nn};`);
        }
        if (!code.trim()) { diags.push({ severity: 'warning', message: `${s.name}: HDL block is empty`, ref: { kind: 'symbol', id: s.id } }); }
        const title = p.title ? ` (${p.title})` : '';
        body.push([ci ? `-- ${s.name}: HDL block${title}` : `// ${s.name}: HDL block${title}`, ...pre, blockLang === lang ? code : (ci ? '-- (HDL block code omitted: wrong language)' : '// (HDL block code omitted: wrong language)'), ...post].filter(x => x !== '').join('\n'));
        break;
      }
      default:
        diags.push({ severity: 'warning', message: `${s.name}: unknown symbol type '${s.type}' skipped`, ref: { kind: 'symbol', id: s.id } });
    }
  };

  return { symbolCasesMore };
}
