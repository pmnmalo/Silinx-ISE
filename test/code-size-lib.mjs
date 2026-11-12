// How test/code-size.test.js measures a source (#405, #3542): its lines, and every function's, wherever it is and
// whatever its form: a declaration, a function expression, an arrow function (a block's or an expression's), a
// class's or an object's method, getter or setter. A nested function is measured on its own too (and is part of the
// lines of the one around it). A small tokenizer (comments, strings, template literals, regular expressions skipped)
// pairs the brackets; a function runs from its first token's line to its body's last one.

const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'await']);
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case',
  'do', 'else', 'yield', 'await']);
const STATEMENT = new Set(['const', 'let', 'var', 'function', 'class', 'export', 'import', 'return', 'if', 'for',
  'while', 'do', 'switch', 'try', 'throw', 'break', 'continue', 'async']);
const PREFIX = new Set(['static', 'async', 'get', 'set', '*']);
const WORD = /[#\w$]+/y, WORD_START = new Set(['_', '$', '#']);
const OPEN = new Set(['(', '[', '{', '${']), END = new Set([',', ';', ')', ']', '}']);

// [{ t: 'id' | 'str' | 'num' | 'p', v, line, end }] of a source's text; a quoted string's v its text, a template
// literal's text a 'str' (its ${ an opening 'p' paired with its }), a regular expression a 'str' too
function tokenize(text) {
  const toks = [], stack = [];
  let i = 0, line = 1;
  if (text.startsWith('#!')) i = text.indexOf('\n') < 0 ? text.length : text.indexOf('\n');
  const push = (t, v, from) => toks.push({ t, v, line: from, end: line });
  const regexAllowed = () => {
    const p = toks.at(-1);
    if (!p) return true;
    if (p.t === 'id') return BEFORE_REGEX.has(p.v);
    if (p.t === 'p') return !/^(?:[)\]}]|\+\+|--)$/.test(p.v); // (x++ / 2, the postfix's)
    return false;
  };
  const template = () => { // from after ` or }, to after ` or ${
    const from = line;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '\\') { if (text[i + 1] === '\n') line++; i++; continue; }
      if (c === '\n') line++;
      else if (c === '`') { i++; push('str', '`', from); return; }
      else if (c === '$' && text[i + 1] === '{') { i += 2; push('str', '`', from); push('p', '${', line); stack.push('`'); return; }
    }
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { line++; i++; }
    else if (c === ' ' || c === '\t' || c === '\r') i++;
    else if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2), stop = e < 0 ? text.length : e + 2;
      for (; i < stop; i++) if (text[i] === '\n') line++;
    } else if (c === '"' || c === "'") {
      const from = line, at = i;
      for (i++; i < text.length && text[i] !== c && text[i] !== '\n'; i++) if (text[i] === '\\') { if (text[i + 1] === '\n') line++; i++; }
      i++; push('str', text.slice(at + 1, i - 1), from);
    } else if (c === '`') { i++; template(); }
    else if (c === '/' && regexAllowed()) {
      let cls = false;
      for (i++; i < text.length && text[i] !== '\n' && (cls || text[i] !== '/'); i++) {
        if (text[i] === '\\') i++; else if (text[i] === '[') cls = true; else if (text[i] === ']') cls = false;
      }
      for (i++; /[a-z]/.test(text[i] ?? ''); i++);
      push('str', '/', line);
    } else if (WORD_START.has(c) || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') {
      WORD.lastIndex = i;
      const m = WORD.exec(text)[0];
      i += m.length; push(/^\d/.test(m) ? 'num' : 'id', m, line);
    } else if (c === '=' && text[i + 1] === '>') { i += 2; push('p', '=>', line); }
    else if (c === '.' && text[i + 1] === '.' && text[i + 2] === '.') { i += 3; push('p', '...', line); }
    else if ((c === '+' || c === '-') && text[i + 1] === c) { i += 2; push('p', c + c, line); }
    else if (c === '{' || c === '(' || c === '[') { stack.push(c); i++; push('p', c, line); }
    else if (c === '}' && stack.at(-1) === '`') { stack.pop(); push('p', '}', line); i++; template(); }
    else { if (c === '}' || c === ')' || c === ']') stack.pop(); i++; push('p', c, line); }
  }
  return toks;
}

// the index of each bracket's pair, in both directions
function pairs(toks) {
  const match = new Array(toks.length).fill(-1), open = [];
  toks.forEach((k, i) => {
    if (k.t !== 'p') return;
    if (k.v === '(' || k.v === '[' || k.v === '{' || k.v === '${') open.push(i);
    else if (k.v === ')' || k.v === ']' || k.v === '}') {
      const o = open.pop();
      if (o === undefined || toks[o].v !== { ')': '(', ']': '[', '}': '{' }[k.v] && !(k.v === '}' && toks[o].v === '${')) {
        throw new Error(`line ${k.line}: ${k.v} does not close ${o === undefined ? 'anything' : `the ${toks[o].v} of line ${toks[o].line}`}`);
      }
      match[o] = i; match[i] = o;
    }
  });
  if (open.length) throw new Error(`line ${toks[open.at(-1)].line}: ${toks[open.at(-1)].v} never closed`);
  return match;
}

