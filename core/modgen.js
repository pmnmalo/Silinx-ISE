// Generators of the beginner wizards of the New Source dialog (web/js/modwizard.js):
//
//   Module (Wizard):     generateModule(opts) -> VHDL or Verilog text of a new module, commented,
//                        with a combinational or a sequential (clocked) template.
//   Schematic (Wizard):  schematicFromPorts(opts) -> a .sch.json document with the I/O markers
//                        placed tidily (inputs on the left, outputs on the right).
//
// Both take the ports as the wizard's friendly table gives them:
//   ports: [{ name, dir: 'in'|'out'|'inout', width: 1..256 (1 = single bit, N = bus N-1 downto 0), desc? }]
// An 'inout' port is a bidirectional (tri-state) port: the module drives it only when its output
// enable <port>_oe is 1 and releases it ('Z') otherwise; it reads the bus from the port itself.
// and checkPorts() validates that table (identifiers, reserved words, duplicates, widths).
// Isomorphic (no DOM).
import { newDoc, normalizeDoc, portBox, GRID } from './schdoc.js';

// ===================================================================== identifiers
// VHDL-2008 reserved words (VHDL is case-insensitive)
const VHDL_RESERVED = new Set(('abs access after alias all and architecture array assert assume assume_guarantee attribute begin block body buffer bus case component configuration constant context cover default disconnect downto else elsif end entity exit fairness file for force function generate generic group guarded if impure in inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package parameter port postponed procedure process property protected pure range record register reject release rem report restrict restrict_guarantee return rol ror select sequence severity shared signal sla sll sra srl strong subtype then to transport type unaffected units until use variable vmode vprop vunit wait when while with xnor xor').split(' '));
// Verilog-2005 keywords (plus a few SystemVerilog ones students meet: logic, bit, byte, int)
const VLOG_RESERVED = new Set(('always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config deassign default defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable endtask event for force forever fork function generate genvar highz0 highz1 if ifnone incdir include initial inout input instance integer join large liblist library localparam macromodule medium module nand negedge nmos nor noshowcancelled not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use uwire vectored wait wand weak0 weak1 while wire wor xnor xor logic bit byte int').split(' '));

export const MAX_WIDTH = 256;

/** Is `name` a reserved word of the language? (VHDL: any case) */
export function isReserved(name, lang) {
  return lang === 'verilog' ? VLOG_RESERVED.has(name) : VHDL_RESERVED.has(String(name).toLowerCase());
}

/** Why `name` is not a valid identifier in `lang` (an English message), or null when it is valid.
 *  Both languages: a letter first, then letters, digits and _ (no __ and no _ at the end, as VHDL wants). */
export function identError(name, lang) {
  const n = String(name ?? '');
  if (!n) return 'the name is empty';
  if (!/^[A-Za-z]/.test(n)) return `'${n}' must start with a letter`;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n)) return `'${n}' may only contain letters, digits and _`;
  if (/__/.test(n) || /_$/.test(n)) return `'${n}': no double __ and no _ at the end`;
  if (isReserved(n, lang)) return `'${n}' is a reserved word of ${lang === 'verilog' ? 'Verilog' : 'VHDL'}`;
  return null;
}

/** Validates the port table (and the module name, the generics): the first problem found as an
 *  English message, or null. Names are compared ignoring case (VHDL is case-insensitive). */
export function checkPorts(ports, { lang = 'vhdl', name = null, generics = [] } = {}) {
  const seen = new Map();
  if (name != null) {
    const e = identError(name, lang);
    if (e) return `Module name: ${e}.`;
  }
  for (const [k, p] of ports.entries()) {
    const e = identError(String(p.name ?? '').trim(), lang);
    if (e) return `Port ${k + 1}: ${e}.`;
    const key = p.name.toLowerCase();
    if (name != null && key === String(name).toLowerCase()) return `Port '${p.name}' has the name of the module.`;
    if (seen.has(key)) return `Two ports are named '${p.name}'${seen.get(key) !== p.name ? ` (letter case does not count: '${seen.get(key)}')` : ''}.`;
    seen.set(key, p.name);
    if (!['in', 'out', 'inout'].includes(p.dir)) return `Port '${p.name}': the direction must be input, output or bidirectional (inout).`;
    const w = Number(p.width);
    if (!Number.isInteger(w) || w < 1 || w > MAX_WIDTH) return `Port '${p.name}': the width must be a whole number from 1 to ${MAX_WIDTH}.`;
  }
  for (const g of generics) {
    const e = identError(String(g.name ?? '').trim(), lang);
    if (e) return `Generic: ${e}.`;
    const key = g.name.toLowerCase();
    if (seen.has(key)) return `The generic '${g.name}' has the name of a port or of another generic.`;
    seen.set(key, g.name);
    if (!/^-?\d+$/.test(String(g.default ?? '').trim())) return `Generic '${g.name}': the default value must be a whole number.`;
  }
  return null;
}

