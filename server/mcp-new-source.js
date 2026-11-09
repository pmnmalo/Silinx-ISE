// The MCP server's New Source (server/mcp.js, #2674), as the interface's New Source wizard makes each type
// (web/js/new-source.js): a module (its ports), a VHDL package, a test bench of a module, a constraints file, a .mem
// file, a C or C++ function (Silinx HLS), an empty schematic, state diagram, ASM chart, Petri net or truth table; from
// the wizard's own templates (web/js/templates.js, c-templates.js: they import nothing) and the drawings' models, with
// its checks: a file name, a name that is not a reserved word, a module or a drawing's HDL file that is not taken. A
// file that exists is not replaced.
import fs from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';

const TYPES = {
  module: { label: 'Module (HDL)', ext: null, dir: 'src' },
  test_bench: { label: 'Test Bench', ext: null, dir: 'sim' },
  package: { label: 'VHDL Package', ext: '.vhd', dir: 'src' },
  constraints: { label: 'Implementation Constraints File', ext: '.ucf', dir: 'constraints' },
  mem: { label: 'Memory Initialization File (.mem)', ext: '.mem', dir: 'src' },
  c: { label: 'C Function (HLS)', ext: '.c', dir: 'src' },
  cpp: { label: 'C++ Function (HLS)', ext: '.cpp', dir: 'src' },
  schematic: { label: 'Schematic', ext: '.sch.json', dir: 'src' },
  fsm: { label: 'Finite State Machine (FSM)', ext: '.fsm.json', dir: 'src' },
  asm: { label: 'Algorithmic State Machine (ASM)', ext: '.asm.json', dir: 'src' },
  petri: { label: 'Petri Net', ext: '.pn.json', dir: 'src' },
  boolean: { label: 'Boolean Algebra', ext: '.bool.json', dir: 'src' },
};
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const FILE_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const ident = n => n.replace(/[^A-Za-z0-9_]/g, '_');
const DRAWN = ['schematic', 'fsm', 'asm', 'petri', 'boolean'];

// the source's text, as the wizard's Finish writes it
async function sourceText(type, { file, lang, pj, entity, arch, ports, uut }) {
  const T = await import('../web/js/templates.js');
  const n = ident(file);
  switch (type) {
    case 'module': return lang === 'vhdl' ? T.vhdlModule(entity, arch, ports, pj) : T.vlogModule(entity, ports, pj);
    case 'package': return T.vhdlPackage(file, pj);
    case 'test_bench': return lang === 'vhdl' ? T.vhdlTestbench(file, uut, pj) : T.vlogTestbench(file, uut, pj);
    // (the device's format, as New Source's: UCF, the iCE40's PCF, the 7-series' XDC)
    case 'constraints': return ({ pcf: T.pcfTemplate, xdc: T.xdcTemplate }[(await import('../packages/silinx-fpga/src/parts.js')).constraintsFormatOf(pj.device)] || T.ucfTemplate)(pj);
    case 'mem': return '// memory initialization file ($readmemh format)\n00\n01\n02\n03\n';
    case 'c': return (await import('../web/js/c-templates.js')).cTemplate(n);
    case 'cpp': return (await import('../web/js/c-templates.js')).cppTemplate(n);
    case 'schematic': return JSON.stringify((await import('../core/schdoc.js')).newDoc(n, lang), null, 1);
    case 'asm': return JSON.stringify((await import('../core/asm.js')).normalizeModel({ name: n, lang }), null, 2);
    case 'fsm': return JSON.stringify((await import('../core/fsm.js')).normalizeFsm({ name: n, lang }), null, 2);
    case 'petri': return JSON.stringify((await import('../core/petri.js')).normalizePetri({ name: n, lang }), null, 2);
    case 'boolean': return JSON.stringify({ ...(await import('../core/logic.js')).newTable(n, ['a', 'b', 'c'], ['f']), lang }, null, 2);
    default: throw toolError(`type: one of ${Object.keys(TYPES).join(', ')}`);
  }
}

