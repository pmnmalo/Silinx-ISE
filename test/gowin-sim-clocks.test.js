// The Gowin's clock primitives' simulation models (#2299: packages/silinx-hdl/src/gowin-prims.js rPLL, PLLVR, OSC, OSCZ,
// OSCH): their outputs' periods, phases and duty cycles measured on the simulation's waveforms, from Verilog and from VHDL,
// against the frequencies packages/silinx-fpga/src/gowin-clocks.js computes from the same parameters (pllFrequencies,
// oscFrequency: the clocks nextpnr checks, #3488), and against values worked out by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { pllFrequencies, oscFrequency } from '../packages/silinx-fpga/src/gowin-clocks.js';

const b32 = (n) => n.toString(2).padStart(32, '0');   // (an integer parameter as Yosys's netlist has it)

const PIN_NAMES = ['CLKOUT', 'CLKOUTP', 'CLKOUTD', 'CLKOUTD3', 'LOCK'];
// a test bench of one instance whose outputs are the signals o_<pin>, in Verilog or VHDL; the input clock CLKIN of `half` ps
function bench(lang, cell, params, outs, { half = 18519, extra = '' } = {}) {
  if (lang === 'verilog') {
    const ps = params.map(([k, v]) => `.${k}(${typeof v === 'string' ? `"${v}"` : v})`).join(', ');
    return `\`timescale 1ps / 1ps
module tb;
  reg clk = 0;
${outs.map((o) => `  wire o_${o};`).join('\n')}
${half ? `  always #${half} clk = ~clk;\n` : ''}  ${cell} ${ps ? `#(${ps}) ` : ''}u (${[...(half ? ['.CLKIN(clk)'] : []), ...outs.map((o) => `.${o}(o_${o})`)].join(', ')}${extra});
endmodule
`;
  }
  const gm = params.map(([k, v]) => `${k} => ${typeof v === 'string' ? `"${v}"` : v}`).join(', ');
  return `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
library gw1n; use gw1n.components.all;
entity tb is
end tb;
architecture t of tb is
  signal clk : std_logic := '0';
${outs.map((o) => `  signal o_${o} : std_logic;`).join('\n')}
begin
${half ? `  clk <= not clk after ${half} ps;\n` : ''}  u : ${cell} ${gm ? `generic map (${gm}) ` : ''}port map (${[...(half ? ['CLKIN => clk'] : []), ...outs.map((o) => `${o} => o_${o}`)].join(', ')}${extra.replace(/\.(\w+)\(([^)]*)\)/g, '$1 => $2')});
end t;
`;
}
// the rising and falling edges' times (ps, the simulator's unit) of each output, from `from` ps on; the simulation's log
function run(lang, text, outs, until, from = 0) {
  const srcs = [{ path: lang === 'verilog' ? 'tb.v' : 'tb.vhd', lang, text }];
  const prims = primitiveSources(srcs);
  assert.deepEqual(prims.map((s) => s.path), ['<silinx>/gowin.vhd']);
  const r = simulate([...prims, ...srcs], 'tb', { until });
  assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => d.message), [], lang);
  const edges = {};
  for (const o of outs) {
    // (VHDL's names in lower case)
    const s = r.design.signals.find((x) => x.name.toLowerCase() === `o_${o}`.toLowerCase());
    const rise = [], fall = [];
    s.wave.t.forEach((t, i) => { if (t < from) return; const b = String(s.wave.v[i].v ?? s.wave.v[i]); (/1/.test(b) && !(s.wave.v[i].x) ? rise : fall).push(t); });
    edges[o] = { rise, fall };
  }
  return { edges, log: r.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`) };
}
// an output's period (the mean of its last rising edges'), its duty cycle (high / period) and its first rising edge
const period = ({ rise }) => (rise.at(-1) - rise[0]) / (rise.length - 1);
const duty = ({ rise, fall }) => { const r = rise.at(-2), f = fall.find((t) => t > r); return (f - r) / period({ rise }); };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a}, expected ${b} ± ${tol}`);

test('rPLL: CLKOUT at CLKIN × (FBDIV_SEL + 1) / (IDIV_SEL + 1), CLKOUTP shifted by PSDA_SEL × 22.5° and high DUTYDA_SEL / 16, CLKOUTD / DYN_SDIV_SEL, CLKOUTD3 / 3; LOCK after 3 edges', () => {
  // the Tang Nano 9K's 27 MHz to 67.5 MHz: IDIV_SEL 3 (÷4), FBDIV_SEL 9 (×10), the VCO at 67.5 × 8 = 540 MHz
  const params = [['FCLKIN', '27'], ['IDIV_SEL', 3], ['FBDIV_SEL', 9], ['ODIV_SEL', 8], ['PSDA_SEL', '0100'], ['DUTYDA_SEL', '0100'], ['DYN_SDIV_SEL', 6], ['DEVICE', 'GW1NR-9C']];
  const f = pllFrequencies({ FCLKIN: '27', IDIV_SEL: b32(3), FBDIV_SEL: b32(9), ODIV_SEL: b32(8), DYN_SDIV_SEL: b32(6) }, 'GW1N-9C');
  assert.deepEqual(f, { CLKOUT: 67.5, CLKOUTP: 67.5, CLKOUTD: 11.25, CLKOUTD3: 22.5 });
  const tin = 2 * 18519;   // CLKIN's period (ps)
  for (const lang of ['verilog', 'vhdl']) {
    const { edges, log } = run(lang, bench(lang, 'rPLL', params, PIN_NAMES), PIN_NAMES, 40 * tin, 8 * tin);
    assert.deepEqual(log, [], lang);
    // (to the picosecond: CLKIN's period is 37 038 ps, not 1e6 / 27)
    near(period(edges.CLKOUT), tin * 4 / 10, 1, `${lang} CLKOUT's period`);
    near(1e6 / period(edges.CLKOUT), f.CLKOUT, 0.01, `${lang} CLKOUT's frequency`);
    near(1e6 / period(edges.CLKOUTP), f.CLKOUTP, 0.01, `${lang} CLKOUTP's frequency`);
    near(1e6 / period(edges.CLKOUTD), f.CLKOUTD, 0.01, `${lang} CLKOUTD's frequency`);
    near(1e6 / period(edges.CLKOUTD3), f.CLKOUTD3, 0.01, `${lang} CLKOUTD3's frequency`);
    near(duty(edges.CLKOUT), 0.5, 0.001, `${lang} CLKOUT's duty cycle`);
    near(duty(edges.CLKOUTP), 4 / 16, 0.001, `${lang} CLKOUTP's duty cycle`);
    near(duty(edges.CLKOUTD), 0.5, 0.001, `${lang} CLKOUTD's duty cycle`);
    // CLKOUTP a quarter of a period (4 × 22.5°) after CLKOUT; both re-aligned to CLKIN's rising edges
    const t0 = edges.CLKOUT.rise[0], p = period(edges.CLKOUT);
    near(edges.CLKOUTP.rise.find((t) => t >= t0) - t0, p / 4, 1, `${lang} CLKOUTP's phase`);
    // (re-aligned on every 4th of CLKIN's rising edges from the one after the lock's: CLKIN rises at tin / 2, 3 tin / 2, …)
    assert.equal(edges.CLKOUT.rise.filter((t) => (t - 3.5 * tin) % (4 * tin) === 0).length, 8, `${lang} CLKOUT re-aligned to CLKIN`);
  }
  // LOCK high from CLKIN's third rising edge on, CLKOUT's first edge with it
  const { edges } = run('verilog', bench('verilog', 'rPLL', params, ['LOCK', 'CLKOUT']), ['LOCK', 'CLKOUT'], 6 * tin);
  assert.deepEqual(edges.LOCK.rise, [2.5 * tin]);
  assert.equal(edges.CLKOUT.rise[0], 3.5 * tin);
});

