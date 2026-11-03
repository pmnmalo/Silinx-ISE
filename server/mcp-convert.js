// The MCP server's conversions (server/mcp.js, #2674), as the Design pane's menus convert (web/js/drawings.js): an HDL
// module to a schematic (core/hdl-to-sch.js, laid out with elkjs as the interface lays it out), an ASM chart
// (core/asm-from-hdl.js) or a state diagram (core/fsm.js), which becomes the module's base, its HDL file generated from
// it; a state diagram to a new ASM chart, an ASM chart to a new state diagram (not linked to it), a state diagram to
// the Boolean algebra of its next-state and output logic. A file that exists is not replaced.
import * as P from './projects.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';

const VIEW_RE = /\.(sch|asm|tt|bool|fsm|pn)\.json$/i;
const dirOf = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '') : 'src');

// the project's HDL sources with their roles, the drawn ones (no HDL file of their own) among them
async function allSources(name, pj) {
  const seen = new Map();
  for (const sim of [false, true]) for (const s of await viewSourcesOf(name, pj, sim)) if (!seen.has(s.path)) seen.set(s.path, { ...s, role: (pj.files || []).find(f => f.path === s.path)?.role || s.role || 'design' });
  return [...seen.values()];
}

// a module of an HDL file of the project that no drawing is the base of: { name, file, lang }
async function hdlModule(name, pj, module) {
  const { compile } = await import('../core/compile.js');
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  let lib;
  try { lib = compile(hdl); } catch (e) { throw toolError(e.message); }
  const m = [...lib.modules.values()].find(x => x.kind !== 'package' && x.name.toLowerCase() === String(module || '').toLowerCase());
  if (!m) throw toolError(`no module '${module}' in the project's HDL files`);
  // (a drawing removed from the project is no module's base)
  for (const f of (await P.fileTree(name)).filter(f => VIEW_RE.test(f) && !(pj.excluded || []).includes(f))) {
    try { const d = JSON.parse(await P.readFile(name, f)); if (d.generatedFile === m.file && d.base !== 'hdl') throw toolError(`'${m.name}' is made from ${f} already: its file ${m.file} is generated from that drawing`); } catch (e) { if (e.toolError) throw e; }
  }
  return { name: m.name, file: m.file, lang: m.lang };
}

