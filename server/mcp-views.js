// The MCP server's related views (server/mcp.js, #2834): the read-only views the interface shows beside a document
// (its tabs' Show … Beside, web/js/related-views.js) that are no file of the project, made as the interface makes them,
// nothing written: an HDL source's translation to the other language (core/translate.js, #2711), a state diagram's ASM
// chart and an ASM chart's state diagram (core/fsm-asm.js), a Petri net's state machine (core/petri-fsm.js, #2696), a
// truth table's schematic (core/logic.js, #694). The others are read_file's (a drawing's HDL), c_generated's and
// c_synthesis_report's (a C source's).
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';

const VIEWS = ['translation', 'asm', 'fsm', 'schematic'];
const base = p => p.split('/').pop();

async function source(name, rel) {
  try { return await P.readFile(name, rel); } catch { throw toolError(`no file '${rel}' in the project '${name}'`); }
}
const json = (text, rel) => { try { return JSON.parse(text); } catch (e) { throw toolError(`${rel}: ${e.message}`); } };

export const VIEW_TOOLS = [
  {
    name: 'related_view', title: 'A read-only view related to a source',
    description: 'A view the interface shows beside a source, made from it and read-only, nothing written to the project: translation (an HDL source in the other language: VHDL to Verilog, Verilog to VHDL), asm (a state diagram\'s ASM chart, its JSON), fsm (an ASM chart\'s state diagram, or a Petri net\'s state machine: a state per marking, its JSON), schematic (a Boolean algebra / truth table\'s schematic, its JSON). A drawing\'s HDL is read_file\'s, a C source\'s c_generated\'s and c_synthesis_report\'s; convert_drawing makes a drawing a new module.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The source: an HDL file (.vhd, .v), a state diagram (.fsm.json), an ASM chart (.asm.json), a Petri net (.pn.json) or a truth table (.bool.json, .tt.json).'), view: { type: 'string', enum: VIEWS, description: 'The view.' } }, required: ['project', 'path', 'view'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false },
    async run({ project: name, path: rel, view }) {
      await readProject(name);
      if (!VIEWS.includes(view)) throw toolError(`view: ${VIEWS.join(', ')}`);
      const text = await source(name, rel);
      if (view === 'translation') {
        const { translateSource, translatedPath, translationLang } = await import('../core/translate.js');
        const from = /\.vhdl?$/i.test(rel) ? 'vhdl' : /\.s?v$/i.test(rel) ? 'verilog' : null;
        if (!from) throw toolError(`${rel}: an HDL source (.vhd, .v) is translated`);
        const to = translationLang(rel, from === 'vhdl' ? 'verilog' : 'vhdl');
        const sources = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
        const r = translateSource(text, { path: rel, to, sources });
        if (!r.ok) throw toolError(`${base(rel)} cannot be translated to ${to === 'vhdl' ? 'VHDL' : 'Verilog'}: ${r.errors.map(e => `${e.line ? `line ${e.line}: ` : ''}${e.message}`).join('; ')}`);
        return { text: r.text, data: { project: name, path: rel, view, lang: to, name: translatedPath(base(rel), to), text: r.text } };
      }
      if (view === 'schematic') {
        if (!/\.(tt|bool)\.json$/i.test(rel)) throw toolError(`${rel}: a truth table (.bool.json, .tt.json) has a schematic`);
        const { schematicFromTable, validateTable, normalizeTable } = await import('../core/logic.js');
        const m = normalizeTable(json(text, rel));
        const errs = validateTable(m).filter(x => x.severity !== 'warning');
        if (errs.length) throw toolError(`the schematic of ${base(rel)}: ${errs.map(x => x.message).join('; ')}`);
        return reply(name, rel, view, schematicFromTable(m));
      }
      if (view === 'asm') {
        if (!/\.fsm\.json$/i.test(rel)) throw toolError(`${rel}: a state diagram (.fsm.json) has an ASM chart`);
        const F = await import('../core/fsm.js');
        const f = F.normalizeFsm(json(text, rel));
        const errs = F.fsmErrors(f);
        if (errs.length) throw toolError(`the ASM chart of ${base(rel)}: ${errs.map(x => x.message).join('; ')}`);
        return reply(name, rel, view, F.fsmToAsm(f));
      }
      if (/\.pn\.json$/i.test(rel)) {
        const { petriToFsm } = await import('../core/petri-fsm.js');
        const r = petriToFsm(json(text, rel));
        if (!r.fsm) throw toolError(`the state machine of ${base(rel)}: ${r.error}`);
        return reply(name, rel, view, r.fsm, { states: r.states, truncated: !!r.truncated });
      }
      if (!/\.asm\.json$/i.test(rel)) throw toolError(`${rel}: an ASM chart (.asm.json) or a Petri net (.pn.json) has a state diagram`);
      const { asmToFsm } = await import('../core/fsm.js');
      try { return reply(name, rel, view, asmToFsm(json(text, rel))); } catch (e) { if (e.toolError) throw e; throw toolError(`${base(rel)} cannot be shown as a state diagram: ${e.message}`); }
    },
  },
];
const reply = (name, rel, view, model, more = {}) => ({ text: JSON.stringify(model, null, 2), data: { project: name, path: rel, view, model, ...more } });
