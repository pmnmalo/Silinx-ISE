// The MCP server's tool of a truth table's outputs (server/mcp.js, #2674): set_output_logic, what the Boolean Algebra
// editor's tick box on a result (an output's HDL logic, #2951) and its Karnaugh map's solution selector (the minimal
// solution used, #2950) do, through the same function (core/logic-choice.js setOutputLogic); the table written and its
// HDL file made again, as write_file does.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

const FORMS_TEXT = 'sop (minimal SOP), pos (minimal POS), xor (the XOR form when simpler, else the minimal SOP), nand, nor (NAND / NOR gates only), gates (the form of least gates), delay (of least delay), csop, cpos (the canonical SOP / POS)';

export const TABLE_TOOLS = [
  {
    name: 'set_output_logic', title: 'Set a truth table output\'s HDL logic or minimal solution',
    description: `Set what a Boolean algebra / truth table (.bool.json, .tt.json) generates for one output, as its editor's tick box on a result and its Karnaugh map's solution selector do: its HDL logic, the form of its expression in the table's HDL module and schematic (${FORMS_TEXT}; a new output: gates), and / or the minimal solution its SOP or POS uses when it has several ({ "sop": k } or { "pos": k }, k from 0 as related_view's results list them). The table is written and its HDL file made again. Returns the output's expression in its HDL.`,
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The truth table: a .bool.json or .tt.json file of the project.'), output: STR('The output\'s name.'),
      form: { type: 'string', enum: ['sop', 'pos', 'xor', 'nand', 'nor', 'gates', 'delay', 'csop', 'cpos'], description: 'The output\'s HDL logic.' },
      solution: { type: 'object', properties: { sop: { type: 'integer', minimum: 0 }, pos: { type: 'integer', minimum: 0 } }, additionalProperties: false, description: 'The minimal solution used, from 0: { "sop": k } and / or { "pos": k }.' },
    }, required: ['project', 'path', 'output'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, output, form, solution }) {
      await readProject(name);
      if (!/\.(tt|bool)\.json$/i.test(rel)) throw toolError(`${rel}: a truth table (.bool.json, .tt.json) has outputs`);
      if (form === undefined && solution === undefined) throw toolError('form or solution: what to set');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const L = await import('../core/logic.js');
      let doc;
      try { doc = L.setOutputLogic(JSON.parse(text), output, { form, solution }); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const errs = L.validateTable(doc).filter(x => x.severity === 'error');
      if (errs.length) throw toolError(`${rel}: ${errs.map(x => x.message).join('; ')}`);
      await P.writeFile(name, rel, JSON.stringify(doc, null, 2));   // (as its editor saves it)
      const { syncDrawing } = await import('./drawing-sync.js');
      const sync = await syncDrawing(P, name, rel);
      const r = L.outputForm(doc, output), f = L.formOf(doc, output);
      const expr = `${output} = ${L.formatExpr(r.ast, 'slash')}`;
      return { text: [`${rel}: ${output}'s HDL logic: ${L.FORM_NAMES[f]}: ${expr}   (${r.what})`, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, output, form: f, solutions: doc.solutions?.[output] || {}, expr, what: r.what, ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