test('rPLL: CLKOUTD from CLKOUTP (CLKOUTD_SRC), the bypasses CLKIN itself, RESET holds LOCK and the outputs low; PLLVR as rPLL; the dynamic dividers a warning', () => {
  const tin = 2 * 18519;
  for (const lang of ['verilog', 'vhdl']) {
    const params = [['IDIV_SEL', 0], ['FBDIV_SEL', 1], ['PSDA_SEL', '1000'], ['DYN_SDIV_SEL', 2], ['CLKOUTD_SRC', 'CLKOUTP'], ['CLKOUTP_BYPASS', 'true']];
    const { edges, log } = run(lang, bench(lang, 'PLLVR', params, ['CLKOUT', 'CLKOUTP', 'CLKOUTD']), ['CLKOUT', 'CLKOUTP', 'CLKOUTD'], 20 * tin, 6 * tin);
    assert.deepEqual(log, [], lang);
    near(period(edges.CLKOUT), tin / 2, 1, `${lang} CLKOUT ×2`);
    // CLKOUTP bypassed: CLKIN's edges; CLKOUTD the PLL's CLKOUTP (half a period late) / 2
    assert.ok(edges.CLKOUTP.rise.every((t) => (t - tin / 2) % tin === 0), `${lang} CLKOUTP is CLKIN`);
    near(period(edges.CLKOUTD), tin, 1, `${lang} CLKOUTD`);
    near((edges.CLKOUTD.rise[0] - tin / 2) % tin, tin / 4, 1, `${lang} CLKOUTD's phase: CLKOUTP's 180°, a quarter of its own period`);
    // held in reset: no edge, LOCK low
    const held = run(lang, bench(lang, 'rPLL', [], ['CLKOUT', 'LOCK'], { extra: ", .RESET(1'b1)".replace("1'b1", lang === 'verilog' ? "1'b1" : "'1'") }), ['CLKOUT', 'LOCK'], 10 * tin);
    assert.deepEqual([held.edges.CLKOUT.rise, held.edges.LOCK.rise], [[], []], lang);
    const dyn = run(lang, bench(lang, 'rPLL', [['DYN_IDIV_SEL', 'true']], ['CLKOUT']), ['CLKOUT'], tin);
    assert.deepEqual(dyn.log, ['WARNING: rPLL: its dynamic dividers (DYN_IDIV_SEL, DYN_FBDIV_SEL, DYN_ODIV_SEL) are not modelled: IDIV_SEL, FBDIV_SEL and ODIV_SEL are'], lang);
  }
});