// a module's ports from the tool's [{ name, dir, msb, lsb }] (a bus when msb is given)
function portsOf(list) {
  if (list === undefined) return [{ name: 'clk', dir: 'in', bus: false, msb: '', lsb: '' }, { name: 'rst', dir: 'in', bus: false, msb: '', lsb: '' }];
  if (!Array.isArray(list)) throw toolError('ports: a list of { name, dir (in, out, inout), msb, lsb }');
  return list.map(p => {
    if (!p || typeof p.name !== 'string') throw toolError('ports: each one { name, dir, msb, lsb }');
    const dir = p.dir || 'in';
    if (!['in', 'out', 'inout'].includes(dir)) throw toolError(`port '${p.name}': dir in, out or inout`);
    const bus = p.msb !== undefined && p.msb !== null;
    if (bus && !(Number.isInteger(+p.msb) && Number.isInteger(+(p.lsb ?? 0)))) throw toolError(`port '${p.name}': msb and lsb are integers`);
    return { name: p.name.trim(), dir, bus, msb: bus ? String(+p.msb) : '', lsb: bus ? String(+(p.lsb ?? 0)) : '' };
  });
}

export const NEW_SOURCE_TOOLS = [
  {
    name: 'new_source', title: 'New Source',
    description: 'Add a new source to a project, as the New Source wizard does: module (an HDL module with its ports), test_bench (a test bench of a module of the project), package (a VHDL package), constraints (the device\'s UCF, or PCF for an iCE40), mem, c or cpp (a C / C++ function for Silinx HLS), or an empty drawing: schematic, fsm, asm, petri, boolean (a truth table). In VHDL or Verilog (default: the project\'s Preferred Language). It is written from the wizard\'s templates (a header with the date), added to the project; then edit it with write_file. A file that exists is not replaced.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, type: { type: 'string', enum: Object.keys(TYPES), description: 'The source\'s type.' },
      name: STR('Its file name, without the extension (letters, digits, _ and -; a letter first).'),
      location: STR('Its folder in the project (default: src, sim for a test bench, constraints for a constraints file).'),
      language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'Its language (a module, a test bench, a drawing).' },
      module: STR('A module: its name (default: the file name). A test bench: the module it tests (default: the project\'s top).'),
      architecture: STR('A VHDL module: its architecture\'s name (default Behavioral).'),
      ports: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, dir: { type: 'string', enum: ['in', 'out', 'inout'] }, msb: { type: 'integer' }, lsb: { type: 'integer' } }, required: ['name'] }, description: 'A module: its ports (a bus with msb and lsb; default: clk and rst).' },
    }, required: ['project', 'type', 'name'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, type, name: file, location, language, module, architecture, ports: portList }) {
      const pj = await readProject(name);
      const t = TYPES[type];
      if (!t) throw toolError(`type: one of ${Object.keys(TYPES).join(', ')}`);
      const { reservedError } = await import('../core/reserved.js');
      const { constraintsExtOf } = await import('../packages/silinx-fpga/src/parts.js');
      file = String(file || '').trim().replace(/\.(vhd|vhdl|v|ucf|pcf|xdc|mem|c|cpp|asm\.json|tt\.json|bool\.json|sch\.json|fsm\.json|pn\.json)$/i, '');
      if (!FILE_RE.test(file)) throw toolError('Enter a valid file name (letters, digits, _ and -).');
      const loc = String(location ?? t.dir).trim().replace(/\/+$/, '');
      if (!/^[A-Za-z0-9_/-]+$/.test(loc) || loc.split('/').some(s => !s || s.startsWith('.'))) throw toolError('Invalid location.');
      if (/^build(\/|$)/i.test(loc)) throw toolError('build/ is written by Silinx itself');
      if (type === 'package' && language === 'verilog') throw toolError('a package is VHDL\'s');
      const lang = type === 'package' ? 'vhdl' : language || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
      const ext = type === 'constraints' ? constraintsExtOf(pj.device) : t.ext ?? (lang === 'verilog' ? '.v' : '.vhd');
      const rel = `${loc}/${file}${ext}`;
      const tree = await P.fileTree(name);
      if (fs.existsSync(path.join(P.projectDir(name), rel))) throw toolError(`${rel} already exists: choose another name.`);
      // the project's modules (its HDL files')
      const { compile } = await import('../core/compile.js');
      const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
      let lib = null;
      try { lib = compile(hdl); } catch { /* none */ }
      const mods = lib ? [...lib.modules.values()] : [];
      const taken = m => mods.find(x => x.name.toLowerCase() === m.toLowerCase());
      // the module named as the file (a drawing, a test bench, a package, a C function): not a reserved word
      if (!['module', 'constraints', 'mem'].includes(type)) {
        const r = reservedError(ident(file));
        if (r) throw toolError(`${r}: choose another name.`);
      }
      // a drawing: its module (named as the file) and its HDL file free (#230)
      if (DRAWN.includes(type)) {
        if (taken(ident(file))) throw toolError(`A module named '${ident(file)}' already exists.`);
        const { drawnHdlPath } = await import('../core/view-hdl.js');
        const hdl = drawnHdlPath(rel, ident(file), lang);
        if (tree.includes(hdl)) throw toolError(`${hdl} already exists: the HDL generated from the new source would be written there. Choose another name.`);
      }
      const opts = { file, lang, pj };
      if (type === 'module') {
        opts.entity = String(module ?? file).trim();
        if (!NAME_RE.test(opts.entity)) throw toolError('Invalid module name.');
        opts.ports = portsOf(portList);
        const r = reservedError(opts.entity) || opts.ports.map(p => reservedError(p.name)).find(Boolean);
        if (r) throw toolError(`${r}: choose another name.`);
        for (const p of opts.ports) if (!NAME_RE.test(p.name)) throw toolError(`Invalid port name '${p.name}'.`);
        if (new Set(opts.ports.map(p => p.name.toLowerCase())).size !== opts.ports.length) throw toolError('Duplicate port names.');
        if (taken(opts.entity)) throw toolError(`A module named '${opts.entity}' already exists.`);
        opts.arch = String(architecture || 'Behavioral').trim();
        if (lang === 'vhdl' && !NAME_RE.test(opts.arch)) throw toolError('Invalid architecture name.');
      } else if (portList !== undefined || architecture !== undefined) throw toolError('ports and architecture: a module\'s');
      if (type === 'test_bench') {
        const uutName = module || pj.top;
        const m = mods.find(x => x.kind !== 'package' && x.name.toLowerCase() === String(uutName || '').toLowerCase());
        if (!m) throw toolError(uutName ? `no module '${uutName}' in the project's HDL files` : 'module: the module the test bench tests (the project has no top)');
        if (taken(ident(file))) throw toolError(`A module named '${ident(file)}' already exists.`);
        const { uutInfo } = await import('../core/uut-info.js');
        opts.uut = uutInfo({ name: m.name, lang: m.lang, mod: m });
      } else if (module !== undefined && type !== 'module') throw toolError('module: a module\'s name, or the module a test bench tests');
      const text = await sourceText(type, opts);
      const noConstraints = !pj.constraints || !tree.includes(pj.constraints);
      try { await P.writeFile(name, rel, text); } catch (e) { throw toolError(e.message); }
      if (type === 'constraints' && noConstraints) await P.updateProject(name, p => ({ ...p, constraints: rel }));
      // a drawing: its HDL file, as the interface gives it (#3184; an empty state diagram or ASM chart has none yet)
      const adopted = DRAWN.includes(type) ? await (await import('./drawing-sync.js')).adoptDrawing(P, name, rel) : null;
      const entry = (await P.readProject(name)).files.find(f => f.path === (adopted?.target || rel));
      return { text: [`Created ${t.label}${t.ext ? '' : ` (${lang === 'verilog' ? 'Verilog' : 'VHDL'})`} '${rel}'.`, ...(adopted?.messages || [])].join('\n'),
        data: { project: name, type, path: rel, language: lang, role: entry?.role || null, ...(adopted ? { hdl: adopted.target } : {}), ...(type === 'constraints' ? { constraints: (await P.readProject(name)).constraints } : {}) } };
    },
  },
];
