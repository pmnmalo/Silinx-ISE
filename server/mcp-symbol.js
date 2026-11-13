// The MCP server's tools of a module's symbol (server/mcp.js, #2674, #3755): what the Symbol Editor does
// (web/js/symbol-editor.js, symbol-doc.js) and a schematic's Update Symbol (web/js/sch-modsym.js), through the same
// functions (core/symbol-layout.js, core/schdoc-modsym.js updateModuleSymbols) with the same checks and messages:
// read_symbol (a module's symbol: its file's, or the default one), edit_symbol (its pins' order and sides, the
// spacing, the size, the module name's place; Reset to Default), update_symbols (a schematic's instances of out-of-date
// symbols drawn from their modules' symbols again, their connections kept), place_instance (a module's instance placed
// in a schematic as its palette places one, named with a range for an arrayed instance, reg(3:0), core/sch-array.js;
// its pins connected to nets by name, a short wire and a net name each).
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { openSchematic, saveSchematic } from './mcp-schematic.js';

const OUTWARD = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const newId = (list, pfx) => { const ids = new Set(list.map(o => o.id)); let i = 1; while (ids.has(`${pfx}${i}`)) i++; return `${pfx}${i}`; };

const SIDES = { type: 'string', enum: ['W', 'E', 'N', 'S'], description: 'The side: W (left), E (right), N (top), S (bottom).' };
const sideName = { W: 'left', E: 'right', N: 'top', S: 'bottom' };

// the module `module` of the project, with its symbol (its file's, or none), and the symbol file's path
async function moduleOf(name, module) {
  await readProject(name);
  if (typeof module !== 'string' || !module) throw toolError('module: the name of a module of the project');
  const [{ projectModules }, L] = await Promise.all([import('./drawing-sync.js'), import('../core/symbol-layout.js')]);
  const mods = await projectModules(P, name);
  const m = Object.values(mods).find(x => x.name.toLowerCase() === module.toLowerCase());
  if (!m) throw toolError(`no module '${module}' in the project's sources`);
  return { m, L, path: m.symbolFile || L.symbolFileOf(m.file, m.name) };
}
const describe = (m, sym) => ({
  module: m.name, ...sym, pins: sym.pins.map(q => { const p = m.ports.find(x => x.name.toLowerCase() === q.name.toLowerCase()); return { name: q.name, side: q.side, dir: p?.dir || 'in', width: p?.width ?? 1 }; }),
});
const pinsText = sym => ['W', 'E', 'N', 'S'].map(s => [s, sym.pins.filter(q => q.side === s).map(q => q.name)]).filter(([, n]) => n.length)
  .map(([s, n]) => `${sideName[s]}: ${n.join(', ')}`).join('; ');

