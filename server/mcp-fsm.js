// The MCP server's tool of a state diagram's outputs (server/mcp.js, #2674): a state's or a transition's outputs set
// as its editor's Properties set them (#3814, web/js/fsm-side.js): a value per output of the machine, checked by the
// same function (core/fsm-outputs.js setOutputValues: an output the machine has, a constant that fits in its width),
// an empty one cleared (its default); the diagram written as its editor saves it and its HDL file made again.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

export const FSM_TOOLS = [
  {
    name: 'set_fsm_outputs', title: 'Set a state\'s or a transition\'s outputs (state diagram)',
    description: 'Set the outputs of a state (Moore) or of a transition (Mealy) of a state diagram (.fsm.json), as its editor\'s Properties do: a value per output of the machine (a constant, e.g. 1, 5, 4\'b1010, that fits in the output\'s width), an empty value clears it (the state: the output\'s default; the transition: the state\'s value). A value refused is not written, with the reason. The diagram is written and its HDL file made again.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The state diagram: a .fsm.json file of the project.'),
      state: STR('The state, by its name (or give transition).'), transition: STR('The transition, by its id (as read_file shows it; or give state).'),
      values: { type: 'object', additionalProperties: { type: 'string' }, description: 'The outputs\' values: { output: value }, an empty value clears it; the outputs not given stay as they are.' },
    }, required: ['project', 'path', 'values'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, state, transition, values }) {
      await readProject(name);
      if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: not a state diagram (.fsm.json)`);
      if ((state == null) === (transition == null)) throw toolError('give either state (its name) or transition (its id)');
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw toolError('values: an object { output: value }');
      const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
      const F = await import('../core/fsm.js');
      const O = await import('../core/fsm-outputs.js');
      let m;
      try { m = F.normalizeFsm(JSON.parse(text)); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
      const obj = state != null ? m.states.find(s => s.name === state) : m.transitions.find(t => t.id === transition);
      if (!obj) throw toolError(state != null ? `no state '${state}' in ${rel}` : `no transition '${transition}' in ${rel}`);
      const where = O.outputsWhere(m, { type: state != null ? 'state' : 'trans', id: obj.id });
      const r = O.setOutputValues(obj.outputs, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '')])), m.outputs);
      if (r.error) throw toolError(`${where}: ${r.error} (not applied)`);
      const changed = JSON.stringify(r.outputs) !== JSON.stringify(obj.outputs);
      obj.outputs = r.outputs;
      const rows = O.outputRows(m, obj.outputs).map(o => `${o.name} = ${o.value || (state != null ? `(${o.default}: default)` : '(the state\'s)')}`);
      let sync = null;
      if (changed) {
        await P.writeFile(name, rel, JSON.stringify(m, null, 2));
        const { syncDrawing } = await import('./drawing-sync.js');
        sync = await syncDrawing(P, name, rel);
      }
      return { text: [`${where}: ${changed ? 'outputs set' : 'its outputs are already these'}: ${rows.join(', ') || 'the machine has no outputs'}`, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, ...(state != null ? { state } : { transition }), outputs: obj.outputs, kind: F.fsmKind(m),
          ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
