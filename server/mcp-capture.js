// The MCP server's logic analyzer tools (server/mcp.js, #2674, #3176): a project's capture settings (silinx.json
// `capture`: the signals to watch, the clock, the depth, the samples before the trigger, the trigger), checked on the
// design's top as Implement inserts the capture (core/ila-insert.js planInsertion, captureCost: each probe's signal
// and width, the core's block RAMs against the device's), shown, changed or cleared; and the capture on the board
// (server/ila-board.js captureProject: armed, its trigger waited for, read, saved in build/capture.json).
import * as P from './projects.js';
import { toolError, readProject, viewSourcesOf, PROJECT } from './mcp-util.js';

const OPS = ['=', '!=', 'rise', 'fall', 'change'];

// the project's design elaborated (its top, the implementation view's sources) and its device's family and block RAMs
async function designOf(name, pj) {
  if (!pj.top) throw toolError(`the project '${name}' has no top module (set_top): the capture's signals are the top's`);
  const { compile, elaborate } = await import('../core/compile.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const srcs = await viewSourcesOf(name, pj, false);
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const design = elaborate(lib, pj.top);
  const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errs.length) throw toolError(`the design has errors (check_syntax): ${errs.slice(0, 3).map(e => `${e.file}:${e.line} ${e.message}`).join('; ')}`);
  const { findPart } = await import('./devices.js');
  const { resourceCount } = await import('../packages/silinx-fpga/src/parts.js');
  const part = findPart(pj.device?.part);
  const family = part?.family || 'spartan3e';
  // (the family's block RAM, as the interface counts it: RAMB16s, the Spartan-6's halves; none counted on the 7-series)
  const { familyProfile } = await import('../core/family-profile.js');
  const ram = familyProfile(family).blockRam;
  const total = part && ram ? resourceCount(part, ram.resource) : null;
  return { design, family, total };
}

// a capture's settings on the design: the probes, the block RAMs, the errors
async function check(name, pj, settings) {
  const { planInsertion, captureCost } = await import('../core/ila-insert.js');
  const { triggerText } = await import('../core/ila.js');
  const { design, family, total } = await designOf(name, pj);
  const ins = planInsertion(design, settings, { family });
  const cost = ins.errors.length ? null : captureCost(ins.plan, total);
  const errors = [...ins.errors, ...(cost?.errors || [])];
  const path = n => ins.probes.find(p => p.name === n)?.path ?? n;
  const trigger = errors.length ? null : triggerText(ins.spec).replace(/\b(\w+)( rises| falls| changes| = | != )/g, (m, n, rest) => `${path(n)}${rest}`);
  const { captureClockText } = await import('../core/ila-insert.js');
  return { ins, cost, errors, family, trigger, clockText: captureClockText(settings) };
}

// the board's oscillator of the project's board (clock: 'board', #3481), or an error
async function boardClock(name, pj) {
  const { resolveBoard } = await import('./devices.js');
  const { boardClockOf } = await import('../core/ila-insert.js');
  const board = pj.board ? resolveBoard(pj.board, { variant: pj.boardVariant, part: pj.device?.part })?.board : null;
  if (!board) throw toolError(`clock board: the project '${name}' has no board (set_design_properties board): the board's clock is its oscillator`);
  const c = boardClockOf(board);
  if (!c) throw toolError(`clock board: the board ${board.name} has no oscillator of a known period`);
  return c;
}

const summary = (settings, r) => [
  `Capture: ${r.ins.probes.map(p => `${p.path} (${p.width} bit${p.width > 1 ? 's' : ''})`).join(', ')}; ${r.ins.plan.width} bits x ${settings.depth} samples on ${r.clockText}, ${settings.pre ?? 0} before the trigger: ${r.trigger}.`,
  `Block RAMs: ${r.cost.blocks} (${r.ins.plan.memory?.primName || 'inferred'})${r.cost.total != null ? ` of the device's ${r.family === 'spartan6' ? `${r.cost.total / 2} RAMB16BWER` : `${r.cost.total} RAMB16`}` : ''}.`,
];
const dataOf = (name, settings, r) => ({ project: name, capture: settings, probes: r.ins.probes.map(({ path, width, kind }) => ({ path, width, kind })),
  width: r.ins.plan.width, blocks: r.cost.blocks, deviceBlocks: r.cost.total == null ? null : r.family === 'spartan6' ? r.cost.total / 2 : r.cost.total, trigger: r.trigger });

