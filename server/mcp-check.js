// The MCP server's Check of a drawing (server/mcp.js, #2674, #2803), as its editor's toolbar checks it: an ASM chart's
// Validate (core/asm.js), a state diagram's Check (core/fsm.js validateFsm), a Petri net's Check (core/petri-analysis.js
// checkPetri: its validation and its token game's transitions that never fire and deadlocks). The schematics' check is
// check_syntax's (the HDL generated from them).
import { toolError, STR, PROJECT, projectText } from './mcp-util.js';

const KINDS = [
  { re: /\.asm\.json$/i, what: 'Validate', check: async m => (await import('../core/asm.js')).validate(m) },
  { re: /\.fsm\.json$/i, what: 'Check State Diagram', check: async m => (await import('../core/fsm.js')).validateFsm(m) },
  { re: /\.pn\.json$/i, what: 'Check Petri Net', check: async m => (await import('../core/petri-analysis.js')).checkPetri(m) },
];
// the item a message is about (the editor selects it when the message is clicked)
const itemOf = d => d.ref?.id ?? d.nodeId ?? d.state ?? d.transition ?? null;

/** A drawing's Check (its model, `file` its path): { lines: the console's, errors, warnings: { message, item } } (null: not
 *  a drawing checked here). Also a shared drawing's after a merge (#3183, follow_project). */
export async function checkDrawing(file, m) {
  const kind = KINDS.find(k => k.re.test(file));
  if (!kind) return null;
  const diags = (await kind.check(m)).filter(d => d.severity === 'error' || d.severity === 'warning');
  const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity === 'warning');
  const base = file.split('/').pop();
  const lines = [...diags.map(d => `${d.severity === 'error' ? 'ERROR' : 'WARNING'}: ${d.message}`),
    errors.length ? `Process "${kind.what}" of ${base} failed (${errors.length} error(s), ${warnings.length} warning(s)).`
      : `Process "${kind.what}" of ${base} completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`];
  const json = d => ({ message: d.message, item: itemOf(d) });
  return { lines, errors: errors.map(json), warnings: warnings.map(json) };
}

export const CHECK_TOOLS = [
  {
    name: 'check_drawing', title: 'Check a drawing',
    description: 'Check an ASM chart (.asm.json: its Validate), a state diagram (.fsm.json) or a Petri net (.pn.json: its token game too, the transitions that never fire and the deadlocks) as its editor\'s Check does: its errors and warnings, each with the item it is about. A schematic is checked by check_syntax.',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: STR('The drawing, a path in the project (src/ctl.pn.json).') }, required: ['project', 'file'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file }) {
      const kind = KINDS.find(k => k.re.test(file));
      if (!kind) throw toolError(`'${file}' is not an ASM chart, a state diagram or a Petri net (.asm.json, .fsm.json, .pn.json)`);
      let m;
      const text = await projectText(name, file, `no drawing '${file}' in the project '${name}'`);
      try { m = JSON.parse(text); } catch { throw toolError(`no drawing '${file}' in the project '${name}'`); }
      const { lines, errors, warnings } = await checkDrawing(file, m);
      return { text: lines.join('\n'), data: { project: name, file, ok: !errors.length, errors, warnings }, isError: false };
    },
  },
];
