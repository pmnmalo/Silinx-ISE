// Silinx - the Verilog parser's definitions (#405: out of core/verilog/parser.js): the gate and wired net kinds, the
// operators' precedence, the SystemVerilog atom types, the port nets, the system tasks without arguments, the
// recovery error.


export const GATES = new Set(['and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buf', 'bufif0', 'bufif1', 'notif0', 'notif1']);
// net types with their own resolution (wired and / or, pull-down / pull-up when undriven)
export const WIRED = { wand: 'and', triand: 'and', wor: 'or', trior: 'or', tri0: 'tri0', tri1: 'tri1' };
export const BIN_PREC = [
  ['||'], ['&&'], ['|'], ['^', '~^'], ['&'], ['==', '!=', '===', '!=='],
  ['<', '<=', '>', '>='], ['<<', '>>', '<<<', '>>>'], ['+', '-'], ['*', '/', '%'], ['**'],
];
export const UNARY = new Set(['!', '~', '-', '+', '&', '|', '^', '~&', '~|', '~^']);
// SystemVerilog data types that are not Verilog-2001 keywords: identifiers everywhere else (a
// Verilog-2001 design may name a signal `bit`); int / shortint / longint / byte are signed
export const ATOMS = { int: 32, shortint: 16, longint: 64, byte: 8 };
export const TYPEWORDS = new Set(['bit', ...Object.keys(ATOMS)]);
// nets of a port declaration (input wor x): the wired ones resolve their drivers (WIRED)
export const PORT_NETS = ['wire', 'reg', 'logic', 'tri', 'var', 'supply0', 'supply1', ...Object.keys(WIRED)];
// immediate and concurrent assertions (assert (e); assert property (e);)
export const ASSERTIONS = new Set(['assert', 'assume', 'cover', 'restrict']);
// system functions and tasks written without parentheses ($time, $finish;): never an identifier
export const SYS_NOARG = new Set(['$time', '$stime', '$realtime', '$random', '$urandom', '$finish', '$stop', '$display', '$write', '$monitor', '$strobe',
  '$fflush', '$dumpvars', '$dumpon', '$dumpoff', '$dumpall', '$dumpflush', '$monitoron', '$monitoroff', '$info', '$warning', '$error', '$fatal', '$root', '$unit']);
export const lit1 = b => ({ op: 'lit', bits: b, signed: false, sized: true });

export class Sync extends Error {}