/** Ports offered by the quick-add buttons of the wizards (the usual names of the board labs). */
export const QUICK_PORTS = [
  { name: 'clk', dir: 'in', width: 1, desc: 'clock' },
  { name: 'reset', dir: 'in', width: 1, desc: 'reset' },
  { name: 'enable', dir: 'in', width: 1, desc: 'enable' },
  { name: 'a', dir: 'in', width: 8, desc: 'operand a' },
  { name: 'b', dir: 'in', width: 8, desc: 'operand b' },
  { name: 'sel', dir: 'in', width: 1, desc: 'select' },
  { name: 'sw', dir: 'in', width: 4, desc: 'switches' },
  { name: 'btn', dir: 'in', width: 4, desc: 'push buttons' },
  { name: 'y', dir: 'out', width: 1, desc: 'output' },
  { name: 'sum', dir: 'out', width: 8, desc: 'sum' },
  { name: 'q', dir: 'out', width: 8, desc: 'register value' },
  { name: 'led', dir: 'out', width: 8, desc: 'LEDs' },
  { name: 'seg', dir: 'out', width: 7, desc: '7-segment display segments (a..g)' },
  { name: 'an', dir: 'out', width: 4, desc: '7-segment display anodes' },
  { name: 'data', dir: 'inout', width: 8, desc: 'bidirectional data bus' },
  { name: 'sda', dir: 'inout', width: 1, desc: 'bidirectional line' },
];

/** Likely clock / reset among the 1-bit inputs (by name), and the reset's active level. */
export function guessClockReset(ports) {
  const bits = ports.filter(p => p.dir === 'in' && +p.width === 1).map(p => p.name);
  const clock = bits.find(n => /^(clk|clock|mclk|sysclk|clk_?\w*|\w*_clk)$/i.test(n)) || '';
  const reset = bits.find(n => n !== clock && /^(rst|reset|clr|clear|rst_?n|resetn|reset_n|nreset|rst_\w+|\w*_rst)$/i.test(n)) || '';
  return { clock, reset, active: /(_n|n)$/i.test(reset) && !/^(reset|rst)$/i.test(reset) ? '0' : '1' };
}