export const CAPTURE_TOOLS = [
  {
    name: 'capture_settings', title: 'Logic Analyzer Settings',
    description: 'Show, change or clear a project\'s logic analyzer capture (as ChipScope / Vivado\'s ILA): the signals of the design to watch on the board (probes: each signal\'s path below the top, e.g. count, u_ctl.state, g[1].q; vectors, integers, states, bits), the clock it samples on (a signal, or the board\'s oscillator for a design with no clock), the depth (samples, a power of 2 from 16 to 16384), the samples kept before the trigger (pre), and the trigger (conditions on the probes: = / != a value, rise / fall of a bit, change; combined by and / or; none: the first sample). Implement adds the capture core to the design (its sources unchanged) with a BSCAN, through which the PC reads it over the JTAG cable. Checked on the design\'s top: each probe\'s width, the block RAMs it takes against the device\'s (one kept for the design). No settings given: the current ones; clear: none.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      probes: { type: 'array', items: { type: 'string' }, description: 'The signals to watch, by their path below the top (count, u_ctl.state).' },
      clock: { type: 'string', description: 'The clock the samples are taken on: a signal of one bit (e.g. clk), or board: the board\'s own oscillator (e.g. the Basys2\'s MCLK, 50 MHz), for a design with no clock (a combinational one); Implement then puts the capture\'s clock port on its pin.' },
      depth: { type: 'integer', description: 'The samples of a capture: a power of 2 from 16 to 16384.' },
      pre: { type: 'integer', description: 'The samples kept before the trigger (0 to depth - 1; default 0).' },
      trigger: { type: 'object', properties: {
        combine: { type: 'string', enum: ['and', 'or'], description: 'All the conditions (and) or any (or).' },
        conditions: { type: 'array', items: { type: 'object', properties: {
          probe: { type: 'string', description: 'One of the probes.' },
          op: { type: 'string', enum: OPS, description: '= / != a value; rise / fall of a probe of one bit; change.' },
          value: { type: ['string', 'integer'], description: 'For = and !=: a number (decimal, 0x…, 0b…), a state\'s name.' },
        }, required: ['probe', 'op'], additionalProperties: false } },
      }, additionalProperties: false, description: 'The trigger; none: the first sample after the samples before it.' },
      clear: { type: 'boolean', description: 'Remove the capture: Implement then adds none.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, probes, clock, depth, pre, trigger, clear }) {
      const pj = await readProject(name);
      const given = [probes, clock, depth, pre, trigger].some(x => x !== undefined);
      if (clear) {
        if (given) throw toolError('clear removes the capture: give no settings with it');
        await P.updateProject(name, ({ capture, ...p }) => p);
        return { text: `${name}: no capture (Implement adds no logic analyzer).`, data: { project: name, capture: null } };
      }
      const old = pj.capture || null;
      if (!given) {
        if (!old) return { text: `${name}: no capture (capture_settings with probes, clock and depth adds one).`, data: { project: name, capture: null } };
        const r = await check(name, pj, old);
        if (r.errors.length) return { text: [`${name}: the capture no longer fits the design:`, ...r.errors].join('\n'), data: { project: name, capture: old, errors: r.errors } };
        return { text: summary(old, r).join('\n'), data: dataOf(name, old, r) };
      }
      for (const c of trigger?.conditions || []) if (!OPS.includes(c.op)) throw toolError(`op: one of ${OPS.join(', ')}`);
      // (the board's clock, or a signal: the one replaces the other)
      const { clock: c0, boardClock: b0, ...kept } = old || {};
      const which = clock === undefined ? (b0 ? { boardClock: b0 } : c0 !== undefined ? { clock: c0 } : {})
        : String(clock).toLowerCase() === 'board' ? { boardClock: await boardClock(name, pj) } : { clock };
      const settings = { ...kept, ...which, ...(probes !== undefined && { probes }), ...(depth !== undefined && { depth }), ...(pre !== undefined && { pre }),
        ...(trigger !== undefined && { trigger: { combine: trigger.combine || 'and', conditions: trigger.conditions || [] } }) };
      if (settings.pre === undefined) settings.pre = 0;
      if (!settings.trigger) settings.trigger = { combine: 'and', conditions: [] };
      const r = await check(name, pj, settings);
      if (r.errors.length) throw toolError(r.errors.join('\n'));
      await P.updateProject(name, p => ({ ...p, capture: settings }));
      return { text: summary(settings, r).join('\n'), data: dataOf(name, settings, r) };
    },
  },
  {
    name: 'capture', title: 'Logic Analyzer Capture',
    description: 'Capture the design\'s signals on the board with its logic analyzer: the board must be programmed with the design Implement built with its capture (capture_settings). Arms the capture over the JTAG cable (the Digilent Adept USB of the Basys2 / Nexys2, through adepttool), waits for its trigger (timeout_s), reads the samples and saves them in build/capture.json: each probe\'s values, oldest first, the trigger\'s sample at index pre. arm: false waits again for a capture already armed (after a timeout). Returns each probe\'s samples around the trigger, and all of them in its data.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      arm: { type: 'boolean', description: 'Arm a new capture (default true); false: wait for the one armed.' },
      timeout_s: { type: 'number', description: 'How long to wait for the trigger (seconds, default 10).' },
      device: { type: 'integer', description: 'The Adept board\'s index when several are connected (default 0).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, arm = true, timeout_s: timeout = 10, device = 0 }, { link = null } = {}) {
      await readProject(name);
      if (!(timeout > 0)) throw toolError('timeout_s: a number of seconds above 0');
      const { captureProject } = await import('./ila-board.js');
      const log = [];
      let r;
      try { r = await captureProject(name, { arm, timeoutMs: timeout * 1000, device, log: l => log.push(l), link }); } catch (e) { throw toolError(e.message); }
      const { capture: c } = r, at = c.trigger, from = Math.max(0, at - 2), to = Math.min(c.depth, at + 3);
      const around = c.probes.map(p => `  ${p.path}: ${p.samples.slice(from, to).map(v => BigInt(v).toString(10)).join(' ')}`);
      return {
        text: [...log, `Captured ${c.depth} samples of ${c.probes.map(p => p.path).join(', ')} on ${c.clock}; the trigger at sample ${at}. Saved in ${r.file}.`,
          `Samples ${from} to ${to - 1}:`, ...around].join('\n'),
        data: { project: name, file: r.file, trigger: at, polls: c.polls, depth: c.depth, pre: c.pre, probes: c.probes },
      };
    },
  },
];
