// The VHDL parser's shared definitions (#405: out of parser.js): the parse error, the small IR helpers (a block, a
// waveform's assignments), the logic types, keywords, severities and libraries it knows.

export class ParseError extends Error {}

// --- small IR helpers --------------------------------------------------------

export const block = (stmts, loc) => ({ kind: 'block', label: null, decls: [], stmts, loc });
// One nonblocking assignment per waveform element. The first carries the delay mechanism
// (`mech`: 'transport' | { reject } | absent = inertial); the others only append (`waveCont`).
export function waveAssigns(wave, target, mech, loc) {
  const out = [];
  wave.forEach((w, k) => {
    if (w.unaffected) return;
    const a = { kind: 'assign', target, value: w.value, nonblocking: true, delay: w.delay, loc };
    if (mech) a.mech = mech;
    if (k > 0) a.waveCont = true;
    out.push(a);
  });
  return out;
}

export const SCALAR_LOGIC = new Set(['std_logic', 'std_ulogic', 'bit']);
export const VECTOR_LOGIC = new Set(['std_logic_vector', 'std_ulogic_vector', 'bit_vector', 'unsigned', 'signed',
  'unresolved_unsigned', 'unresolved_signed', 'u_unsigned', 'u_signed']);
export const INT_MAX = '2147483647';
export const SEVERITIES = new Set(['note', 'warning', 'error', 'failure']);
export const DECL_KWS = new Set(['signal', 'constant', 'variable', 'shared', 'type', 'subtype', 'component',
  'function', 'procedure', 'pure', 'impure', 'attribute', 'alias', 'file', 'use', 'group', 'disconnect']);
// (the VHDL-2008 matching operators ?= ?/= carry a non-enumerable `match` flag: '-' matches anything)
export const STD_LIBS = new Set(['ieee', 'std']);
