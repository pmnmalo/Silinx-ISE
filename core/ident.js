// The identifier rules, one copy of each (#3545: the same expression was written in some twenty modules). No Node or
// DOM API: the page, the server and the MCP server import it.

/** A name the interface gives a design's object (a module, a port, a drawing's signal, a test bench's
 *  name…): a letter, then letters, digits and _ (a basic identifier of VHDL's and Verilog's characters alike). The
 *  modules that also refuse __ and a last _ (VHDL's rule) check that after it. */
export const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
export const isName = s => NAME_RE.test(s);

/** An identifier that may begin with _ (Verilog's, C's, a Yosys name's last part, XST's top module). */
export const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const isIdent = s => IDENT_RE.test(s);

/** A new source's file name (its base, before the extension): a letter, then letters, digits, _ and -. */
export const FILE_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** A project's name (its folder's): a letter, then up to 63 letters, digits, _ and - (FILE_RE's characters, at most 64);
 *  its message, a name made from a file's and the same name in another case: core/project-name.js (#3538). */
export const PROJECT_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
