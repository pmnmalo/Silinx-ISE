// The NAND and NOR forms with NAND / NOR gates only (#3785): a complement is a NAND (NOR) with its inputs tied,
// /(a·a), /(a + a), in every notation the editor shows, never a plain /a; the forms equal the table on every row it
// cares about (every function of up to 3 inputs, random ones of 4 to 6); their schematic has NAND (NOR) gates only,
// also for an output in that form among outputs in other forms; its HDL compiles, elaborates with no diagnostic and
// simulates to the table, in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOutput, exprColumn, formatExpr, newTable, parseExpr, truthTableFromModule } from '../core/logic.js';
import { schematicFromTable, schematicErrors } from '../core/logic-sch.js';
import { generateHdl } from '../core/schdoc.js';
import { compile, elaborate } from '../core/compile.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const randCol = (r, n, pdc) => Array.from({ length: 1 << n }, () => { const x = r(); return x < pdc ? 'X' : x < pdc + (1 - pdc) / 2 ? '1' : '0'; }).join('');
const V = n => 'abcdef'.slice(0, n).split('');
const careEqual = (col, got) => [...col].every((c, i) => c === 'X' || c === got[i]);
// (an independent evaluation of a parsed expression, row r with inputs[0] its most significant bit)
const evalAt = (e, inputs, r) => {
  const n = inputs.length, ev = x => {
    switch (x.t) {
      case 'var': return (r >> (n - 1 - inputs.indexOf(x.name))) & 1;
      case 'const': return x.v;
      case 'not': return 1 - ev(x.a);
      case 'and': return x.args.every(ev) ? 1 : 0;
      case 'or': return x.args.some(ev) ? 1 : 0;
      default: throw new Error(x.t);
    }
  };
  return ev(e);
};
const columnOf = (e, inputs) => Array.from({ length: 1 << inputs.length }, (_, r) => evalAt(e, inputs, r)).join('');
// the parsed text has NAND (NOR) gates only: every NOT the complement of an AND (OR) of 2 or more operands, no other
// AND (OR) and no other operator; a variable or a constant alone is no gate
function onlyGate(e, g) {
  const base = g === 'nand' ? 'and' : 'or';
  if (e.t === 'var' || e.t === 'const') return true;
  if (e.t !== 'not' || e.a.t !== base || e.a.args.length < 2) return false;
  return e.a.args.every(k => k.t === 'var' || k.t === 'const' || onlyGate(k, g));
}

const COLS = [];
for (let n = 1; n <= 3; n++) for (let f = 0; f < 2 ** (1 << n); f++) COLS.push([n, f.toString(2).padStart(1 << n, '0')]);
{ const r = rng(3785); for (let n = 4; n <= 6; n++) for (let k = 0; k < 15; k++) COLS.push([n, randCol(r, n, k % 3 ? 0.15 : 0)]); }

test('#3785 the NAND and NOR forms: NAND (NOR) gates only in every notation, equal to the table (every function of 1-3 inputs, random ones of 4-6)', () => {
  for (const [n, col] of COLS) {
    const inputs = V(n), a = analyzeOutput({ ...newTable('m', inputs, ['f']), table: { f: col } }, 'f');
    for (const g of ['nand', 'nor']) {
      const ast = a[g].ast;
      assert.ok(careEqual(col, exprColumn(ast, inputs)), `${g} of ${col}`);
      for (const nt of ['slash', 'slash-compact', 'textbook', 'compact', 'ascii']) {
        const text = formatExpr(ast, nt), e = parseExpr(text, { vars: inputs });
        assert.ok(onlyGate(e, g), `${g} ${nt} of ${col}: ${text}`);
        assert.ok(careEqual(col, columnOf(e, inputs)), `${g} ${nt} of ${col}: ${text} = ${columnOf(e, inputs)}`);
      }
    }
  }
});

test('#3785 the NAND and NOR forms: a complement written /(a.a), /(a + a), the outer one too, exactly', () => {
  const forms = (col, inputs = ['a', 'b']) => { const a = analyzeOutput({ ...newTable('m', inputs, ['f']), table: { f: col } }, 'f'); return [formatExpr(a.nand.ast, 'slash'), formatExpr(a.nor.ast, 'slash')]; };
  // f = /a, f = a
  assert.deepEqual(forms('1100'), ['/(a.a)', '/(a + a)']);
  assert.deepEqual(forms('0011'), ['/(/(a.a)./(a.a))', '/(/(a + a) + /(a + a))']);
  // f = /a + b: /(a·/b); its POS the same sum: /(/(/(a + a) + b) + /(/(a + a) + b))
  assert.deepEqual(forms('1101'), ['/(a./(b.b))', '/(/(/(a + a) + b) + /(/(a + a) + b))']);
  // f = a·b + /c (#694's): /(c./(a.b)); its POS (a + /c)·(b + /c)
  assert.deepEqual(forms('10101011', ['a', 'b', 'c']), ['/(c./(a.b))', '/(/(a + /(c + c)) + /(b + /(c + c)))']);
  // the textbook notation and the HDL: a NAND of its tied inputs, a nand a
  const a = analyzeOutput({ ...newTable('m', ['a', 'b'], ['f']), table: { f: '1101' } }, 'f');
  assert.deepEqual([formatExpr(a.nand.ast, 'textbook'), formatExpr(a.nand.ast, 'compact'), formatExpr(a.nand.ast, 'vhdl'), formatExpr(a.nand.ast, 'verilog')],
    ["(a·(b·b)')'", "(a(bb)')'", 'a nand (b nand b)', '~(a & ~(b & b))']);
});

