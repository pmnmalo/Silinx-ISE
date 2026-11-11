// The MCP server's module wizards (server/mcp.js, #2674), as the interface's Clocking Wizard and Block Memory wizard
// make their modules (web/js/clock-wizard.js, bram-wizard.js): a DCM (Spartan-3E) or a PLL (Spartan-6) for the
// frequencies asked (core/clocking.js), a block RAM or ROM (core/blockram.js), its settings kept in the module's header
// (`-- silinx-wizard: {...}`) so that a module made by a wizard is made again from them with the settings changed, as
// editing it reopens the wizard; the UCF Wizard's constraints file, a module's ports on the board's pins
// (web/js/ucf-wizard.js). The wizards' checks and their messages.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

const mhzText = x => `${(+x).toFixed(3).replace(/\.?0+$/, '')} MHz`;

// the device's part record and its count of a resource (null: not in the database)
async function deviceCount(pj, resource) {
  const { findPart } = await import('./devices.js');
  const { resourceCount } = await import('../packages/silinx-fpga/src/parts.js');
  const part = findPart(pj.device?.part);
  return part ? resourceCount(part, resource) : null;
}

// the board's oscillator (its Clock resource with a period), else 50 MHz
async function boardMHz(pj) {
  const { resolveBoard } = await import('./devices.js');
  const { periodNs } = await import('../packages/silinx-fpga/src/parts.js');
  const r = pj.board ? resolveBoard(pj.board)?.resources?.find(x => x.group === 'Clock' && x.extra?.period) : null;
  const ns = r ? periodNs(r.extra.period) : null;
  return ns ? Math.round(1e6 / ns) / 1000 : 50;
}

// the module's file: a new one (its name and location; not there, its module not taken) or a wizard's module (edit)
async function target(name, { edit, file, location, lang, kind, wizardName }) {
  const { readWizardSpec } = await import('../core/clocking.js');
  const tree = await P.fileTree(name);
  if (edit) {
    if (!tree.includes(edit)) throw toolError(`no file '${edit}' in the project '${name}'`);
    const old = readWizardSpec(await P.readFile(name, edit));
    if (!old || old.wizard !== kind) throw toolError(`${edit} was not made by the ${wizardName}`);
    return { path: edit, old };
  }
  const loc = String(location ?? 'src').trim().replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_/-]+$/.test(loc) || loc.split('/').some(s => !s || s.startsWith('.')) || /^build(\/|$)/i.test(loc)) throw toolError('Invalid location.');
  const path = `${loc}/${file}${lang === 'verilog' ? '.v' : '.vhd'}`;
  if (tree.includes(path)) throw toolError(`${path} already exists: choose another name (or edit it).`);
  return { path, old: null };
}

// the name of the module: a valid identifier, not another file's module
async function checkName(name, n, lang, path) {
  const { identError } = await import('../core/modgen.js');
  const e = identError(n, lang);
  if (e) throw toolError(`Name: ${e}.`);
  const { compile } = await import('../core/compile.js');
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  let mods = [];
  try { mods = [...compile(hdl).modules.values()]; } catch { /* none */ }
  if (mods.some(m => m.name.toLowerCase() === n.toLowerCase() && m.file !== path)) throw toolError(`A module named '${n}' already exists.`);
}

async function write(name, path, code, created) {
  await P.writeFile(name, path, code);
  return created ? 'created' : 'wrote again';
}

