// Silinx HLS (#1575): a parsed C expression or simple statement back to text, as it would be written (parentheses where
// the operators' precedence needs them), for the state machine's ASM chart (core/c-asm.js). Isomorphic ES module.
//
//   exprText(e) -> 'a + b * (c - 1)'      stmtText(s) -> 'x = a[i] + 1' (a decl: 'int x = 3'; a stream's read: 't = in.read()')

const PREC = {
  ',': 1, '=': 2, '?': 3, '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '==': 9, '!=': 9, '<': 10, '>': 10, '<=': 10, '>=': 10,
  '<<': 11, '>>': 11, '+': 12, '-': 12, '*': 13, '/': 13, '%': 13, unary: 14, postfix: 15,
};
const prec = (e) => {
  switch (e?.kind) {
    case 'comma': return PREC[','];
    case 'assign': return PREC['='];
    case 'cond': return PREC['?'];
    case 'binary': return PREC[e.op] ?? 12;
    case 'unary': case 'cast': case 'sizeof': return PREC.unary;
    case 'postfix': case 'index': case 'call': case 'member': return PREC.postfix;
    default: return 16;
  }
};

/** The text of a type as declared: int, unsigned char, ap_uint<8>, bool. */
export function typeText(t) {
  if (!t) return '';
  if (t.kind === 'int') {
    if (t.ap) return `ap_${t.signed ? '' : 'u'}int<${t.bits ?? (t.widthExpr ? exprText(t.widthExpr) : '?')}>`;
    return t.name || 'int';
  }
  if (t.kind === 'ptr') return `${typeText(t.to)} *`;
  if (t.kind === 'array') return typeText(t.of);
  return t.name || t.kind;
}

export function exprText(e, min = 0) {
  if (!e) return '';
  const p = prec(e);
  const wrap = (s) => (p < min ? `(${s})` : s);
  switch (e.kind) {
    case 'num': return e.text ?? String(e.value);
    case 'float': return e.text;
    case 'chr': return e.text ?? `'${String.fromCharCode(Number(e.value))}'`;
    case 'str': return JSON.stringify(e.value);
    case 'id': return e.name;
    case 'binary': return wrap(`${exprText(e.l, p)} ${e.op} ${exprText(e.r, p + 1)}`);
    case 'assign': return wrap(`${exprText(e.l, p + 1)} ${e.op} ${exprText(e.r, p)}`);
    case 'cond': return wrap(`${exprText(e.c, p + 1)} ? ${exprText(e.a, p)} : ${exprText(e.b, p)}`);
    case 'comma': return wrap(`${exprText(e.l, p)}, ${exprText(e.r, p + 1)}`);
    case 'unary': { const x = exprText(e.e, p); return wrap(`${e.op}${/[-+&*!~]/.test(e.op) && x.startsWith(e.op[0]) ? `(${x})` : x}`); }
    case 'postfix': return wrap(`${exprText(e.e, p)}${e.op}`);
    case 'cast': return wrap(`(${typeText(e.type)})${exprText(e.e, p)}`);
    case 'sizeof': return wrap(e.type ? `sizeof(${typeText(e.type)})` : `sizeof ${exprText(e.e, p)}`);
    case 'index': return wrap(`${exprText(e.e, p)}[${exprText(e.i)}]`);
    case 'call': return wrap(`${exprText(e.callee, p)}(${e.args.map((a) => exprText(a, PREC['='])).join(', ')})`);
    case 'member': return wrap(`${exprText(e.e, p)}${e.arrow ? '->' : '.'}${e.name}`);
    default: return `<${e.kind}>`;
  }
}

/** A simple statement's text (no ';'): an expression, a declaration, a return. */
export function stmtText(s) {
  if (!s) return '';
  switch (s.kind) {
    case 'expr': return exprText(s.e);
    case 'decl': return s.vars.map((v) => `${v.static ? 'static ' : ''}${typeText(v.type)} ${v.name}${v.type?.kind === 'array' ? `[${v.type.length ?? ''}]` : ''}${v.init && v.init.kind !== 'init' ? ` = ${exprText(v.init, PREC['='])}` : v.init ? ' = { … }' : ''}`).join('; ');
    case 'return': return s.e ? `return ${exprText(s.e)}` : 'return';
    case 'break': case 'continue': return s.kind;
    // (a stream's read and write, core/c-fifo.js: the value read in its register, #1941)
    case 'fiforead': return `${s.tmp} = ${s.fifo}.read()`;
    case 'fifowrite': return `${s.fifo}.write(${exprText(s.v)})`;
    default: return `<${s.kind}>`;
  }
}
