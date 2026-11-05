// The MCP server's tools of the simulator's wave configuration (#2839, #2674), as SSim's Save and Load Wave
// Configuration (its toolbar's ⋮ menu: web/js/isim-wcfg.js, web/js/sim-wcfg.js): a .wcfg file of the project (ISim's,
// core/wcfg.js) of the signals shown, their order and radix, the dividers, the groups and the markers. Saved next to the
// simulated module's source unless another name is given, an existing file replaced only when asked; loaded onto the
// design (a signal it has not: said and left out), its signals as simulate takes them.
import * as P from './projects.js';
import { toolError, elaborateView, STR, PROJECT } from './mcp-util.js';
import { placeWcfg, readWcfg, wcfgList, wcfgPath, wcfgSignal, writeWcfg } from '../core/wcfg.js';
import { findSignalIn } from '../core/ssim-forces.js';

const RADIXES = ['default', 'bin', 'hex', 'oct', 'udec', 'sdec', 'ascii'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the simulation's design (the test bench's by default), its Check Syntax's errors as a tool error
async function simDesign(name, top) {
  const { design, top: mod, diags, srcs } = await elaborateView(name, { top, sim: true });
  const errors = diags.filter(d => d.severity === 'error');
  if (errors.length || !design?.top) throw toolError(`<${mod}> does not elaborate: ${errors.length} error(s) (check_syntax with simulation)`);
  return { design, mod, srcs };
}

// a design's signal by the name simulate takes (uut/count) and back
const simName = (design, sig) => String(sig.path).split('.').slice(1).join('/') || sig.name;

// the rows asked for: a signal's name (or { signal, radix, expanded }), { divider }, { group, rows, expanded }
function rowsOf(design, list, where = 'rows', inGroup = false) {
  if (!Array.isArray(list)) throw toolError(`${where}: a list of signals, { divider } and { group, rows }`);
  return list.map((r, k) => {
    const at = `${where}[${k}]`;
    if (typeof r === 'string') r = { signal: r };
    if (r?.divider !== undefined) return { kind: 'div', name: String(r.divider) };
    if (r?.group !== undefined) {
      if (inGroup) throw toolError(`${at}: a group in a group (the wave window has one level)`);
      return { kind: 'group', name: String(r.group), expanded: r.expanded !== false, rows: rowsOf(design, r.rows ?? [], `${at}.rows`, true) };
    }
    const sig = findSignalIn(design, String(r?.signal ?? ''));
    if (!sig) throw toolError(`${at}: signal '${r?.signal ?? ''}' not found`);
    const radix = r.radix ?? 'default';
    if (!RADIXES.includes(radix)) throw toolError(`${at}: radix one of ${RADIXES.join(', ')}`);
    return wcfgSignal(sig, { radix, expanded: r.expanded });
  });
}

// a configuration's rows as the tool returns them: a signal by simulate's name, its path, radix
function rowsOut(design, rows) {
  return rows.map(r => r.kind === 'div' ? { divider: r.name }
    : r.kind === 'group' ? { group: r.name, expanded: r.expanded, rows: rowsOut(design, r.rows) }
      : { signal: simName(design, r.sig), path: `/${String(r.sig.path).replace(/\./g, '/')}`, radix: r.radix, expanded: r.expanded });
}