// a file name `${dir}/${base}${ext}` (and module name) not taken in the project (drawings.js freeName)
async function freeName(name, dir, base, ext) {
  const tree = await P.fileTree(name);
  const { compile } = await import('../core/compile.js');
  let mods = [];
  try { mods = [...compile((await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'))).modules.values()]; } catch { /* none */ }
  let n = base, k = 1;
  while (tree.includes(`${dir}/${n}${ext}`) || mods.some(x => x.name.toLowerCase() === n.toLowerCase())) n = `${base}${++k}`;
  return n;
}

export const CONVERT_TOOLS = [
  {
    name: 'convert_module', title: 'Convert a module to a drawing',
    description: 'Convert a module of an HDL file to a drawing, as Convert to Schematic / ASM / State Diagram do: to schematic (what can be drawn is drawn, the rest kept as HDL blocks; a file of several design units split), asm (an ASM chart) or fsm (a state diagram) of its state machine. The drawing becomes the module\'s base: its HDL file is generated from it from then on (edit the drawing with write_file). Returns the conversion\'s warnings.',
    inputSchema: { type: 'object', properties: { project: PROJECT, module: STR('The module (of an HDL file of the project).'), to: { type: 'string', enum: ['schematic', 'asm', 'fsm'], description: 'The drawing.' } }, required: ['project', 'module', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, module, to }) {
      const pj = await readProject(name);
      if (!['schematic', 'asm', 'fsm'].includes(to)) throw toolError('to: schematic, asm or fsm');
      const info = await hdlModule(name, pj, module);
      const tree = await P.fileTree(name);
      if (to === 'schematic') {
        const { convertModuleToSchematic } = await import('../core/hdl-to-sch.js');
        const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
        const elk = new ELK();
        let r;
        try { r = await convertModuleToSchematic({ sources: await allSources(name, pj), module: info.name, layout: g => elk.layout(g), exists: p => tree.includes(p) }); } catch (e) { throw toolError(e.message); }
        if (tree.includes(r.schPath)) throw toolError(`${r.schPath} already exists: an earlier drawing of it (delete_file it first)`);
        const doc = { ...r.doc };
        delete doc.importDiagnostics;
        for (const [p, text] of Object.entries(r.writes)) {
          if (text == null) await P.deleteFile(name, p); else await P.writeFile(name, p, text);
        }
        await P.writeFile(name, r.schPath, JSON.stringify(doc, null, 1));
        // a new file (a file of several design units split) keeps the role of the file it comes from
        await P.updateProject(name, x => { for (const [p, role] of Object.entries(r.newFiles)) { const nf = x.files.find(f => f.path === p); if (nf) nf.role = role; } return x; });
        const { blocks, drawn } = r.counts;
        const lines = [`'${info.name}' converted to the schematic ${r.schPath} (${drawn} symbol${drawn === 1 ? '' : 's'} drawn, ${blocks} HDL block${blocks === 1 ? '' : 's'} keeping the HDL that is not drawn): it is now the module's base, ${r.hdlPath} generated from it.`,
          ...Object.keys(r.newFiles).map(p => (p === r.hdlPath ? `'${info.name}' taken out of ${r.kept.join(', ')} into ${p}: the other design units of ${r.kept.length === 1 ? 'that file' : 'those files'} stay there.` : `The other design units of ${r.hdlPath} moved to ${p}.`)),
          ...Object.keys(r.writes).filter(p => r.writes[p] == null).map(p => `${p} removed: what it held is in ${r.hdlPath}.`),
          ...r.warnings.map(w => `WARNING: ${w}`)];
        return { text: lines.join('\n'), data: { project: name, module: info.name, drawing: r.schPath, hdl: r.hdlPath, drawn, blocks, warnings: r.warnings } };
      }
      const target = `${dirOf(info.file)}/${info.name}.${to}.json`;
      if (tree.includes(target)) throw toolError(`${target} already exists: an earlier drawing of it (delete_file it first)`);
      const text = await P.readFile(name, info.file);
      let r;
      if (to === 'asm') {
        const { asmFromHdl } = await import('../core/asm-from-hdl.js');
        try { r = asmFromHdl(text, { path: info.file, lang: info.lang, module: info.name }); } catch (e) { throw toolError(`'${info.name}' cannot be shown as an ASM chart: ${e.message}`); }
      } else {
        const { fsmFromHdl } = await import('../core/fsm.js');
        try { r = fsmFromHdl(text, { path: info.file, module: info.name, lang: info.lang }); } catch (e) { throw toolError(`'${info.name}' cannot be shown as a state diagram: ${e.message}`); }
      }
      // (its HDL file as it is: an edit of the drawing makes it again)
      await P.writeFile(name, target, JSON.stringify({ ...r.model, generatedFile: info.file }, null, 2));
      const lines = [`'${info.name}' converted to the ${to === 'asm' ? 'ASM chart' : 'state diagram'} ${target}; it stays in sync with ${info.file}.`,
        ...(r.warnings || []).map(w => `WARNING: ${target}: ${w}`)];
      return { text: lines.join('\n'), data: { project: name, module: info.name, drawing: target, hdl: info.file, warnings: r.warnings || [] } };
    },
  },
  {
    name: 'convert_drawing', title: 'Convert a state machine\'s drawing',
    description: 'Make a new drawing of a state machine from another, as the drawings\' menus do: a state diagram to an ASM chart (asm), an ASM chart to a state diagram (fsm), each a new module (<name>_asm, <name>_fsm) not linked to the drawing it comes from; or a state diagram to its Boolean algebra (boolean: a truth table of its next-state bits and outputs as functions of the state bits and the inputs, in its encoding; unused codes are don\'t cares).',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The drawing: a state diagram (.fsm.json) or an ASM chart (.asm.json).'), to: { type: 'string', enum: ['asm', 'fsm', 'boolean'], description: 'What to make of it.' } }, required: ['project', 'path', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, path: rel, to }) {
      await readProject(name);
      if (!['asm', 'fsm', 'boolean'].includes(to)) throw toolError('to: asm, fsm or boolean');
      const isFsm = /\.fsm\.json$/i.test(rel), isAsm = /\.asm\.json$/i.test(rel);
      if ((to === 'fsm' && !isAsm) || (to !== 'fsm' && !isFsm)) throw toolError(to === 'fsm' ? `${rel}: an ASM chart (.asm.json) becomes a state diagram` : `${rel}: a state diagram (.fsm.json) becomes an ASM chart or Boolean algebra`);
      let m;
      try { m = JSON.parse(await P.readFile(name, rel)); } catch { throw toolError(`no drawing '${rel}' in the project '${name}'`); }
      const F = await import('../core/fsm.js');
      const dir = dirOf(rel);
      if (to === 'asm') {
        const f = F.normalizeFsm(m);
        const errs = F.fsmErrors(f);
        if (errs.length) throw toolError(errs.map(x => x.message).join('\n'));
        const n = await freeName(name, dir, `${f.name}_asm`, '.asm.json');
        const asm = { ...F.fsmToAsm(f), name: n };
        delete asm.generatedFile; delete asm.base;
        await P.writeFile(name, `${dir}/${n}.asm.json`, JSON.stringify(asm, null, 2));
        return { text: `State diagram '${rel}' -> ASM chart ${dir}/${n}.asm.json (module '${n}'; not linked to the diagram).`, data: { project: name, made: [`${dir}/${n}.asm.json`] } };
      }
      if (to === 'fsm') {
        let f;
        try { f = F.asmToFsm(m); } catch (e) { throw toolError(`${rel.split('/').pop()} cannot be shown as a state diagram: ${e.message}`); }
        const n = await freeName(name, dir, `${m.name || 'fsm'}_fsm`, '.fsm.json');
        f.name = n;
        delete f.generatedFile; delete f.base;
        await P.writeFile(name, `${dir}/${n}.fsm.json`, JSON.stringify(f, null, 2));
        return { text: `ASM chart '${rel}' -> state diagram ${dir}/${n}.fsm.json (module '${n}'; not linked to the chart).`, data: { project: name, made: [`${dir}/${n}.fsm.json`] } };
      }
      const f = F.normalizeFsm(m);
      const r = F.truthTablesOf(f);
      if (r.error) throw toolError(r.error);
      const made = [];
      for (const t of r.tables) {
        const n = await freeName(name, dir, t.doc.name, '.bool.json');
        await P.writeFile(name, `${dir}/${n}.bool.json`, JSON.stringify({ ...t.doc, name: n }, null, 2));
        made.push(`${dir}/${n}.bool.json`);
      }
      return { text: `State diagram '${rel}' -> Boolean algebra ${made.join(', ')} (next-state and output logic of the ${f.encoding} encoding; unused codes are don't cares).`, data: { project: name, made } };
    },
  },
];
