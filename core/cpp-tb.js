// Silinx HLS C++ (#2234): a test bench's library C++, in the C simulation only: a class with std::string or std::map
// (a command-line parser, its virtual functions, its iterators) and the functions over strings cannot be flattened as
// the synthesized structs are (core/c-struct.js). They are taken out of the tokens, read by core/cpp-tb-parse.js and run
// by core/cpp-tb-run.js; what stays calls them through the interpreter's library (core/c-interp-lib.js):
//   X name;  / X name(a);        long name = ap_tb_new("X"); / ap_tb_new("X", a);
//   name.m(a, b)                 ap_tb_call(name, "m", a, b)
//   f(a) (f a function taken)    ap_tb_call(0, "f", a)
// They return numbers and strings. The synthesized function cannot reach them: ap_tb_* are not synthesizable
// (core/c-check.js). Any other use of such a class is reported. Isomorphic ES module.
//
//   cppTestBench(tokens, report) -> { tokens, program } (program null when the unit has none)
import { closing } from './cpp-template.js';
import { parseClass, parseFunction, parseDeclaration } from './cpp-tb-parse.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const LIB = new Set(['string', 'map']);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });

/** Whether tokens name std::string or std::map as a type (not a member's or a variable's name). */
const usesLib = (toks) => toks.some((t, k) => isId(t) && LIB.has(t.v) && !op(toks[k - 1], '.') && !op(toks[k - 1], '->') && (t.v === 'string' ? isId(toks[k + 1]) || ['&', '*', '>', '::'].some((v) => op(toks[k + 1], v)) : op(toks[k + 1], '<')));

/** The end of the item that starts at k: its ';' or its body's '}' (a class's ';' after it): { end, brace }. */
function itemAt(toks, k) {
  let j = k;
  for (; toks[j] && toks[j].t !== 'eof'; j++) {
    if (op(toks[j], ';')) return { end: j, brace: -1 };
    if (op(toks[j], '(')) { j = closing(toks, j); continue; }
    if (op(toks[j], '{')) {
      const c = closing(toks, j);
      return { end: op(toks[c + 1], ';') ? c + 1 : c, brace: j };
    }
  }
  return { end: j - 1, brace: -1 };
}

