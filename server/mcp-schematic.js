// The MCP server's tools of a schematic's drawing (server/mcp.js, #2674, #1994): Rearrange Wires and Rearrange Schematic,
// what the schematic editor's menu does (web/js/sch-beautify.js), through the same functions (core/schbeautify.js
// beautifyWires and selectionWires, core/schbeautify-sheet.js beautifySheet) with the same messages; the schematic
// written and its HDL file made again, as write_file does.
// A junction dot moved, as its editor's drag or arrows do (#3806, web/js/sch-junction.js): core/schjunction.js's
// moveJunction, the same refusal of a short and the same warning.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

const POINT = what => ({ type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' } }, required: ['x', 'y'], additionalProperties: false, description: what });
const IDS = what => ({ type: 'array', items: { type: 'string' }, description: what });

// the schematic of the project (normalized as its editor opens it) and the project's modules (its symbols' pins)
export async function openSchematic(name, rel) {
  await readProject(name);
  if (!/\.sch\.json$/i.test(rel)) throw toolError(`${rel}: not a schematic (.sch.json)`);
  const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
  const { projectModules } = await import('./drawing-sync.js');
  const modules = await projectModules(P, name);
  const sd = await import('../core/schdoc.js');
  let doc;
  try { doc = sd.normalizeDoc(JSON.parse(text), { modules }); } catch (e) { throw toolError(`${rel}: ${e.message}`); }
  return { doc, modules };
}
// the schematic written (as its editor saves it) and its HDL file made again
export async function saveSchematic(name, rel, doc) {
  await P.writeFile(name, rel, JSON.stringify(doc, null, 1));
  const { syncDrawing } = await import('./drawing-sync.js');
  return syncDrawing(P, name, rel);
}
const hdlOf = sync => (sync ? { hdl: { file: sync.target, written: !!sync.written } } : {});

export const SCHEMATIC_TOOLS = [
  {
    name: 'rearrange_wires', title: 'Rearrange a schematic\'s wires',
    description: 'Rearrange Wires of a schematic (.sch.json), as its editor\'s menu does: the wires drawn again with few bends and crossings, the wires side by side in a channel ordered with the fewest crossings and spread at an even pitch; the symbols, I/O markers and net names where they are, the connections the same. With wires, symbols or markers (their ids, as read_file shows them), only the wires they take in (the wires, and the wires ending on the symbols\' pins and on the markers). The schematic is written and its HDL file made again.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The schematic: a .sch.json file of the project.'),
      wires: IDS('Wires to rearrange (their ids: W1).'), symbols: IDS('Symbols whose wires to rearrange (their ids: S1).'), markers: IDS('I/O markers whose wires to rearrange (their ids: P1).'),
    }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, wires, symbols, markers }) {
      const { doc, modules } = await openSchematic(name, rel);
      const B = await import('../core/schbeautify.js');
      const some = [wires, symbols, markers].some(x => x?.length);
      const only = some ? B.selectionWires(doc, { wires: wires || [], symbols: symbols || [], ports: markers || [] }, modules) : null;
      if (only && ![...only].some(id => doc.wires.some(w => w.id === id))) throw toolError('Rearrange Wires: no wire in the selection');
      const { changed } = B.beautifyWires(doc, { modules, ...(only ? { only } : {}) });
      const sync = changed.length ? await saveSchematic(name, rel, doc) : null;
      return { text: [B.wiresNote('Rearrange Wires', changed.length), ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, changed, stats: B.wireStats(doc, { modules }), ...hdlOf(sync) } };
    },
  },
  {
    name: 'rearrange_schematic', title: 'Rearrange a whole schematic',
    description: 'Rearrange Schematic of a schematic (.sch.json), as its editor\'s menu does: the whole schematic laid out again (the inputs on the left, the outputs on the right, the symbols moved in the order of the signals, ELK\'s layered layout), then its wires rearranged; taken only when it means the same (the same nets, diagnostics and HDL) with no symbols overlapping, otherwise only the wires drawn again. The schematic is written and its HDL file made again.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The schematic: a .sch.json file of the project.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel }) {
      const { doc, modules } = await openSchematic(name, rel);
      const S = await import('../core/schbeautify-sheet.js');
      const before = JSON.stringify(doc);
      const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
      const elk = new ELK();
      const r = await S.beautifySheet(doc, { modules, layout: g => elk.layout(g) });
      const same = JSON.stringify(doc) === before;
      const sync = same ? null : await saveSchematic(name, rel, doc);
      return { text: [S.sheetNote(r, same), ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, laidOut: r.sheet && !same, changed: r.changed, ...hdlOf(sync) } };
    },
  },
  {
    name: 'move_junction', title: 'Move a junction dot of a schematic',
    description: 'Move a junction dot of a schematic (.sch.json), where three or more wires, pins or I/O markers meet, as its editor\'s drag does: the wires ending on it follow it (their end segment moved across, or a jog added, square, on the grid); a pin or a marker under it stays, joined to it by a wire. The connections the same (a move that would short two named nets refused; one that changes them said). The schematic is written and its HDL file made again.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, path: STR('The schematic: a .sch.json file of the project.'),
      at: POINT('The junction dot (its sheet coordinates, as read_file shows the wires\' points).'), to: POINT('Where it goes (on the grid: multiples of 10).'),
    }, required: ['project', 'path', 'at', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, path: rel, at, to }) {
      const { doc, modules } = await openSchematic(name, rel);
      const J = await import('../core/schjunction.js');
      let r;
      try { r = J.moveJunction(doc, at, to, { modules }); } catch (e) { throw toolError(e.message); }
      if (r.short) throw toolError(J.shortText('The move', r.short));
      const sync = to.x !== at.x || to.y !== at.y ? await saveSchematic(name, rel, r.doc) : null;
      const text = sync ? `The junction dot at (${at.x}, ${at.y}) moved to (${to.x}, ${to.y})` : `The junction dot at (${at.x}, ${at.y}) is already there`;
      return { text: [text, ...(r.kept ? [] : [J.CONNECTIONS_CHANGED]), ...(sync?.messages || [])].join('\n'),
        data: { project: name, path: rel, kept: r.kept, ...hdlOf(sync) } };
    },
  },
];