// the schematic's HDL compiled, elaborated with no diagnostic and simulated to the table
function simulatesTo(sch, doc, lang, what) {
  assert.deepEqual(schematicErrors(sch).map(e => e.message), [], what);
  const g = generateHdl(sch, { lang });
  // (the one warning: an input no output uses, its marker unconnected)
  const unused = doc.inputs.filter(v => !doc.outputs.some(o => { const c = doc.table[o], j = doc.inputs.indexOf(v), b = 1 << (doc.inputs.length - 1 - j);
    return [...c].some((x, r) => x !== 'X' && c[r ^ b] !== 'X' && x !== c[r ^ b]); }));
  assert.deepEqual(g.diagnostics.map(d => `${d.severity}: ${d.message}`), unused.map(v => `warning: I/O marker '${v}' is not connected`), what);
  const path = `${doc.name}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  const lib = compile([{ path, text: g.code }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, doc.name).diags].map(d => `${d.severity}: ${d.message}`), [], what);
  const t = truthTableFromModule([{ path, text: g.code }], doc.name);
  assert.deepEqual(t.warnings, [], what);
  for (const o of doc.outputs) assert.ok(careEqual(doc.table[o], t.table[o]), `${what} ${o}: ${doc.table[o]} vs ${t.table[o]}`);
}

test('#3785 the schematic of the NAND and NOR forms: NAND (NOR) gates only, no INV nor BUF, simulated to the table in VHDL and Verilog', () => {
  const r = rng(37851);
  const cases = [];
  for (let k = 0; k < 16; k++) cases.push({ n: 1 + (k % 5), cols: Array.from({ length: 1 + (k % 3) }, () => null) });
  // a lone input, its complement, constants
  cases.push({ n: 2, cols: ['0011', '1100', '0000', '1111'] });
  for (const [k, c] of cases.entries()) {
    const outs = ['x', 'y', 'z', 'w'].slice(0, c.cols.length);
    for (const g of ['nand', 'nor']) {
      const doc = newTable(`s${k}${g}`, V(c.n), outs);
      outs.forEach((o, i) => { doc.table[o] = c.cols[i] || randCol(r, c.n, 0.1); });
      const lang = k % 2 ? 'verilog' : 'vhdl';
      const sch = schematicFromTable(doc, { form: g, lang });
      const types = [...new Set(sch.symbols.map(s => s.type))];
      assert.ok(types.every(t => new RegExp(`^${g}[234]$|^constant$`).test(t)), `${g} only: ${types}`);
      simulatesTo(sch, doc, lang, `${g} ${k}`);
    }
  }
});

test('#3785 an output in the NAND (NOR) form among outputs in other forms: its inverters NANDs (NORs) of its own, the others\' INVs', () => {
  for (const lang of ['vhdl', 'verilog']) {
    // f = /a + b in the NAND form, g = /a·/c in its minimal SOP (INVs on the rails of a and c), h = /b in the NOR form
    const doc = { ...newTable(`mix_${lang}`, ['a', 'b', 'c'], ['f', 'g', 'h']), table: { f: '11110011', g: '10100000', h: '11001100' }, form: 'sop', forms: { f: 'nand', h: 'nor' } };
    const sch = schematicFromTable(doc, { lang });
    simulatesTo(sch, doc, lang, `mixed ${lang}`);
    // the gates driving f and h: NANDs and NORs only (their inverted inputs not taken from the INV rails)
    const types = sch.symbols.map(s => s.type).sort();
    assert.ok(types.includes('nand2') && types.includes('nor2'), types.join(' '));
    // f: /(a./(b.b)), /b a NAND of its own: two NAND2 (one of them tied); h = /(b + b): one NOR2 tied; g's INVs only
    assert.deepEqual(types.filter(t => /^n(and|or)|^inv/.test(t)), ['inv', 'inv', 'nand2', 'nand2', 'nor2']);
  }
});