export function cppTestBench(toks, report) {
  const kept = [];
  const program = { classes: new Map(), functions: new Map(), classNames: new Set() };
  const taken = [];
  // the classes first, each a test bench's by its members; their names known for what names them
  const walk = (a, b, visit) => {
    for (let k = a; k < b;) {
      if (isId(toks[k], 'namespace') && isId(toks[k + 1]) && op(toks[k + 2], '{')) {
        const c = closing(toks, k + 2);
        visit({ ns: true, k, open: k + 2, close: c });
        walk(k + 3, c, visit);
        k = c + 1;
        continue;
      }
      if (toks[k].t === 'pragma') { k++; continue; }
      const { end, brace } = itemAt(toks, k);
      visit({ k, end, brace });
      k = end + 1;
    }
  };
  const n = toks.at(-1)?.t === 'eof' ? toks.length - 1 : toks.length;
  const items = [];
  walk(0, n, (it) => items.push(it));
  for (const it of items) {
    if (it.ns || !(isId(toks[it.k], 'class') || isId(toks[it.k], 'struct')) || it.brace < 0 || !isId(toks[it.k + 1])) continue;
    if (!usesLib(toks.slice(it.brace, it.end))) continue;
    program.classNames.add(toks[it.k + 1].v);
    it.tbClass = true;
    // (its nested classes' names: its methods' types)
    for (let j = it.brace; j < it.end; j++) if (isId(toks[j], 'class') && isId(toks[j + 1])) program.classNames.add(toks[j + 1].v);
  }
  if (!program.classNames.size && !items.some((it) => !it.ns && usesLib(toks.slice(it.k, it.brace >= 0 ? it.brace : it.end)))) return { tokens: toks, program: null };
  const drop = new Set();
  for (const it of items) if (it.tbClass) { parseClass(toks.slice(it.k, it.end), program, report); drop.add(it); }
  for (const it of items) {
    if (it.ns || it.tbClass) continue;
    const head = toks.slice(it.k, it.brace >= 0 ? it.brace : it.end);
    // (a variable's or a class of its own's use of a string or the class: reported, below, by what stays)
    const q = head.findIndex((t, j) => op(t, '::') && program.classNames.has(head[j - 1]?.v) && head[j + 1] && op(head[j + 2], '(') );
    const fnHead = head.some((t) => op(t, '('));
    if (!fnHead || !(usesLib(head) || head.some((t) => program.classNames.has(t.v)) || q >= 0)) continue;
    if (it.brace >= 0) parseFunction(toks.slice(it.k, it.end + 1), program, report);
    else parseDeclaration(toks.slice(it.k, it.end), program, report);
    drop.add(it);
  }
  for (const it of drop) taken.push([it.k, it.end]);
  taken.sort((a, b) => a[0] - b[0]);
  const free = new Set(program.functions.keys());
  // what stays: the classes' objects and calls
  const objects = new Set();
  let tk = 0;
  for (let k = 0; k < toks.length; k++) {
    if (tk < taken.length && k === taken[tk][0]) { k = taken[tk][1]; tk++; continue; }
    const t = toks[k];
    // (std::x / sda::utils::X before a name of the program's: the qualifier goes with cppTokens's; its class seen below)
    if (isId(t) && program.classNames.has(t.v) && !op(toks[k + 1], '::')) {
      const nameTok = toks[k + 1];
      if (isId(nameTok) && (op(toks[k + 2], ';') || op(toks[k + 2], '('))) {
        while (kept.length >= 2 && op(kept.at(-1), '::') && isId(kept.at(-2))) kept.length -= 2;
        objects.add(nameTok.v);
        const c = op(toks[k + 2], '(') ? closing(toks, k + 2) : k + 1;
        const args = op(toks[k + 2], '(') ? toks.slice(k + 3, c) : [];
        kept.push(L(t, 'long', 'id'), nameTok, L(t, '='), L(t, 'ap_tb_new', 'id'), L(t, '('), L(t, t.v, 'str'), ...(args.length ? [L(t, ','), ...args] : []), L(t, ')'));
        k = c;
        continue;
      }
      report(t, `the test bench's class '${t.v}' (its strings and maps run only in the C simulation): only an object of it, ${t.v} name; and name.method(…)`);
      continue;
    }
    if (isId(t) && objects.has(t.v) && op(toks[k + 1], '.') && isId(toks[k + 2]) && op(toks[k + 3], '(')) {
      const c = closing(toks, k + 3);
      const args = toks.slice(k + 4, c);
      kept.push(L(t, 'ap_tb_call', 'id'), L(t, '('), t, L(t, ','), L(t, toks[k + 2].v, 'str'), ...(args.length ? [L(t, ',')] : []));
      // (its arguments may call the objects too)
      const inner = cppCalls(args, objects, free);
      kept.push(...inner, toks[c]);
      k = c;
      continue;
    }
    if (isId(t) && free.has(t.v) && op(toks[k + 1], '(')) {
      kept.push(L(t, 'ap_tb_call', 'id'), L(t, '('), L(t, '0', 'num'), L(t, ','), L(t, t.v, 'str'), ...(op(toks[k + 2], ')') ? [] : [L(t, ',')]));
      k++;
      continue;
    }
    kept.push(t);
  }
  return { tokens: kept, program };
}
/** The object calls inside an argument list. */
function cppCalls(toks, objects, free) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (isId(t) && objects.has(t.v) && op(toks[k + 1], '.') && isId(toks[k + 2]) && op(toks[k + 3], '(')) {
      out.push(L(t, 'ap_tb_call', 'id'), L(t, '('), t, L(t, ','), L(t, toks[k + 2].v, 'str'), ...(op(toks[k + 4], ')') ? [] : [L(t, ',')]));
      k += 3;
      continue;
    }
    if (isId(t) && free.has(t.v) && op(toks[k + 1], '(')) {
      out.push(L(t, 'ap_tb_call', 'id'), L(t, '('), L(t, '0', 'num'), L(t, ','), L(t, t.v, 'str'), ...(op(toks[k + 2], ')') ? [] : [L(t, ',')]));
      k++;
      continue;
    }
    out.push(t);
  }
  return out;
}