test('OSC, OSCZ, OSCH: OSCOUT at their frequency / FREQ_DIV (OSC\'s as oscFrequency computes it, 210 MHz on the GW1N-4s); OSCZ stopped by OSCEN', () => {
  for (const lang of ['verilog', 'vhdl']) {
    // (OSCZ's 250 MHz and OSCH's 240 MHz: Gowin's UG286, oscFrequency has none for them)
    for (const [cell, params, mhz] of [['OSC', [['FREQ_DIV', 10], ['DEVICE', 'GW1NR-9C']], 25], ['OSC', [], 2.1], ['OSC', [['FREQ_DIV', 2], ['DEVICE', 'GW1N-1']], 125],
      ['OSC', [['FREQ_DIV', 4], ['DEVICE', 'GW1NR-4C']], 52.5], ['OSCZ', [['FREQ_DIV', 50]], 5], ['OSCH', [], 2.5]]) {
      const p = Object.fromEntries(params);
      if (cell === 'OSC') assert.equal(oscFrequency(cell, p.FREQ_DIV ? { FREQ_DIV: b32(p.FREQ_DIV) } : {}, p.DEVICE ?? 'GW1N-4'), mhz);
      const { edges, log } = run(lang, bench(lang, cell, params, ['OSCOUT'], { half: 0 }), ['OSCOUT'], 6e6 / mhz);
      assert.deepEqual(log, [], `${lang} ${cell}`);
      // (its half period to the picosecond: 9 523 ps for 52.5 MHz)
      near(1e6 / period(edges.OSCOUT), mhz, mhz * 1e-4, `${lang} ${cell} ${JSON.stringify(params)}`);
      near(duty(edges.OSCOUT), 0.5, 0.001, `${lang} ${cell}'s duty cycle`);
    }
    const off = run(lang, bench(lang, 'OSCZ', [], ['OSCOUT'], { half: 0, extra: lang === 'verilog' ? ", .OSCEN(1'b0)" : ", .OSCEN('0')" }), ['OSCOUT'], 1e5);
    assert.deepEqual(off.edges.OSCOUT.rise, [], lang);
  }
});
