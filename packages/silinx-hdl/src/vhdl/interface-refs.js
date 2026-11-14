// A default of an interface list that uses an earlier object of the same list (#3744). VHDL-93 (LRM 4.3.2.1) does not
// allow a name of an interface object in the interface list that declares it but to declare it: the default of a
// generic must not use an earlier generic of the same entity (or component), that of a port an earlier port, that of a
// subprogram's parameter an earlier parameter (VHDL-2008 allows it). XST reports it for the Spartan-3E (its VHDL
// parser, HDLParsers):
//     ERROR:HDLParsers:3533 - "g.vhd" Line 4. Initializing Expression 'CLK_HZ' is not valid in this context as it
//     contains reference to other interface objects (LRM 4.3.2.1).
// Silinx's message also says which object's default it is and which object it uses (and the line where it is declared),
// at the line of the use:
//     Initializing expression of generic 'tick' is not valid in this context as it contains reference to other
//     interface objects (LRM 4.3.2.1): it uses generic 'clk_hz' (line 3).
// A generic of another entity or a package's constant (a selected name: pkg.c, work.pkg.c), a record's field with the
// name of an earlier object (r.clk_hz), a port's default that uses a generic (another list) are accepted, as XST does.
//
// Parser's methods (Object.assign(Parser.prototype, interfaceRefMethods) in parser.js):
//   parseInterfaceDefault(earlier, what, names) -> the default's expression, after `:=`; an error when it uses one of
//     earlier: [{ name, what, line }], the objects of the list declared before (what: 'generic', 'port', 'parameter');
//     what / names: the kind and the names of the objects it is the default of.

/** The names an expression uses (not those of a package's: pkg.c), in the order it uses them. */
function usedNames(e, out = []) {
  if (!e || typeof e !== 'object') return out;
  if (Array.isArray(e)) { for (const x of e) usedNames(x, out); return out; }
  if ((e.op === 'ref' || e.op === 'apply') && !e.pkg) out.push(e.name);
  for (const k of Object.keys(e)) if (e[k] && typeof e[k] === 'object') usedNames(e[k], out);
  return out;
}

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const interfaceRefMethods = {
  parseInterfaceDefault(earlier, what, names) {
    const from = this.i;
    const e = this.parseExpression();
    const used = usedNames(e);
    const name = used.find(n => earlier.some(o => o.name === n));
    const obj = name && earlier.find(o => o.name === name);
    if (obj) {
      // the use's token: the first of its name in the expression that is not a field or a package's (after a '.')
      let tok = this.t[from];
      for (let k = from; k < this.i; k++) {
        const t = this.t[k];
        if (t.type === 'id' && t.value === obj.name && !(k > 0 && this.t[k - 1].type === 'op' && this.t[k - 1].value === '.')) { tok = t; break; }
      }
      this.diag(`Initializing expression of ${what} '${names[0]}' is not valid in this context as it contains reference to ` +
        `other interface objects (LRM 4.3.2.1): it uses ${obj.what} '${obj.name}' (line ${obj.line}).`, tok);
    }
    return e;
  },
};