export const SYMBOL_TOOLS = [
  {
    name: 'read_symbol', title: 'Read a module\'s symbol',
    description: 'A module\'s symbol in the schematics, as the Symbol Editor shows it: its pins in order on each side (W left, E right, N top, S bottom; top to bottom, left to right), each pin\'s direction and width, the spacing between pins, the body\'s width and height (null: automatic) and where the module\'s name is drawn (title: top, center, bottom). Its symbol file (<module>.sym.json beside its source) when it has one, else the default symbol (inputs on the left, outputs on the right).',
    inputSchema: { type: 'object', properties: { project: PROJECT, module: STR('The module (entity) whose symbol to read.') }, required: ['project', 'module'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, module }) {
      const { m, L, path } = await moduleOf(name, module);
      const sym = m.symbol || L.newSymbol(m);
      return { text: `${m.name}: ${m.symbol ? `its symbol ${path}` : 'the default symbol (no symbol file)'}: ${pinsText(sym)}; spacing ${sym.spacing}, width ${sym.width ?? 'auto'}, height ${sym.height ?? 'auto'}, name ${sym.title}`,
        data: { project: name, file: m.symbol ? path : null, symbol: describe(m, sym) } };
    },
  },
  {
    name: 'edit_symbol', title: 'Edit a module\'s symbol',
    description: 'Edit a module\'s symbol, as the Symbol Editor does, and save it (<module>.sym.json beside its source, made when it has none): pins, its pins in their new order with their sides (every pin of the symbol, or some of them: those given first on their sides, the others after them, as they were); spacing (between pins: 20 to 100, a multiple of 10); width and height (the body\'s, 40 to 2000; null: automatic); title (where the module\'s name is drawn: top, center, bottom); reset: true, the default symbol first. The schematics\' instances of the module are then out of date: update_symbols draws them with it, their connections kept.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, module: STR('The module (entity) whose symbol to edit.'),
      pins: { type: 'array', items: { type: 'object', properties: { name: STR('The pin (a port of the module).'), side: SIDES }, required: ['name'], additionalProperties: false }, description: 'Pins in their new order, with their side (left out: the side it has).' },
      spacing: { type: 'integer', description: 'The spacing between pins (20 to 100, a multiple of 10).' },
      width: { type: ['integer', 'null'], description: 'The body\'s width (40 to 2000; null: automatic).' },
      height: { type: ['integer', 'null'], description: 'The body\'s height (40 to 2000; null: automatic).' },
      title: { type: 'string', enum: ['top', 'center', 'bottom'], description: 'Where the module\'s name is drawn.' },
      reset: { type: 'boolean', description: 'Reset to Default first: the inputs on the left, the outputs on the right, in the module\'s order.' },
    }, required: ['project', 'module'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, module, pins, spacing, width, height, title, reset }) {
      const { m, L, path } = await moduleOf(name, module);
      const base = reset || !m.symbol ? L.newSymbol(m) : m.symbol;
      const next = { ...base, pins: base.pins.map(q => ({ ...q })) };
      if (pins) {
        const given = [];
        for (const q of pins) {
          const have = next.pins.find(x => x.name.toLowerCase() === String(q.name).toLowerCase());
          if (!have) throw toolError(`module '${m.name}' has no port '${q.name}'`);
          if (given.includes(have)) throw toolError(`pin ${have.name} given twice`);
          if (q.side) have.side = q.side;
          given.push(have);
        }
        next.pins = [...given, ...next.pins.filter(q => !given.includes(q))];
      }
      if (spacing !== undefined) next.spacing = spacing;
      if (width !== undefined) next.width = width;
      if (height !== undefined) next.height = height;
      if (title !== undefined) next.title = title;
      const { symbol, errors } = L.normalizeSymbol(next);
      if (errors.length) throw toolError(`${errors.join('; ')}`);
      await P.writeFile(name, path, L.symbolText(symbol));
      return { text: `${path}: the symbol of module '${m.name}' saved: ${pinsText(symbol)}; spacing ${symbol.spacing}, width ${symbol.width ?? 'auto'}, height ${symbol.height ?? 'auto'}, name ${symbol.title}`,
        data: { project: name, file: path, symbol: describe(m, symbol) } };
    },
  },
  {
    name: 'update_symbols', title: 'Update a schematic\'s out-of-date symbols',
    description: 'Update Symbol in a schematic (.sch.json), as its editor\'s Properties do (Update Symbol, Update All): the instances whose module changed its ports or its symbol drawn from their module again (its symbol\'s pins\' order, sides and layout when it has one), the wires, I/O markers and net names on a pin that stays following it; a pin whose port is gone or turned keeps its wire where it was, unconnected. With symbols (instance ids), only those. The schematic is written and its HDL file made again.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The schematic: a .sch.json file of the project.'),
      symbols: { type: 'array', items: { type: 'string' }, description: 'The instances to update (their ids: S1); left out: every out-of-date one.' },
    }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, symbols }) {
      const { doc, modules } = await openSchematic(name, rel);
      const sd = await import('../core/schdoc.js');
      const r = sd.updateModuleSymbols(doc, modules, symbols?.length ? symbols : null);
      if (!r.updated.length) return { text: `${rel}: no symbol out of date`, data: { project: name, path: rel, ...r } };
      const sync = await saveSchematic(name, rel, doc);
      const lost = [...r.removed, ...r.turned];
      return { text: [lost.length ? `Symbol updated; not connected any more: ${lost.join(', ')}` : `Symbol updated (${r.updated.join(', ')}), its connections kept`, ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, ...r, ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
  {
    name: 'place_instance', title: 'Place a module\'s instance in a schematic',
    description: 'Place an instance of a module of the project in a schematic (.sch.json), as its Symbols palette does (with its symbol: its own, Symbol Editor\'s, when it has one): at x, y (on the 10 px grid), turned rot (0, 90, 180, 270), named name (its automatic name inst_n when left out). A name with a range, reg(3:0), makes an arrayed instance, as ISE\'s: that many copies of the module (reg_3 … reg_0 in the HDL); a pin connected to a bus N times its width takes its slice for each copy (D on d(3:0): reg_i\'s D is d(i)), one connected to a net of its width is shared (a clock, an enable). connect: { pin: net name } connects pins to nets by name (a short wire and that net name on it: d(3:0) for a 4-bit bus, the same name as an I/O marker joins it). The schematic is written and its HDL file made again; its check\'s errors and warnings said.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The schematic: a .sch.json file of the project.'), module: STR('The module (entity) to instantiate.'),
      name: STR('The instance name; with a range, reg(3:0), an arrayed instance.'),
      x: { type: 'integer', description: 'Its left (sheet coordinates).' }, y: { type: 'integer', description: 'Its top (sheet coordinates).' },
      rot: { type: 'integer', enum: [0, 90, 180, 270], description: 'Its turn, degrees clockwise.' },
      connect: { type: 'object', additionalProperties: { type: 'string' }, description: 'Pins connected to nets by name: { "d": "d(3:0)", "c": "clk" }.' },
    }, required: ['project', 'path', 'module', 'x', 'y'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, path: rel, module, name: iname, x, y, rot = 0, connect = {} }) {
      const { doc, modules } = await openSchematic(name, rel);
      const [sd, { instName, renameError }, { arrayOf }] = await Promise.all([import('../core/schdoc.js'), import('../core/schname.js'), import('../core/sch-array.js')]);
      const m = sd.findMod(modules, module);
      if (!m) throw toolError(`no module '${module}' in the project's sources`);
      if (m.name.toLowerCase() === String(doc.name).toLowerCase()) throw toolError(`'${m.name}' is the schematic's own module: it cannot hold an instance of itself`);
      const id = newId(doc.symbols, 'S');
      const sym = { id, type: 'module', x: sd.snap(x), y: sd.snap(y), rot, mirror: false, name: '', params: { ...sd.defaultParams('module'), module: m.name, ...sd.instanceParams(m) } };
      doc.symbols.push(sym);
      if (iname != null && String(iname).trim()) {
        const why = renameError(doc, 'sym', id, iname);
        if (why) throw toolError(why);
        sym.name = String(iname).trim();
      } else sym.name = instName(doc, id, '');
      const pins = sd.symbolPins(sym, modules);
      for (const [pin, net] of Object.entries(connect)) {
        const p = pins.find(q => q.name.toLowerCase() === pin.toLowerCase());
        if (!p) throw toolError(`module '${m.name}' has no port '${pin}'`);
        const why = renameError(doc, 'label', null, net);
        if (why) throw toolError(`connect ${pin}: ${why}`);
        const [dx, dy] = OUTWARD[p.side], end = { x: p.x + 40 * dx, y: p.y + 40 * dy };
        doc.wires.push({ id: newId(doc.wires, 'W'), points: [{ x: p.x, y: p.y }, end] });
        doc.labels.push({ id: newId(doc.labels, 'L'), x: p.x + 20 * dx, y: p.y + 20 * dy, net: String(net).trim() });
      }
      const diags = sd.netlist(doc, { modules }).diagnostics;
      const sync = await saveSchematic(name, rel, doc);
      const arr = arrayOf(sym);
      return { text: [`${rel}: ${sym.name} (${m.name}${arr ? `, ${arr.n} copies` : ''}) placed at ${sym.x}, ${sym.y}`, ...diags.map(d => `${d.severity === 'error' ? 'ERROR' : 'WARNING'}: ${d.message}`), ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, id, name: sym.name, copies: arr ? arr.n : 1, diagnostics: diags.map(d => ({ severity: d.severity, message: d.message })), ...(sync ? { hdl: { file: sync.target, written: !!sync.written } } : {}) } };
    },
  },
];