export const WCFG_TOOLS = [
  {
    name: 'save_wave_config', title: 'Save Wave Configuration',
    description: 'Save a wave configuration of the simulation (ISim\'s .wcfg, as the simulator\'s ⋮ ▸ Save Wave Configuration): the signals shown, in order, with their radix, dividers and groups, and the markers; a file of the project, next to the test bench\'s source by default. load_wave_config reads it back.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, top: STR('The simulation top (default: the project\'s test bench).'),
      file: STR('The file in the project (default: <the top\'s folder>/<top>.wcfg; .wcfg added when missing).'),
      rows: { type: 'array', description: 'The rows, in order (default: the top\'s signals): a signal\'s name (clk, uut/count), { signal, radix, expanded }, { divider: name }, { group: name, rows: [...], expanded }.',
        items: { anyOf: [{ type: 'string' }, { type: 'object', properties: {
          signal: STR('The signal (a name of the top, or a path through instances: uut/count).'), radix: { type: 'string', enum: RADIXES },
          expanded: { type: 'boolean', description: 'A bus shown bit by bit; a group open (default true).' },
          divider: STR('A divider\'s name.'), group: STR('A group\'s name.'), rows: { type: 'array', description: 'A group\'s signals and dividers.' },
        } }] } },
      markers_ns: { type: 'array', items: { type: 'number' }, description: 'The markers\' times, in ns.' },
      overwrite: { type: 'boolean', description: 'Replace the file when it exists (the interface asks first).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, top, file, rows, markers_ns: markers = [], overwrite = false }) {
      const { design, mod } = await simDesign(name, top);
      const dir = String(design.top.file || '').includes('/') ? design.top.file.replace(/\/[^/]*$/, '/') : '';
      const v = file ?? `${dir}${mod}.wcfg`;
      const path = wcfgPath(v);
      if (!path) throw toolError(`'${v}' is not a valid file name (letters, digits, _ . - and folders; .wcfg).`);
      if (!Array.isArray(markers) || markers.some(t => !(t >= 0))) throw toolError('markers_ns: times in ns, from 0');
      const list = rows ?? [...(design.top.ports || []).map(p => p.sig), ...(design.top.signals || [])].filter(Boolean).map(s => simName(design, s));
      const out = rowsOf(design, list);
      if ((await P.fileTree(name)).includes(path) && !overwrite) throw toolError(`${path} already exists: overwrite: true to replace it`);
      await P.writeFile(name, path, writeWcfg({ tops: [design.top.name], rows: out, markers: markers.map(t => Math.round(t * 1000)) }));
      const n = out.flatMap(r => r.kind === 'group' ? r.rows : [r]).filter(r => r.kind === 'sig').length;
      return { text: `Wave configuration saved to ${path} (${plural(n, 'signal')}, ${plural(markers.length, 'marker')}).`,
        data: { project: name, top: mod, file: path, signals: n, markers: markers.length } };
    },
  },
  {
    name: 'load_wave_config', title: 'Load Wave Configuration',
    description: 'Load a wave configuration (.wcfg) of the project onto the simulation\'s design, as the simulator\'s ⋮ ▸ Load Wave Configuration: its rows (the signals by the names simulate takes, with their radix; dividers, groups) and markers; a signal the design has not is said and left out. Its signals can be given to simulate.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, top: STR('The simulation top (default: the project\'s test bench).'),
      file: STR('The .wcfg file in the project (default: the top\'s own, <top>.wcfg, else the first one).'),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, file }) {
      const { design, mod } = await simDesign(name, top);
      const files = wcfgList(await P.fileTree(name), mod);
      if (!files.length) throw toolError('The project has no wave configuration (.wcfg) yet: save one first.');
      const path = file == null ? files[0] : wcfgPath(file);
      if (!path || !files.includes(path)) throw toolError(`no wave configuration '${file}' in the project (${files.join(', ')})`);
      let cfg;
      try { cfg = readWcfg(await P.readFile(name, path)); } catch (e) { throw toolError(`the wave configuration was not loaded: ${e.message}`); }
      const { rows, missing } = placeWcfg(cfg.rows, design.signals);
      const flat = rows.flatMap(r => r.kind === 'group' ? r.rows : [r]).filter(r => r.kind === 'sig');
      const warnings = missing.map(p => `WARNING: ${p} is not a signal of this design: not shown`);
      return { text: [...warnings, `Wave configuration ${path} loaded: ${plural(flat.length, 'signal')}, ${plural(cfg.markers.length, 'marker')}`].join('\n'),
        data: { project: name, top: mod, file: path, rows: rowsOut(design, rows), signals: flat.map(r => simName(design, r.sig)), markers_ns: cfg.markers.map(t => t / 1000), missing, warnings } };
    },
  },
];