// ===================================================================== text helpers
const today = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const descLines = s => String(s ?? '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));

function header(lang, name, project, description) {
  const c = lang === 'verilog' ? '//' : '--';
  const rule = lang === 'verilog' ? '//////////////////////////////////////////////////////////////////////////////////' : '----------------------------------------------------------------------------------';
  const d = descLines(description);
  const dev = project?.device ? `${project.device.part}${project.device.speed}-${project.device.package}` : '';
  return [
    ...(lang === 'verilog' ? ['`timescale 1ns / 1ps'] : []),
    rule,
    `${c} Company:`,
    `${c} Engineer:`,
    c,
    `${c} Create Date:    ${today()}`,
    `${c} Design Name:    ${name}`,
    `${c} Module Name:    ${name}`,
    `${c} Project Name:   ${project?.name || ''}`,
    `${c} Target Devices: ${dev}`,
    `${c} Tool versions:  Silinx`,
    `${c} Description:    ${d[0] || ''}`.replace(/\s+$/, ''),
    ...d.slice(1).map(l => `${c}                 ${l}`.replace(/\s+$/, '')),
    c,
    `${c} Created with the Module Wizard of Silinx ISE.`,
    c,
    `${c} Revision:`,
    `${c} Revision 0.01 - File Created`,
    rule,
  ].join('\n') + '\n';
}

// aligns "code  -- comment" lines: comment column after the longest code part
function withComments(rows, c) {
  const w = Math.max(0, ...rows.filter(r => r[1]).map(r => r[0].length));
  return rows.map(([code, cm]) => (cm ? `${code.padEnd(w)}  ${c} ${cm}` : code));
}

const vhdlType = w => (w > 1 ? `std_logic_vector(${w - 1} downto 0)` : 'std_logic');
const vhdlZero = w => (w > 1 ? "(others => '0')" : "'0'");
const vlogRange = w => (w > 1 ? `[${w - 1}:0] ` : '');
const vlogZero = w => `${w}'b0`;
const vhdlHighZ = w => (w > 1 ? "(others => 'Z')" : "'Z'");
const vlogHighZ = w => `${w}'bz`;

/** A name not used yet (ignoring case): base, base_1, base_2… */
function freshName(base, used) {
  let n = base, k = 0;
  while (used.has(n.toLowerCase())) n = `${base}_${++k}`;
  used.add(n.toLowerCase());
  return n;
}

// ===================================================================== module generator
/**
 * Text of a new VHDL or Verilog module.
 * opts: { name, lang: 'vhdl'|'verilog', arch = 'rtl' (VHDL), description, project: { name, device },
 *         ports: [{ name, dir: 'in'|'out', width, desc }],
 *         kind: 'comb'|'seq',
 *         combStyle: 'assign'|'process'       (combinational: concurrent assignments or a process),
 *         clock: port name                     (sequential),
 *         reset: { port, mode: 'none'|'sync'|'async', active: '1'|'0' }   (sequential),
 *         enable: port name or ''              (sequential: the registers load only when it is 1),
 *         generics: [{ name, default, desc }]  (type integer) }
 * Throws on an invalid option (checkPorts() message).
 */
export function generateModule(opts) {
  const lang = opts.lang === 'verilog' ? 'verilog' : 'vhdl';
  const name = String(opts.name || '').trim();
  const ports = (opts.ports || []).map(p => ({ name: String(p.name).trim(), dir: p.dir, width: +p.width || 1, desc: oneLine(p.desc) }));
  const generics = (opts.generics || []).map(g => ({ name: String(g.name).trim(), default: String(g.default ?? '0').trim(), desc: oneLine(g.desc) }));
  const err = checkPorts(ports, { lang, name, generics });
  if (err) throw new Error(err);
  const kind = opts.kind === 'seq' ? 'seq' : 'comb';
  const byName = n => ports.find(p => p.name === n);
  let clock = null, reset = null, enable = null, rmode = 'none', active = opts.reset?.active === '0' ? '0' : '1';
  if (kind === 'seq') {
    clock = byName(opts.clock);
    if (!clock || clock.dir !== 'in' || clock.width !== 1) throw new Error('A sequential module needs a clock: a 1-bit input.');
    rmode = ['sync', 'async'].includes(opts.reset?.mode) ? opts.reset.mode : 'none';
    if (rmode !== 'none') {
      reset = byName(opts.reset.port);
      if (!reset || reset.dir !== 'in' || reset.width !== 1 || reset === clock) throw new Error('The reset must be a 1-bit input other than the clock.');
    }
    if (opts.enable) {
      enable = byName(opts.enable);
      if (!enable || enable.dir !== 'in' || enable.width !== 1 || enable === clock || enable === reset) throw new Error('The enable must be a 1-bit input other than the clock and the reset.');
    }
  }
  const ins = ports.filter(p => p.dir === 'in');
  const outs = ports.filter(p => p.dir === 'out');
  const ios = ports.filter(p => p.dir === 'inout');   // bidirectional (tri-state) ports
  const data = ins.filter(p => p !== clock && p !== reset && p !== enable);
  const o = { name, ports, generics, kind, clock, reset, enable, rmode, active, ins, outs, ios, data, combStyle: opts.combStyle === 'process' ? 'process' : 'assign' };
  return lang === 'vhdl'
    ? header('vhdl', name, opts.project, opts.description) + vhdlBody(o, String(opts.arch || '').trim() || 'rtl')
    : header('verilog', name, opts.project, opts.description) + vlogBody(o);
}

// comment lines on the reset of a sequential module
function resetLines(o, c) {
  if (!o.reset) return [`${c} No reset.`];
  const lvl = o.active === '1' ? "high ('1')" : "low ('0')";
  return [`${c} Reset: ${o.reset.name}, ${o.rmode === 'async' ? 'asynchronous' : 'synchronous'}, active ${lvl}; it sets every register to 0`,
    `${c} ${o.rmode === 'async' ? 'at once, without waiting for the clock.' : `at a rising edge of ${o.clock.name}.`}`];
}

// ---------------------------------------------------------------- VHDL
function vhdlBody(o, arch) {
  const L = [];
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;   -- unsigned / signed arithmetic: unsigned(a) + 1', '');
  L.push(`entity ${o.name} is`);
  if (o.generics.length) {
    const rows = o.generics.map((g, k) => [`    ${g.name} : integer := ${g.default}${k < o.generics.length - 1 ? ';' : ''}`, g.desc]);
    L.push('  generic (', ...withComments(rows, '--'), '  );');
  }
  if (o.ports.length) {
    const nw = Math.max(...o.ports.map(p => p.name.length));
    const rows = o.ports.map((p, k) => [`    ${p.name.padEnd(nw)} : ${p.dir.padEnd(3)} ${vhdlType(p.width)}${k < o.ports.length - 1 ? ';' : ''}`,
      p.desc || (p === o.clock ? 'clock' : p === o.reset ? `reset (active ${o.active === '1' ? 'high' : 'low'})` : p === o.enable ? 'enable' : '')]);
    L.push('  port (', ...withComments(rows, '--'), '  );');
  }
  L.push(`end ${o.name};`, '');
  L.push(`architecture ${arch} of ${o.name} is`, '');
  const used = new Set([...o.ports.map(p => p.name.toLowerCase()), ...o.generics.map(g => g.name.toLowerCase()), o.name.toLowerCase(), arch.toLowerCase()]);
  // bidirectional ports: an output enable and the value driven (internal signals)
  const tri = o.ios.map(p => ({ p, oe: freshName(`${p.name}_oe`, used), out: freshName(`${p.name}_out`, used) }));
  let valueEx = w => o.data.find(p => p.width === w)?.name || vhdlZero(w);   // example value of a TODO
  const triDecls = () => {
    for (const t of tri) {
      L.push(`  -- bidirectional port ${t.p.name}: ${t.oe} = '1' drives ${t.p.name} with ${t.out}, '0' releases it ('Z')`,
        `  signal ${t.oe} : std_logic;`, `  signal ${t.out} : ${vhdlType(t.p.width)};`);
    }
    if (tri.length) L.push('');
  };
  // the tri-state driver of each bidirectional port (with its enable and value, or the driver alone)
  const triDrivers = (withValues) => {
    for (const t of tri) {
      const w = t.p.width;
      L.push(`  -- Bidirectional (tri-state) port ${t.p.name}: the module drives the bus only while ${t.oe} is '1';`,
        "  -- otherwise it releases it ('Z', high impedance) so that another circuit can drive it.",
        `  -- Read the bus from ${t.p.name} itself: it carries the value of whoever drives it.`);
      if (withValues) {
        L.push(`  -- TODO: when does the module drive ${t.p.name}? e.g. ${t.oe} <= ${oeExample(o, "'1'")};   and the value, e.g. ${t.out} <= ${valueEx(w)};`,
          `  ${t.oe} <= '0';   -- '0': ${t.p.name} released (only read) until you write the condition`,
          `  ${t.out} <= ${vhdlZero(w)};`);
      }
      L.push(`  ${t.p.name} <= ${t.out} when ${t.oe} = '1' else ${vhdlHighZ(w)};   -- tri-state driver`, '');
    }
  };
  if (o.kind === 'comb') {
    L.push('  -- internal signals, if you need them, are declared here, e.g.', '  --   signal t : std_logic_vector(7 downto 0);', '');
    triDecls();
    L.push('begin', '');
    const reads = [...o.ins, ...o.ios];   // what the logic reads (a bidirectional port: the bus)
    const targets = [...o.outs.map(p => ({ name: p.name, width: p.width })), ...tri.map(t => ({ name: t.out, width: t.p.width }))];
    if (!o.outs.length && !tri.length) L.push('  -- (the module has no outputs)', '');
    else if (o.combStyle === 'process' && reads.length) {
      L.push('  -- Combinational logic: the process runs again whenever one of the inputs in its',
        '  -- sensitivity list changes. Every output first gets a default value, so it has a',
        '  -- value on every path through the process and no latch is inferred.');
      const lbl = freshName('comb', used);
      L.push(`  ${lbl} : process (${reads.map(p => p.name).join(', ')})`, '  begin');
      for (const p of o.outs) L.push(`    ${p.name} <= ${vhdlZero(p.width)};   -- default value`);
      for (const t of tri) L.push(`    ${t.oe} <= '0';   -- default: ${t.p.name} released ('Z')`, `    ${t.out} <= ${vhdlZero(t.p.width)};   -- default value`);
      L.push('', '    -- TODO: describe the logic here, e.g.', `    --   if ${reads[0].name}${reads[0].width > 1 ? ` = "${'0'.repeat(reads[0].width)}"` : " = '1'"} then`, `    --     ${targets[0].name} <= ${targets[0].width > 1 ? "(others => '1')" : "'1'"};`, '    --   end if;');
      if (tri.length) L.push(`    -- (${tri[0].oe} <= '1' where the module must drive ${tri[0].p.name})`);
      L.push(`  end process ${lbl};`, '');
      triDrivers(false);
    } else {
      if (o.outs.length) {
        L.push('  -- Combinational logic: one concurrent assignment per output; each one is evaluated',
          '  -- again whenever a signal on its right-hand side changes.',
          `  -- TODO: replace each 0 by the expression of the output, e.g. ${o.outs[0].name} <= ${reads.length ? vhdlExample(reads, o.outs[0]) : vhdlZero(o.outs[0].width)};`);
        for (const p of o.outs) L.push(`  ${p.name} <= ${vhdlZero(p.width)};`);
        L.push('');
      }
      triDrivers(true);
    }
    L.push(`end ${arch};`, '');
    return L.join('\n');
  }
  // sequential
  const regs = o.outs.map(p => ({ p, reg: freshName(`${p.name}_reg`, used) }));
  if (regs.length) {
    L.push('  -- registers: they keep the value of each output between two clock edges', '  -- (outputs cannot be read inside the architecture, the registers can)');
    for (const r of regs) L.push(`  signal ${r.reg} : ${vhdlType(r.p.width)}${o.reset ? '' : ` := ${vhdlZero(r.p.width)}`};`);
    if (!o.reset) L.push('  -- (no reset: the registers start at 0 when the FPGA is configured)');
    L.push('');
  } else L.push('  -- internal signals (registers) are declared here, e.g.', `  --   signal count : unsigned(7 downto 0);`, '');
  triDecls();
  valueEx = w => regs.find(r => r.p.width === w)?.reg || o.data.find(p => p.width === w)?.name || vhdlZero(w);
  L.push('begin', '');
  const lvl = `'${o.active}'`;
  const rstAssign = pad => regs.map(r => `${pad}${r.reg} <= ${vhdlZero(r.p.width)};`);
  const nextState = pad => {
    const out = [`${pad}-- TODO: next-state logic: the value each register takes at the next clock edge, e.g.`];
    const r = regs[0];
    if (r) out.push(r.p.width > 1 ? `${pad}--   ${r.reg} <= std_logic_vector(unsigned(${r.reg}) + 1);   -- count up` : `${pad}--   ${r.reg} <= not ${r.reg};   -- toggle`);
    else out.push(`${pad}--   count <= count + 1;`);
    const lr = tri.length && regs.find(x => x.p.width === tri[0].p.width);
    if (lr) out.push(`${pad}--   ${lr.reg} <= ${tri[0].p.name};   -- load the value on the bus ${tri[0].p.name}`);
    out.push(`${pad}-- (a register that is not assigned here keeps its value)`);
    return out;
  };
  const lbl = freshName('registers', used);
  const body = pad => (o.enable ? [`${pad}if ${o.enable.name} = '1' then   -- the registers change only when ${o.enable.name} is 1`, ...nextState(pad + '  '), `${pad}end if;`] : nextState(pad));
  L.push(`  -- Sequential logic: the registers change only at the rising edge of ${o.clock.name}.`);
  L.push(...resetLines(o, '  --'));
  if (o.rmode === 'async') {
    L.push(`  ${lbl} : process (${o.clock.name}, ${o.reset.name})`, '  begin', `    if ${o.reset.name} = ${lvl} then`, ...rstAssign('      '),
      `    elsif rising_edge(${o.clock.name}) then`, ...body('      '), '    end if;', `  end process ${lbl};`, '');
  } else if (o.rmode === 'sync') {
    L.push(`  ${lbl} : process (${o.clock.name})`, '  begin', `    if rising_edge(${o.clock.name}) then`, `      if ${o.reset.name} = ${lvl} then`, ...rstAssign('        '),
      '      else', ...body('        '), '      end if;', '    end if;', `  end process ${lbl};`, '');
  } else {
    L.push(`  ${lbl} : process (${o.clock.name})`, '  begin', `    if rising_edge(${o.clock.name}) then`, ...body('      '), '    end if;', `  end process ${lbl};`, '');
  }
  if (regs.length) {
    L.push('  -- the outputs are the registers');
    for (const r of regs) L.push(`  ${r.p.name} <= ${r.reg};`);
    L.push('');
  }
  triDrivers(true);
  L.push(`end ${arch};`, '');
  return L.join('\n');
}

// a 1-bit input that could enable the driver of a bidirectional port (TODO examples)
function oeExample(o, dflt) {
  const b = o.data.find(p => p.width === 1);
  return b ? b.name : dflt;
}

function vhdlExample(ins, out) {
  const same = ins.filter(p => p.width === out.width);
  if (same.length >= 2) return `${same[0].name} and ${same[1].name}`;
  if (same.length === 1) return `not ${same[0].name}`;
  return vhdlZero(out.width);
}

// ---------------------------------------------------------------- Verilog
function vlogBody(o) {
  const L = [];
  const reads = [...o.ins, ...o.ios];   // what the logic reads (a bidirectional port: the bus)
  const regOut = o.kind === 'seq' || (o.combStyle === 'process' && reads.length);
  const procTri = o.kind === 'comb' && regOut;   // enable / value of the bidirectional ports set in always @(*)
  const used = new Set([...o.ports.map(p => p.name), ...o.generics.map(g => g.name), o.name].map(s => s.toLowerCase()));
  const tri = o.ios.map(p => ({ p, oe: freshName(`${p.name}_oe`, used), out: freshName(`${p.name}_out`, used) }));
  const valueEx = w => (o.kind === 'seq' ? o.outs.find(p => p.width === w)?.name : null) || o.data.find(p => p.width === w)?.name || vlogZero(w);
  const triDecls = () => {
    for (const t of tri) {
      L.push(`  // bidirectional port ${t.p.name}: ${t.oe} = 1 drives ${t.p.name} with ${t.out}, 0 releases it (z)`,
        `  ${procTri ? 'reg ' : 'wire'} ${t.oe};`, `  ${procTri ? 'reg ' : 'wire'} ${vlogRange(t.p.width)}${t.out};`);
    }
    if (tri.length) L.push('');
  };
  const triDrivers = () => {
    for (const t of tri) {
      const w = t.p.width;
      L.push(`  // Bidirectional (tri-state) port ${t.p.name}: the module drives the bus only while ${t.oe} is 1;`,
        "  // otherwise it releases it (z, high impedance) so that another circuit can drive it.",
        `  // Read the bus from ${t.p.name} itself: it carries the value of whoever drives it.`);
      if (!procTri) {
        L.push(`  // TODO: when does the module drive ${t.p.name}? e.g. assign ${t.oe} = ${oeExample(o, "1'b1")};   and the value, e.g. assign ${t.out} = ${valueEx(w)};`,
          `  assign ${t.oe} = 1'b0;   // 0: ${t.p.name} released (only read) until you write the condition`,
          `  assign ${t.out} = ${vlogZero(w)};`);
      }
      L.push(`  assign ${t.p.name} = ${t.oe} ? ${t.out} : ${vlogHighZ(w)};   // tri-state driver`, '');
    }
  };
  let head = `module ${o.name}`;
  if (o.generics.length) {
    const rows = o.generics.map((g, k) => [`    parameter integer ${g.name} = ${g.default}${k < o.generics.length - 1 ? ',' : ''}`, g.desc]);
    L.push(`${head} #(`, ...withComments(rows, '//'), ') (');
  } else L.push(`${head} (`);
  if (o.ports.length) {
    const decl = p => `${p.dir === 'in' ? 'input ' : p.dir === 'inout' ? 'inout ' : 'output'} ${p.dir === 'out' && regOut ? 'reg ' : 'wire'} ${vlogRange(p.width)}`;
    const dw = Math.max(...o.ports.map(p => decl(p).length));
    const rows = o.ports.map((p, k) => [`    ${decl(p).padEnd(dw)}${p.name}${k < o.ports.length - 1 ? ',' : ''}`,
      p.desc || (p === o.clock ? 'clock' : p === o.reset ? `reset (active ${o.active === '1' ? 'high' : 'low'})` : p === o.enable ? 'enable' : '')]);
    L.push(...withComments(rows, '//'));
  }
  L.push(');', '');
  if (o.kind === 'comb') {
    L.push('  // internal signals, if you need them, are declared here, e.g.', '  //   wire [7:0] t;', '');
    triDecls();
    const targets = [...o.outs.map(p => ({ name: p.name, width: p.width })), ...tri.map(t => ({ name: t.out, width: t.p.width }))];
    if (!o.outs.length && !tri.length) L.push('  // (the module has no outputs)', '');
    else if (regOut) {
      L.push('  // Combinational logic: the always block runs again whenever one of its inputs changes',
        '  // (@(*)). Every output first gets a default value, so it has a value on every path',
        '  // through the block and no latch is inferred. Use blocking assignments (=) here.');
      L.push('  always @(*) begin');
      for (const p of o.outs) L.push(`    ${p.name} = ${vlogZero(p.width)};   // default value`);
      for (const t of tri) L.push(`    ${t.oe} = 1'b0;   // default: ${t.p.name} released (z)`, `    ${t.out} = ${vlogZero(t.p.width)};   // default value`);
      L.push('', '    // TODO: describe the logic here, e.g.', `    //   if (${reads[0].name}${reads[0].width > 1 ? ` == ${reads[0].width}'d0` : ''})`, `    //     ${targets[0].name} = ${targets[0].width > 1 ? `{${targets[0].width}{1'b1}}` : "1'b1"};`);
      if (tri.length) L.push(`    // (${tri[0].oe} = 1'b1 where the module must drive ${tri[0].p.name})`);
      L.push('  end', '');
      triDrivers();
    } else {
      if (o.outs.length) {
        L.push('  // Combinational logic: one continuous assignment per output; each one is evaluated',
          '  // again whenever a signal on its right-hand side changes.',
          `  // TODO: replace each 0 by the expression of the output, e.g. assign ${o.outs[0].name} = ${reads.length ? vlogExample(reads, o.outs[0]) : vlogZero(o.outs[0].width)};`);
        for (const p of o.outs) L.push(`  assign ${p.name} = ${vlogZero(p.width)};`);
        L.push('');
      }
      triDrivers();
    }
    L.push('endmodule', '');
    return L.join('\n');
  }
  // sequential: the outputs are registers (output reg)
  const c = o.clock.name;
  const rstCond = o.reset ? (o.active === '1' ? o.reset.name : `!${o.reset.name}`) : '';
  const rstAssign = pad => o.outs.map(p => `${pad}${p.name} <= ${vlogZero(p.width)};`);
  const nextState = pad => {
    const out = [`${pad}// TODO: next-state logic: the value each register takes at the next clock edge, e.g.`];
    const p = o.outs[0];
    if (p) out.push(p.width > 1 ? `${pad}//   ${p.name} <= ${p.name} + 1;   // count up` : `${pad}//   ${p.name} <= ~${p.name};   // toggle`);
    else out.push(`${pad}//   count <= count + 1;`);
    const lr = tri.length && o.outs.find(x => x.width === tri[0].p.width);
    if (lr) out.push(`${pad}//   ${lr.name} <= ${tri[0].p.name};   // load the value on the bus ${tri[0].p.name}`);
    out.push(`${pad}// (a register that is not assigned here keeps its value; use non-blocking <=)`);
    return out;
  };
  const body = pad => (o.enable ? [`${pad}if (${o.enable.name}) begin   // the registers change only when ${o.enable.name} is 1`, ...nextState(pad + '  '), `${pad}end`] : nextState(pad));
  if (!o.outs.length) L.push('  // registers (internal), if you need them, are declared here, e.g.', '  //   reg [7:0] count;', '');
  triDecls();
  if (!o.reset && o.outs.length) {
    L.push('  // no reset: the registers start at 0 when the FPGA is configured');
    L.push('  initial begin');
    for (const p of o.outs) L.push(`    ${p.name} = ${vlogZero(p.width)};`);
    L.push('  end', '');
  }
  L.push(`  // Sequential logic: the registers (the outputs, declared reg) change only at the rising`, `  // edge of ${c}.`);
  L.push(...resetLines(o, '  //'));
  if (o.rmode === 'async') {
    L.push(`  always @(posedge ${c} or ${o.active === '1' ? 'posedge' : 'negedge'} ${o.reset.name}) begin`, `    if (${rstCond}) begin`, ...rstAssign('      '),
      '    end else begin', ...body('      '), '    end', '  end', '');
  } else if (o.rmode === 'sync') {
    L.push(`  always @(posedge ${c}) begin`, `    if (${rstCond}) begin`, ...rstAssign('      '),
      '    end else begin', ...body('      '), '    end', '  end', '');
  } else {
    L.push(`  always @(posedge ${c}) begin`, ...body('    '), '  end', '');
  }
  triDrivers();
  L.push('endmodule', '');
  return L.join('\n');
}

