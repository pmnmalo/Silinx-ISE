// VHDL statement labels with the name of another declaration (#192). The label of a concurrent
// statement (a process, an instance, a block, a generate, a concurrent assignment / assertion /
// procedure call) is declared in the region around it: the architecture (with its entity's ports,
// generics and declarations), a block or a generate (with its parameter). A name declared there
// too (a signal, a port, a constant, a type, an enumeration literal, a component, a subprogram…)
// is a redeclaration, as XST reports it for the Spartan-3E (its VHDL parser, HDLParsers):
//     ERROR:HDLParsers:1202 - "top.vhd" Line 11. Redeclaration of symbol b1.
// at the line where the statement ends (its `;`: `end process p;`, `end generate g;`, the last
// line of an instance or an assignment), a block's at its label. The label of an earlier statement
// of the region (two statements with one label) too, at the label of the second. Silinx's message also says what
// the label names and what it clashes with:
//     Redeclaration of symbol b1: the label of the instance (line 11) is also the name of signal 'b1' (line 9).
// A name of an outer region (a signal of the architecture labelling a statement of a generate or a
// block), of a library unit (the entity of an instance, a component of a package) or of the
// architecture / entity itself is not reported, as XST does not; neither are the labels of
// sequential statements (loops, ifs… in a process or a subprogram), which XST accepts with the
// name of a variable (ISim and XST's new parser make that an error, HDLCompiler:32).
//
//   declaredNames(decls) -> [{ name, what, line }]   the names declared by IR declarations
//   interfaceNames(unit) -> [{ name, what, line }]   the generics and ports of an entity
//   labelErrors(labels, names, file) -> [{ file, line, col, severity, message, tool, check }]
//     labels: [{ name, written, what, line, col, at: { line, col } }] in source order (written:
//     as written, which the message shows, as XST; what: 'process', 'instance'…; at: where it is
//     reported), names: [{ name, what, line, file? }] of the region
//     (file: when another one)
//
// Isomorphic module (browser + Node).

export const LABEL_CHECK = 'label-name';

/** The names declared by IR declarations (core/vhdl/parser.js), with what they are. */
export function declaredNames(decls) {
  const out = [];
  for (const d of decls || []) {
    const line = d.loc?.line ?? null;
    switch (d.kind) {
      case 'signal': out.push({ name: d.name, what: d.net === 'variable' ? 'shared variable' : 'signal', line }); break;
      case 'const': out.push({ name: d.name, what: 'constant', line }); break;
      case 'file': out.push({ name: d.name, what: 'file', line }); break;
      case 'alias': case 'subalias': out.push({ name: d.name, what: 'alias', line }); break;
      case 'function': if (!/^"/.test(d.name)) out.push({ name: d.name, what: d.returnType ? 'function' : 'procedure', line }); break;
      case 'type':
        out.push({ name: d.name, what: 'type', line });
        if (d.type?.kind === 'enum') for (const v of d.type.values) if (!v.startsWith("'")) out.push({ name: v, what: 'enumeration literal', line });
        break;
      default:
    }
  }
  return out;
}

/** The generics and ports of an entity (IR unit), with what they are. */
export const interfaceNames = u => [...(u.params || []).map(p => ({ name: p.name, what: 'generic', line: p.loc?.line ?? null })),
  ...(u.ports || []).map(p => ({ name: p.name, what: 'port', line: p.loc?.line ?? null }))];

/**
 * The labels that have the name of a declaration of their region (the first one of that name), or
 * of a label before them (`labels`: false, not checked), in source order.
 */
export function labelErrors(labels, names, file, { labels: again = true } = {}) {
  const out = [];
  const byName = new Map(), seen = new Map();
  for (const n of names) if (!byName.has(n.name)) byName.set(n.name, n);
  const error = (l, at, n) => {
    const where = n.line != null ? ` (line ${n.line}${n.file && n.file !== file ? ` of ${n.file}` : ''})` : '';
    out.push({ file, line: at.line, col: at.col, severity: 'error',
      message: `Redeclaration of symbol ${l.written ?? l.name}: the label of the ${l.what} (line ${l.line}) is also the name of ${n.what} '${n.name}'${where}.`,
      tool: 'HDLParsers:1202', check: LABEL_CHECK });
  };
  for (const l of labels) {
    // (XST: the label of an earlier statement at the label, a declaration where the statement ends)
    if (again && seen.has(l.name)) error(l, l, seen.get(l.name));
    else if (byName.has(l.name)) error(l, l.at, byName.get(l.name));
    if (!seen.has(l.name)) seen.set(l.name, { name: l.name, what: 'label', line: l.line });
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}
