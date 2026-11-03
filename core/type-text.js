// The text of a declared type, as the editor's hover and the New Source wizard's test bench write it (out of
// web/js/editor.js, #2674, so that the server writes it too): a range, a short expression, a type.
function rangeText(r, lang) {
  if (!r) return '';
  const t = e => exprShort(e);
  if (r.of) return `${t(r.of)}'range`;
  return lang === 'vhdl' ? `(${t(r.left)} ${r.dir || 'downto'} ${t(r.right)})` : `[${t(r.left)}:${t(r.right)}]`;
}
export function exprShort(e) {
  if (!e) return '?';
  switch (e.op) {
    case 'int': return e.value;
    case 'ref': return e.name;
    case 'binary': return `${exprShort(e.a)}${e.o === '==' ? '=' : e.o}${exprShort(e.b)}`;
    case 'lit': return `"${e.bits}"`;
    case 'apply': return `${e.name}(..)`;
    case 'attr': return `${exprShort(e.prefix)}'${e.attr}`;
    default: return '…';
  }
}
export function typeText(ts, lang) {
  if (!ts) return '';
  switch (ts.kind) {
    case 'logic':
      if (lang === 'vhdl') return ts.range ? `${ts.signed ? 'signed' : 'std_logic_vector'}${rangeText(ts.range, lang)}` : 'std_logic';
      return `${ts.signed ? 'signed ' : ''}${ts.range ? rangeText(ts.range, lang) : '1 bit'}`;
    case 'integer': return ts.range ? `integer range ${exprShort(ts.range.left)} to ${exprShort(ts.range.right)}` : 'integer';
    case 'named': return ts.name + (ts.range ? rangeText(ts.range, lang) : '');
    case 'array': return `array ${rangeText(ts.range, lang)} of ${typeText(ts.elem, lang)}`;
    case 'enum': return `(${ts.values.join(', ')})`;
    default: return ts.kind;
  }
}