function vlogExample(ins, out) {
  const same = ins.filter(p => p.width === out.width);
  if (same.length >= 2) return `${same[0].name} & ${same[1].name}`;
  if (same.length === 1) return `~${same[0].name}`;
  return vlogZero(out.width);
}

// ===================================================================== schematic generator
const r10 = v => Math.ceil(v / GRID) * GRID;

/**
 * A new schematic document with an I/O marker per port: inputs on the left edge, outputs on the
 * right one, 60 px apart (bus markers carry their width), the clock input (optional) at the
 * bottom of the inputs after a gap, the bidirectional (inout) markers on the right edge below
 * the outputs after a gap, an empty middle area. The description goes into
 * doc.description (shown on the sheet, and as a comment in the synchronized HDL).
 * opts: { name, lang, description, ports: [{ name, dir, width }], clock: port name or null }
 */
export function schematicFromPorts(opts) {
  const lang = opts.lang === 'verilog' ? 'verilog' : 'vhdl';
  const ports = (opts.ports || []).map(p => ({ name: String(p.name).trim(), dir: p.dir, width: +p.width || 1 }));
  const clockName = opts.clock ? String(opts.clock).trim() : '';
  const all = clockName ? [...ports, { name: clockName, dir: 'in', width: 1 }] : ports;
  const err = checkPorts(all, { lang, name: opts.name });
  if (err) throw new Error(err);
  const doc = newDoc(String(opts.name).trim(), lang);
  const desc = String(opts.description ?? '').trim();
  if (desc) doc.description = desc;
  const ins = ports.filter(p => p.dir === 'in'), outs = ports.filter(p => p.dir === 'out'), ios = ports.filter(p => p.dir === 'inout');
  const STEP = 60, TOP = desc ? 160 : 120;
  const nIn = ins.length + (clockName ? 2 : 0);   // the clock after an empty slot
  const ioAt = outs.length ? outs.length + 1 : 0;  // the bidirectional markers after an empty slot
  const rows = Math.max(nIn, ios.length ? ioAt + ios.length : outs.length, 1);
  doc.sheet.h = Math.max(1100, r10(TOP + rows * STEP + 140));
  const bw = p => portBox({ ...p, x: 0, y: 0 }).w;
  const xIn = r10(40 + Math.max(60, ...ins.map(bw), clockName ? bw({ name: clockName, dir: 'in' }) : 0));
  const xOut = doc.sheet.w - r10(40 + Math.max(60, ...[...outs, ...ios].map(p => bw(p))));
  let k = 0;
  const add = (p, x, y) => doc.ports.push({ id: `P${++k}`, name: p.name, dir: p.dir, width: p.width, x, y });
  ins.forEach((p, i) => add(p, xIn, TOP + i * STEP));
  if (clockName) add({ name: clockName, dir: 'in', width: 1 }, xIn, TOP + (ins.length + 1) * STEP);
  outs.forEach((p, i) => add(p, xOut, TOP + i * STEP));
  ios.forEach((p, i) => add(p, xOut, TOP + (ioAt + i) * STEP));
  return normalizeDoc(doc);
}