// { lines, functions: [[name, lines]] } of a source's text, the functions in the order they start; an anonymous one is
// named by what it is given to ('callback of f', 'f.then') or, failing that, by the function around it
export function measure(text) {
  const L = text.split('\n');
  const lines = L.length - (L.at(-1) === '' ? 1 : 0);
  const toks = tokenize(text), match = pairs(toks);
  const is = (k, v) => toks[k] && toks[k].t === 'p' && toks[k].v === v;
  const id = (k, v) => toks[k] && toks[k].t === 'id' && (v === undefined || toks[k].v === v);
  const fns = []; // { name, start, end } in tokens
  // the name a function expression or an arrow function starting at token s gets from where it is
  const contextName = (s) => {
    let k = s - 1;
    if ((is(k, '=') || is(k, ':')) && (id(k - 1) || toks[k - 1]?.t === 'str')) return toks[k - 1].v;
    if (is(k, '=') && is(k - 1, ']')) return 'computed';
    for (let depth = 0; k >= 0; k--) { // given to a call: the callee's name
      if (toks[k].t !== 'p') continue;
      if (/^[)\]}]$/.test(toks[k].v)) depth++;
      else if (/^[([{]$|^\$\{$/.test(toks[k].v)) {
        if (depth-- > 0) continue;
        if (toks[k].v === '(' && id(k - 1) && !CONTROL.has(toks[k - 1].v)) return `callback of ${toks[k - 1].v}`;
        return null;
      } else if (depth === 0 && /^[;]$/.test(toks[k].v)) return null;
    }
    return null;
  };
  const arrowStart = (k) => { // k: the token before =>
    let s = is(k, ')') ? match[k] : k;
    if (id(s - 1, 'async')) s--;
    return s;
  };
  toks.forEach((k, i) => {
    if (k.t !== 'p') return;
    if (k.v === '=>') {
      const s = arrowStart(i - 1);
      if (is(i + 1, '{')) fns.push({ name: contextName(s), start: s, end: match[i + 1] });
      else { // an expression's arrow function: up to a , ; or closing bracket of its level, or a new statement
        let j = i + 1;
        for (; j < toks.length; j++) {
          const t = toks[j];
          if (t.t === 'p' && OPEN.has(t.v) && match[j] > j) { j = match[j]; continue; }
          if (t.t === 'p' && END.has(t.v)) break;
          if (j > i + 1 && t.line > toks[j - 1].end && t.t === 'id' && STATEMENT.has(t.v) && !is(j - 1, '=>')) break;
        }
        fns.push({ name: contextName(s), start: s, end: j - 1 });
      }
      return;
    }
    if (k.v !== '{' || !is(i - 1, ')')) return;
    const o = match[i - 1];
    let q = o - 1, name, s;
    if (id(q, 'function') || (is(q, '*') && id(q - 1, 'function'))) { // an anonymous function expression
      s = id(q, 'function') ? q : q - 1;
      name = contextName(id(s - 1, 'async') ? s - 1 : s);
    } else if (id(q) && (id(q - 1, 'function') || (is(q - 1, '*') && id(q - 2, 'function')))) { // a named one
      s = id(q - 1, 'function') ? q - 1 : q - 2;
      name = toks[q].v;
    } else if (id(q) && !CONTROL.has(toks[q].v) || toks[q]?.t === 'str' || toks[q]?.t === 'num' || is(q, ']')) { // a method
      if (is(q, ']')) { s = match[q]; name = 'computed'; } else { s = q; name = toks[q].v; }
      if (is(s - 1, '.')) return; // a call (a(…).b(…) {), not JavaScript anyway
      if (id(s - 1, 'get') || id(s - 1, 'set')) name = `${toks[s - 1].v} ${name}`;
      while (s > 0 && (PREFIX.has(toks[s - 1].v)) && toks[s - 1].line === toks[s].line) s--;
    } else return;
    fns.push({ name, start: s, end: match[i] });
  });
  fns.sort((a, b) => a.start - b.start);
  const around = []; // the functions around the current one
  for (const f of fns) { // anonymous ones by the function around them
    while (around.length && around.at(-1).end < f.start) around.pop();
    if (!f.name) f.name = around.length ? `anonymous in ${around.at(-1).name}` : 'anonymous';
    around.push(f);
  }
  return { lines, functions: fns.map((f) => [f.name, toks[f.end].end - toks[f.start].line + 1]) };
}