export const WIZARD_TOOLS = [
  {
    name: 'clock_manager', title: 'Clocking Wizard (DCM / PLL)',
    description: 'Make a clock module as the Clocking Wizard does: a DCM_SP on a Spartan-3E (its outputs CLK0, CLK90, CLK180, CLK270, CLK2X, CLK2X180, CLKDV and CLKFX at the nearest frequency it can, CLKFX180), a PLL_BASE on a Spartan-6 (up to six outputs from one VCO frequency, with their phase), each output on a global buffer; the input from a pin (IBUFG) or not, its reset and LOCKED ports. Or edit: a module the wizard made, made again with the settings given changed. Returns the frequency of each output.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, name: STR('The module\'s name (default clkgen; its file is named after it).'), location: STR('Its folder (default src).'), language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'Its language (default: the project\'s Preferred Language).' },
      edit: STR('A module the wizard made (its file): made again with the settings given.'),
      input_mhz: { type: 'number', description: 'The input clock\'s frequency (default: the board\'s oscillator, else 50 MHz).' },
      input: STR('The input port (default clk_in).'), ibufg: { type: 'boolean', description: 'The input from a pin, through an IBUFG (default true).' },
      reset: STR('The reset input port, or "" for none (default rst).'), locked: STR('The LOCKED output port, or "" for none (default locked).'),
      divide_input_by_2: { type: 'boolean', description: 'Spartan-3E: CLKIN_DIVIDE_BY_2.' }, phase_shift: { type: 'integer', description: 'Spartan-3E: a fixed phase shift, -255 to 255 (256ths of the period).' },
      outputs: { type: 'array', items: { type: 'object', properties: { pin: { type: 'string' }, port: { type: 'string' }, mhz: { type: 'number' }, phase: { type: 'number' } }, required: ['port'] }, description: 'The outputs: Spartan-3E { pin (CLK0, CLK90, CLK180, CLK270, CLK2X, CLK2X180, CLKDV, CLKFX, CLKFX180), port, mhz (CLKDV and CLKFX: asked) }; Spartan-6 { port, mhz, phase (degrees) }. Default: CLK0 (Spartan-3E), one output at the input frequency (Spartan-6).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, name: modName, location, language, edit, input_mhz: inMHz, input, ibufg, reset, locked, divide_input_by_2: div2, phase_shift: phaseShift, outputs }) {
      const pj = await readProject(name);
      const { familyProfile } = await import('../core/family-profile.js');
      const { clockModule, planClock } = await import('../core/clocking.js');
      const family = pj.device?.family;
      const clock = familyProfile(family)?.clock;
      if (!clock) throw toolError('The Clocking Wizard makes a DCM for the Spartan-3E and a PLL for the Spartan-6: choose one of them as the target device (set_design_properties).');
      const pll = clock.manager === 'pll';
      const lang0 = language || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
      const t = await target(name, { edit, file: modName || 'clkgen', location, lang: lang0, kind: 'clock', wizardName: 'Clocking Wizard' });
      if (t.old && t.old.family !== family) throw toolError(`${edit} was made for another family of devices than the project's: make a new one.`);
      if (edit && (modName !== undefined || language !== undefined || location !== undefined)) throw toolError('edit: the module\'s name, language and location stay its own');
      if (await deviceCount(pj, clock.resource) === 0) throw toolError(pll ? 'This device has no PLL.' : 'This device has no DCM.');
      const fin = inMHz ?? t.old?.inMHz ?? await boardMHz(pj);
      const base = t.old || { wizard: 'clock', version: 1, name: modName || 'clkgen', lang: lang0, family, inMHz: fin, input: 'clk_in', ibufg: true, reset: 'rst', locked: 'locked',
        ...(pll ? { outputs: [{ port: 'clk_out0', mhz: fin, phase: 0 }] } : { div2: false, phaseShift: 0, outputs: [{ pin: 'CLK0', port: 'clk0' }] }) };
      const spec = { ...base, speed: pj.device.speed, inMHz: fin, ...(input !== undefined ? { input } : {}), ...(ibufg !== undefined ? { ibufg } : {}), ...(reset !== undefined ? { reset } : {}), ...(locked !== undefined ? { locked } : {}),
        ...(!pll && div2 !== undefined ? { div2 } : {}), ...(!pll && phaseShift !== undefined ? { phaseShift } : {}), ...(outputs ? { outputs } : {}) };
      if (pll && (div2 !== undefined || phaseShift !== undefined)) throw toolError('divide_input_by_2 and phase_shift: a Spartan-3E DCM\'s (a Spartan-6 PLL output has its own phase)');
      await checkName(name, spec.name, spec.lang, t.path);
      // the wizard's checks: the ports' names, then the plan's own errors
      const { identError } = await import('../core/modgen.js');
      const portErr = (label, n) => { const e = identError(n, spec.lang); return e ? `${label}: ${e}.` : null; };
      if (!(spec.inMHz > 0)) throw toolError('Enter the input clock frequency.');
      const e = portErr('Input port', spec.input) || (spec.reset && portErr('Reset input', spec.reset)) || (spec.locked && portErr('LOCKED output', spec.locked))
        || spec.outputs.map(o => portErr(`Output ${o.pin || o.port}`, o.port)).find(Boolean);
      if (e) throw toolError(e);
      const names = [spec.input, spec.reset, spec.locked, ...spec.outputs.map(o => o.port)].filter(Boolean);
      if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw toolError('Two ports have the same name.');
      const plan = planClock(spec);
      if (plan.errors.length) throw toolError(plan.errors.join('\n'));
      const { code } = clockModule(spec);
      const did = await write(name, t.path, code, !t.old);
      const lines = [`Clocking Wizard: ${did} ${t.path}, the module ${spec.name}: ${plan.outputs.map(o => `${o.port} ${mhzText(o.mhz)}`).join(', ')}.`,
        ...plan.outputs.filter(o => o.asked !== null && o.asked !== undefined && Math.abs(o.asked - o.mhz) > 1e-6).map(o => `${o.port}: ${mhzText(o.mhz)}, the nearest to the ${mhzText(o.asked)} asked (${o.note})`), ...plan.notes];
      return { text: lines.join('\n'), data: { project: name, path: t.path, module: spec.name, primitive: plan.primitive, outputs: plan.outputs.map(o => ({ pin: o.pin, port: o.port, mhz: o.mhz, asked: o.asked ?? null })), notes: plan.notes } };
    },
  },
  {
    name: 'block_memory', title: 'Block Memory wizard',
    description: 'Make a memory module as the Block Memory wizard does: a RAM or a ROM of the device\'s block RAMs (Spartan-3E, Spartan-6), one port or two, its width and depth, its write mode, written as the block RAM primitives or as inferable HDL, its initial contents from a .mem or .coe file of the project. Or edit: a module the wizard made, made again with the settings given changed. Returns the block RAMs it takes.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, name: STR('The module\'s name (default bram; its file is named after it).'), location: STR('Its folder (default src).'), language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'Its language (default: the project\'s Preferred Language).' },
      edit: STR('A module the wizard made (its file): made again with the settings given.'),
      kind: { type: 'string', enum: ['ram', 'rom'], description: 'RAM (default) or ROM.' }, ports: { type: 'string', enum: ['single', 'dual'], description: 'One port (default) or two.' },
      width: { type: 'integer', description: 'The word\'s bits (default 8).' }, depth: { type: 'integer', description: 'The words (default 1024).' },
      write_mode: { type: 'string', enum: ['READ_FIRST', 'WRITE_FIRST', 'NO_CHANGE'], description: 'The write mode (default READ_FIRST).' },
      style: { type: 'string', enum: ['primitive', 'inferred'], description: 'Written as the block RAM primitives (default) or as inferable HDL.' },
      init: STR('The initial contents: a .mem or .coe file of the project, or "" for zeros.'),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, name: modName, location, language, edit, kind, ports, width, depth, write_mode: writeMode, style, init }) {
      const pj = await readProject(name);
      const { familyProfile } = await import('../core/family-profile.js');
      const { memoryModule, planMemory, readInitFile, MEMORY_FAMILIES } = await import('../core/blockram.js');
      const family = pj.device?.family;
      if (!MEMORY_FAMILIES.includes(family)) throw toolError('The Block Memory wizard makes block RAMs of the Spartan-3E and the Spartan-6: choose one of them as the target device (set_design_properties).');
      const lang0 = language || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
      const t = await target(name, { edit, file: modName || 'bram', location, lang: lang0, kind: 'memory', wizardName: 'Block Memory wizard' });
      if (t.old && t.old.family !== family) throw toolError(`${edit} was made for another family of devices than the project's: make a new one.`);
      if (edit && (modName !== undefined || language !== undefined || location !== undefined)) throw toolError('edit: the module\'s name, language and location stay its own');
      const have = await deviceCount(pj, familyProfile(family).blockRam.resource);
      if (have === 0) throw toolError('This device has no block RAM.');
      const spec = { ...(t.old || { wizard: 'memory', version: 1, name: modName || 'bram', lang: lang0, family, kind: 'ram', ports: 'single', width: 8, depth: 1024, writeMode: 'READ_FIRST', style: 'primitive', init: '' }),
        ...(kind ? { kind } : {}), ...(ports ? { ports } : {}), ...(width !== undefined ? { width } : {}), ...(depth !== undefined ? { depth } : {}), ...(writeMode ? { writeMode } : {}), ...(style ? { style } : {}), ...(init !== undefined ? { init } : {}) };
      await checkName(name, spec.name, spec.lang, t.path);
      if (spec.init && !/\.(mem|coe)$/i.test(spec.init)) throw toolError(`init: ${spec.init} is not a .mem or .coe file`);
      const plan = planMemory(spec);
      if (plan.errors.length) throw toolError(plan.errors.join('\n'));
      const halves = familyProfile(family).blockRam.halves;
      if (have !== null && plan.halves > have) throw toolError(halves ? `It takes ${plan.halves} halves of 9 Kbit and the device has ${have}: make it smaller.` : `It takes ${plan.blocks} block RAMs and the device has ${have}: make it smaller.`);
      // the initial contents (the wizard's contentsOf)
      let c = { words: [], errors: [] };
      if (spec.init) {
        const text = await projectText(name, spec.init, `${spec.init} cannot be read.`);
        c = readInitFile(text, spec.init, +spec.width, +spec.depth);
      }
      if (c.errors.length) throw toolError(c.errors.join('\n'));
      const { code } = memoryModule(spec, c.words);
      const did = await write(name, t.path, code, !t.old);
      const used = halves ? `${plan.blocks} ${plan.prim}${have === null ? '' : ` (${plan.halves} of the ${have} halves of 9 Kbit on this device)`}` : `${plan.blocks} RAMB16${have === null ? '' : ` of the ${have} on this device`}`;
      return { text: [`Block Memory: ${did} ${t.path}, the module ${spec.name}: ${spec.depth} x ${spec.width}, ${spec.style === 'inferred' ? 'inferable HDL' : `${plan.blocks} ${plan.primName}`}.`,
        `Block RAMs: ${used}; ${plan.primName} of ${plan.shape.depth} x ${plan.shape.width}, ${plan.cols} side by side${plan.rows > 1 ? `, ${plan.rows} deep` : ''}.`].join('\n'),
      data: { project: name, path: t.path, module: spec.name, blocks: plan.blocks, primitive: plan.primName, halves: plan.halves, deviceBlocks: have } };
    },
  },
  {
    name: 'constraints_wizard', title: 'UCF Wizard',
    description: 'Write a constraints file (UCF) for a module\'s ports, as the UCF Wizard does: each bit of its ports on a pin of the project\'s board, assigned by their names (clk, led, sw, btn, seg, an…) and directions, the clock\'s period from the board; pins given override them (a net: x, or x<3> for a bit of a bus), and with no board they are all given. The project\'s constraints file when it has none. A file that exists is not replaced (set_top with update_constraints writes the project\'s again).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, module: STR('The module (default: the project\'s top).'), name: STR('The file\'s name (default: the module\'s).'), location: STR('Its folder (default constraints).'),
      pins: { type: 'object', additionalProperties: { type: 'string' }, description: 'Pins given: { net: pin }, e.g. { "led<0>": "M5", "clk": "B8" }.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, module, name: file, location, pins = {} }) {
      const pj = await readProject(name);
      const { constraintsFormatOf, generateUcf, bitName, boardAutoAssign } = await import('../packages/silinx-fpga/src/parts.js');
      const format = constraintsFormatOf(pj.device);
      if (format !== 'ucf') throw toolError(`the ${String(pj.device.part).toUpperCase()}'s constraints are a${['xdc', 'lpf'].includes(format) ? 'n' : ''} ${format.toUpperCase()}: new_source constraints writes one`);
      const { compile, elaborate } = await import('../core/compile.js');
      const { primitiveSources } = await import('../core/unisim.js');
      const { viewSourcesOf } = await import('./mcp-util.js');
      const design = (await viewSourcesOf(name, pj, false)).filter(x => (x.role || 'design') === 'design');
      const lib = compile([...primitiveSources(design), ...design]);
      const mods = [...lib.modules.values()].filter(m => design.some(x => x.path === m.file) && m.kind !== 'package');
      const top = mods.find(m => m.name.toLowerCase() === String(module ?? pj.top ?? '').toLowerCase())?.name || (module ? null : mods[0]?.name);
      if (!top) throw toolError(module ? `no design module '${module}' in the project` : 'The project has no design module.');
      // its ports as I/O Pin Planning reads them, a net a bit
      const d = elaborate(lib, top);
      if (!d.top) throw toolError(`The ports of '${top}' cannot be read: ${(d.diags || []).find(x => x.severity === 'error')?.message || 'it does not elaborate'}.`);
      const ports = d.top.ports.map(p => { const t = p.sig.t; const bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null, bus }; });
      const nets = [];
      for (const p of ports) {
        if (!p.bus) { nets.push(bitName(p.name)); continue; }
        const step = p.msb >= p.lsb ? -1 : 1;
        for (let i = p.msb; ; i += step) { nets.push(bitName(p.name, i)); if (i === p.lsb) break; }
      }
      const { resolveBoard } = await import('./devices.js');
      const board = pj.board ? resolveBoard(pj.board, { part: pj.device.part }) : null;
      let asg = {}, clocks = [], unmatched = [];
      if (board) ({ assignments: asg, clocks, unmatched } = boardAutoAssign(ports, { ...board.board, device: board.device, resources: board.resources }, { byDirection: true }));
      for (const [net, pin] of Object.entries(pins)) {
        if (!nets.includes(net)) throw toolError(`pins: '${net}' is not a net of ${top} (${nets.slice(0, 12).join(', ')}${nets.length > 12 ? '…' : ''})`);
        if (pin) asg[net] = { ...(asg[net] || {}), loc: String(pin).trim().toUpperCase() }; else delete asg[net];
      }
      const used = new Map();
      for (const [net, x] of Object.entries(asg)) {
        const k = String(x.loc).toUpperCase();
        if (used.has(k)) throw toolError(`The pin ${x.loc} is given to ${used.get(k)} and ${net}.`);
        used.set(k, net);
      }
      const loc = String(location ?? 'constraints').trim().replace(/\/+$/, '');
      const base = String(file ?? top).trim().replace(/\.ucf$/i, '');
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(base)) throw toolError('Enter a valid file name (letters, digits, _ and -).');
      if (!/^[A-Za-z0-9_/-]+$/.test(loc) || loc.split('/').some(x => !x || x.startsWith('.')) || /^build(\/|$)/i.test(loc)) throw toolError('Invalid location.');
      const path = `${loc}/${base}.ucf`;
      const tree = await P.fileTree(name);
      if (tree.includes(path)) throw toolError(`${path} already exists: choose another name.`);
      const text = generateUcf({ ports, assignments: asg, clocks,
        header: `UCF generated by the Silinx UCF Wizard for '${top}' (${pj.device.part}${pj.device.speed}-${pj.device.package}${board ? `, ${board.board.name}` : ''})` });
      const noConstraints = !pj.constraints || !tree.includes(pj.constraints);
      await P.writeFile(name, path, text);
      if (noConstraints) await P.updateProject(name, x => ({ ...x, constraints: path }));
      const free = nets.filter(n => !asg[n]);
      return { text: [`UCF Wizard: created ${path} for ${top}: ${Object.keys(asg).length} of ${nets.length} net(s) on a pin${board ? ` of the ${board.board.name}` : ''}${clocks.length ? `, the period of ${clocks.map(c => c.net || c.port || c.name).join(', ')}` : ''}.`,
        ...(free.length ? [`WARNING: no pin for ${free.join(', ')}${board && unmatched.length ? ' (not on the board by its name)' : ''}.`] : []), ...(noConstraints ? [`${path} is the project's constraints file.`] : [])].join('\n'),
      data: { project: name, path, module: top, assigned: Object.keys(asg).length, nets: nets.length, unassigned: free, constraints: (await P.readProject(name)).constraints } };
    },
  },
];
