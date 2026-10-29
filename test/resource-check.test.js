// A design's use of the device's resources against what the device has (packages/silinx-fpga/src/resource-check.js, #795, #796): the
// resources of a netlist's cells, the ones over the part's counts and their message; the Silinx toolchain's
// synthesis and MAP give every resource used of available and fail, with the resource named, on a design
// over any of them (block RAMs, multipliers, DCMs, global buffers, I/O, flip-flops; the Spartan-6's DSP
// slices), not at Place. A change of the target device (#796): the design's primitives the new family lacks, with
// their equivalent, and the resources over the new part's counts, each said; none for a compatible change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { usedOfPrimitives, overResources, overMessage, resourceNoun, primitiveEquivalent, primitiveInstances, usedOfReport, deviceChangeIssues } from '../packages/silinx-fpga/src/resource-check.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { resourcesOf } from '../packages/silinx-fpga/src/resources.js';
import { findPart } from '../server/devices.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { shippedDevicePath, loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';

const S100 = resourcesOf(findPart('xc3s100e'), 'cp132');
const LX4 = resourcesOf(findPart('xc6slx4'), 'cpg196');

test('usedOfPrimitives: the resources of the cells (any case), the primitives of no counted resource left out', () => {
  assert.deepEqual(usedOfPrimitives('spartan3e', { RAMB16_S9: 2, ramb16_s1_s36: 1, MULT18X18SIO: 3, DCM_SP: 1, BUFG: 2, BUFGMUX: 1, LUT4: 10, FDRE: 4, IBUF: 3, OBUF: 1, MUXCY: 7, XORCY: 7, VCC: 1 }),
    { ramb16: 3, mult18x18: 3, dcm: 1, bufgmux: 3, luts: 10, ffs: 4, iob: 4 });
  assert.deepEqual(usedOfPrimitives('spartan6', { RAMB16BWER: 1, RAMB8BWER: 3, DSP48A1: 2, PLL_BASE: 1, DCM_SP: 1, BUFIO2: 1, LUT6: 5 }),
    { ramb16bwer: 1, ramb8bwer: 3, dsp48a1: 2, pll: 1, dcm: 1, bufio2: 1, luts: 5 });
  // (a Spartan-6 primitive on a Spartan-3E: none counted there)
  assert.deepEqual(usedOfPrimitives('spartan3e', { DSP48A1: 1, RAMB16BWER: 2, LUT6: 1 }), {});
  assert.deepEqual(usedOfPrimitives('spartan3e', {}), {});
  assert.deepEqual(usedOfPrimitives('spartan3e', null), {});
  assert.deepEqual(usedOfPrimitives('spartan3e', { RAMB16_S9: 0 }), {});
});

test('overResources: the resources over the part\'s counts, in its order; none at the counts; a count not known not checked', () => {
  assert.deepEqual(overResources(S100, { ramb16: 4, mult18x18: 4, dcm: 2, bufgmux: 24, iob: 83, luts: 1920, ffs: 1920, slices: 960 }), []);
  assert.deepEqual(overResources(S100, { dcm: 3, ramb16: 14, luts: 1 }), [
    { id: 'ramb16', used: 14, count: 4, noun: 'block RAMs', report: 'Number of RAMB16s' },
    { id: 'dcm', used: 3, count: 2, noun: 'DCMs', report: 'Number of DCMs' }]);
  assert.deepEqual(overResources(S100, {}), []);
  // (the I/O of a part without a package: its maximum; a count not known, a Zynq's distributed RAM: not checked;
  // the LX4's BUFHs measured, #820)
  assert.deepEqual(overResources(resourcesOf(findPart('xc3s100e')), { iob: 109 }).map(o => [o.id, o.count]), [['iob', 108]]);
  const z = resourcesOf(findPart('xc7z010'));
  assert.equal(z.find(r => r.id === 'distRam').count, null);
  assert.deepEqual(overResources(z, { distRam: 1e9 }), []);
  assert.deepEqual(overResources(LX4, { bufh: 129 }).map(o => [o.id, o.count]), [['bufh', 128]]);
});

test('overResources: the Spartan-6\'s block RAM halves counted in the block RAMs (two RAMB8BWER, one RAMB16BWER\'s sites)', () => {
  // the XC6SLX4: 12 block RAMs, 24 halves
  assert.deepEqual(overResources(LX4, { ramb16bwer: 12 }), []);
  assert.deepEqual(overResources(LX4, { ramb8bwer: 24 }), []);
  assert.deepEqual(overResources(LX4, { ramb16bwer: 11, ramb8bwer: 2 }), []);
  assert.deepEqual(overResources(LX4, { ramb16bwer: 11, ramb8bwer: 3 }), [{ id: 'ramb16bwer', used: 13, count: 12, noun: 'block RAMs', report: 'Number of RAMB16BWERs' }]);
  assert.deepEqual(overResources(LX4, { ramb8bwer: 25 }), [{ id: 'ramb16bwer', used: 13, count: 12, noun: 'block RAMs', report: 'Number of RAMB16BWERs' }]);
  assert.deepEqual(overResources(LX4, { dsp48a1: 9, pll: 3 }).map(o => overMessage(o, 'xc6slx4')), ['9 DSP slices needed, the XC6SLX4 has 8', '3 PLLs needed, the XC6SLX4 has 2']);
});

test('overMessage and resourceNoun: the resource named, the part in capitals', () => {
  assert.equal(overMessage({ used: 14, count: 4, noun: 'block RAMs' }, 'xc3s100e'), '14 block RAMs needed, the XC3S100E has 4');
  assert.deepEqual(['ffs', 'luts', 'slices', 'iob', 'ramb16', 'mult18x18', 'bufgmux', 'dcm', 'dsp48a1', 'pll', 'mcb', 'other'].map(resourceNoun),
    ['flip-flops', 'LUTs', 'slices', 'I/O pads', 'block RAMs', 'multipliers', 'global clock buffers', 'DCMs', 'DSP slices', 'PLLs', 'memory controllers', 'other']);
});

// ------------------------------------------------------------------ the Silinx toolchain's synthesis and MAP
// n instances of a primitive, each output folded into one bit of q
const many = (n, inst, ports = 'input clk, input [17:0] a, input [17:0] b') => `module top(${ports}, output [${n - 1}:0] q);
genvar i;
generate for (i = 0; i < ${n}; i = i + 1) begin : g
${inst}
end endgenerate
endmodule
`;
const BRAM = `  wire [7:0] o; wire op;
  RAMB16_S9 r (.CLK(clk), .EN(1'b1), .SSR(1'b0), .WE(b[0]), .ADDR(a[10:0]), .DI(b[8:1]), .DIP(1'b0), .DO(o), .DOP(op));
  assign q[i] = ^o;`;
const MULT = `  wire [35:0] p; wire [17:0] bc;
  MULT18X18SIO #(.AREG(0), .BREG(0), .PREG(0), .B_INPUT("DIRECT")) m (.A(a ^ i), .B(b), .BCIN(18'd0), .CEA(1'b0), .CEB(1'b0), .CEP(1'b0), .CLK(clk), .RSTA(1'b0), .RSTB(1'b0), .RSTP(1'b0), .P(p), .BCOUT(bc));
  assign q[i] = ^p;`;
const DCM = `  wire c0, fb;
  DCM_SP #(.CLK_FEEDBACK("1X"), .CLKIN_PERIOD(20.0)) d (.CLKIN(c[i]), .CLKFB(fb), .RST(1'b0), .PSEN(1'b0), .PSINCDEC(1'b0), .PSCLK(1'b0), .DSSEN(1'b0), .CLK0(c0), .LOCKED(q[i]));
  BUFG bf (.I(c0), .O(fb));`;
const DSP = `  wire [47:0] p;
  DSP48A1 #(.A0REG(0), .A1REG(0), .B0REG(0), .B1REG(0), .MREG(0), .PREG(0), .OPMODEREG(0), .CARRYINREG(0), .CARRYOUTREG(0), .CREG(0), .DREG(0)) m (.CLK(clk), .A(a ^ i), .B(b), .C(48'd0), .D(18'd0), .OPMODE(8'h01), .CARRYIN(1'b0), .PCIN(48'd0),
    .CEA(1'b0), .CEB(1'b0), .CEC(1'b0), .CED(1'b0), .CEM(1'b0), .CEP(1'b0), .CEOPMODE(1'b0), .CECARRYIN(1'b0),
    .RSTA(1'b0), .RSTB(1'b0), .RSTC(1'b0), .RSTD(1'b0), .RSTM(1'b0), .RSTP(1'b0), .RSTOPMODE(1'b0), .RSTCARRYIN(1'b0), .P(p));
  assign q[i] = ^p;`;

const S100_SPEC = { top: 'top', part: 'xc3s100ecp132-4', device: 'xc3s100e', pkg: 'cp132', family: 'spartan3e', graph: shippedDevicePath('xc3s100ecp132-4'), seed: 1, effort: 1 };
let s100Device = null;
async function flow(text, spec) {
  const lines = [], reports = [];
  const io = {
    log: l => lines.push(l), sources: () => [{ path: 'top.v', lang: 'verilog', text }], ucf: null, yosys: yosysNode,
    device: () => (s100Device ||= loadDeviceCache(S100_SPEC.graph)),
    write: name => `build/${name}`, read: () => null, save: r => reports.push(structuredClone(r)),
  };
  const res = await runOpenFlow(spec, io);
  return { ...res, lines, report: reports.at(-1), warnings: lines.filter(l => /WARNING/.test(l)), util: lines.slice(lines.findIndex(l => /^(Device utilization|Design summary)/.test(l)) + 1).filter(l => /^ {2}Number/.test(l)) };
}
const failure = r => r.lines.slice(r.lines.findIndex(l => /^ERROR:/.test(l)));

test('#795 the synthesis: every resource used of the part\'s; a design over the XC3S100E\'s block RAMs, multipliers, DCMs, global buffers, I/O or flip-flops fails there, the resource named', { timeout: 300000 }, async () => {
  const spec = { ...S100_SPEC, steps: ['synth', 'translate', 'map', 'par'], resources: S100 };
  const cases = [
    ['block RAMs', many(5, BRAM), ['  Number of 4 input LUTs: 15 out of 1920 1%', '  Number of RAMB16s: 5 out of 4 125%', '  Number of GCLKs: 1 out of 24 4%', '  Number of IOs: 42 out of 83 51%'],
      '5 block RAMs needed, the XC3S100E has 4'],
    ['multipliers', many(5, MULT), null, '5 multipliers needed, the XC3S100E has 4'],
    ['DCMs', many(3, DCM, 'input [2:0] c'), null, '3 DCMs needed, the XC3S100E has 2'],
    ['global buffers', 'module top(input [24:0] c, input d, output reg [24:0] q);\ngenvar i;\ngenerate for (i = 0; i < 25; i = i + 1) begin : g\n  always @(posedge c[i]) q[i] <= d;\nend endgenerate\nendmodule\n',
      null, '25 global clock buffers needed, the XC3S100E has 24'],
    ['I/O', 'module top(input [83:0] a, output q);\n  assign q = ^a;\nendmodule\n', null, '85 I/O pads needed, the XC3S100E has 83'],
    ['flip-flops', 'module top(input clk, input rst, input d, output q);\n  reg [1999:0] r;\n  always @(posedge clk) if (rst) r <= 0; else r <= {r[1998:0], d};\n  assign q = r[1999];\nendmodule\n',
      null, '2000 flip-flops needed, the XC3S100E has 1920'],
  ];
  for (const [what, text, util, message] of cases) {
    const r = await flow(text, spec);
    assert.equal(r.ok, false, what);
    assert.deepEqual(failure(r), [`ERROR:Silinx - ${message}`, 'Choose a larger device (Design Properties).', '=== SILINX FAILED synth (exit 1) ==='], `${what}\n${r.lines.join('\n')}`);
    assert.deepEqual(r.warnings, [], what);
    if (util) assert.deepEqual(r.util, util, what);
    // the report kept, the resource over 100 %
    const row = r.report.synthesis.utilization.find(u => u.total && u.used > u.total);
    assert.ok(row && row.percent > 100, what);
    assert.equal(r.report.synthesis.errors, 1, what);
    assert.equal(r.report.map, undefined, what);
  }
});

test('#795 MAP: every resource used of the device\'s sites (block RAMs, multipliers, DCMs too); at the XC3S100E\'s counts, no warnings', { timeout: 300000 }, async () => {
  const text = `module top(input clk, input [17:0] a, input [17:0] b, input [1:0] c, output [9:0] q);
genvar i;
generate for (i = 0; i < 4; i = i + 1) begin : g
${BRAM.replace('q[i]', 'q[i]')}
end endgenerate
generate for (i = 0; i < 4; i = i + 1) begin : h
${MULT.replace('q[i]', 'q[4 + i]')}
end endgenerate
generate for (i = 0; i < 2; i = i + 1) begin : k
${DCM.replace('.LOCKED(q[i])', '.LOCKED(q[8 + i])')}
end endgenerate
endmodule
`;
  const r = await flow(text, { ...S100_SPEC, steps: ['synth', 'translate', 'map'], resources: S100 });
  assert.ok(r.ok, r.lines.join('\n'));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.lines.slice(r.lines.indexOf('Design summary (pack):') + 1).filter(l => /^ {2}Number/.test(l)), [
    '  Number of Slice Flip Flops: 0 out of 1920 0%', `  Number of 4 input LUTs: ${r.report.map.summary.luts.used} out of 1920 ${r.report.map.summary.luts.percent}%`,
    `  Number of occupied Slices: ${r.report.map.summary.slices.used} out of 960 ${r.report.map.summary.slices.percent}%`, '  Number of bonded IOBs: 49 out of 83 59%',
    '  Number of RAMB16s: 4 out of 4 100%', '  Number of MULT18X18SIOs: 4 out of 4 100%', '  Number of BUFGMUXs: 3 out of 24 13%', '  Number of DCMs: 2 out of 2 100%']);
  assert.deepEqual(r.report.map.utilization.map(u => u.id), ['ffs', 'luts', 'slices', 'iob', 'ramb16', 'mult18x18', 'bufgmux', 'dcm']);
  assert.equal(r.report.map.errors, 0);
  // the synthesis's lines: used of available
  assert.deepEqual(r.report.synthesis.utilization.filter(u => u.id).map(u => [u.name, u.used, u.total]).filter(([n]) => !/LUTs/.test(n)), [
    ['Number of RAMB16s', 4, 4], ['Number of MULT18X18SIOs', 4, 4], ['Number of GCLKs', 3, 24], ['Number of DCMs', 2, 2], ['Number of IOs', 49, 83]]);
});

test('#795 MAP: a netlist over the device\'s block RAMs and multipliers (a synthesis without the part\'s counts) fails at MAP, not at Place, both named; the summary\'s rows over 100 %', { timeout: 300000 }, async () => {
  const text = `module top(input clk, input [17:0] a, input [17:0] b, output [9:0] q);
genvar i;
generate for (i = 0; i < 5; i = i + 1) begin : g
${BRAM}
end endgenerate
generate for (i = 0; i < 5; i = i + 1) begin : h
${MULT.replace('q[i]', 'q[5 + i]')}
end endgenerate
endmodule
`;
  const r = await flow(text, { ...S100_SPEC, steps: ['synth', 'translate', 'map', 'par'] });
  assert.equal(r.ok, false);
  assert.deepEqual(failure(r), ['ERROR:Silinx - 5 block RAMs needed, the XC3S100E has 4; 5 multipliers needed, the XC3S100E has 4', 'Choose a larger device (Design Properties).', '=== SILINX FAILED map (exit 1) ==='], r.lines.join('\n'));
  assert.deepEqual(r.warnings, []);
  // (the synthesis without the counts: the used ones only)
  assert.ok(r.lines.includes('  Number of RAMB16s: 5'), r.lines.join('\n'));
  assert.ok(r.lines.includes('  Number of RAMB16s: 5 out of 4 125%') && r.lines.includes('  Number of MULT18X18SIOs: 5 out of 4 125%'), r.lines.join('\n'));
  assert.deepEqual(r.report.map.utilization.filter(u => u.percent > 100).map(u => [u.name, u.used, u.total, u.percent]), [['Number of RAMB16s', 5, 4, 125], ['Number of MULT18X18SIOs', 5, 4, 125]]);
  assert.equal(r.report.map.errors, 2);
  assert.equal(r.report.par, undefined);
});

test('#795 the Spartan-6 synthesis (the Silinx toolchain\'s, synthesis only): its own resources used of available; 9 DSP slices on the XC6SLX4 fail there', { timeout: 300000 }, async () => {
  const spec = { top: 'top', part: 'xc6slx4cpg196-2', device: 'xc6slx4', pkg: 'cpg196', family: 'spartan6', steps: ['synth'], resources: LX4 };
  const over = await flow(many(9, DSP), spec);
  assert.deepEqual(failure(over), ['ERROR:Silinx - 9 DSP slices needed, the XC6SLX4 has 8', 'Choose a larger device (Design Properties).', '=== SILINX FAILED synth (exit 1) ==='], over.lines.join('\n'));
  assert.deepEqual(over.warnings, []);
  assert.deepEqual(over.util.filter(l => !/LUTs/.test(l)), ['  Number of DSP48A1s: 9 out of 8 113%', '  Number of BUFG/BUFGMUXs: 1 out of 16 6%', '  Number of bonded IOBs: 46 out of 106 43%']);
  const ok = await flow(many(8, DSP), spec);
  assert.ok(ok.ok, ok.lines.join('\n'));
  assert.deepEqual(ok.warnings, []);
  assert.ok(ok.util.includes('  Number of DSP48A1s: 8 out of 8 100%'), ok.util.join('\n'));
});

// ------------------------------------------------------------------ a change of the target device (#796)
test('#796 primitiveEquivalent: a primitive the family lacks, its equivalent there; one it has, or not counted, or a family not described: undefined', () => {
  assert.equal(primitiveEquivalent('spartan6', 'MULT18X18SIO'), 'DSP48A1');
  assert.equal(primitiveEquivalent('spartan6', 'mult18x18'), 'DSP48A1');
  assert.equal(primitiveEquivalent('spartan6', 'RAMB16_S9_S36'), 'RAMB16BWER');
  assert.equal(primitiveEquivalent('spartan6', 'RAMB16_S1'), 'RAMB16BWER');
  assert.equal(primitiveEquivalent('spartan6', 'DCM'), 'DCM_SP');
  assert.equal(primitiveEquivalent('spartan3e', 'DSP48A1'), 'MULT18X18SIO');
  assert.equal(primitiveEquivalent('spartan3e', 'RAMB16BWER'), 'RAMB16_S36_S36');
  assert.equal(primitiveEquivalent('spartan3e', 'RAMB8BWER'), 'RAMB16_S18_S18');
  assert.equal(primitiveEquivalent('spartan3e', 'PLL_BASE'), 'DCM_SP');
  assert.equal(primitiveEquivalent('spartan3e', 'BUFIO2'), 'BUFG');
  assert.equal(primitiveEquivalent('spartan3e', 'MCB'), null);
  for (const [f, n] of [['spartan6', 'DCM_SP'], ['spartan6', 'BUFG'], ['spartan3e', 'RAMB16_S9'], ['spartan3e', 'LUT4'], ['spartan6', 'FOO'], ['spartan3a', 'DSP48A1'], ['spartan3e', '']]) {
    assert.equal(primitiveEquivalent(f, n), undefined, `${f} ${n}`);
  }
});

const elaborated = (text, top = 'top') => {
  const srcs = [{ path: 'top.v', lang: 'verilog', text }];
  return elaborate(compile([...primitiveSources(srcs), ...srcs]), top).top;
};
const S3E_DESIGN = `module mac(input clk, input [17:0] a, output [35:0] p);
  MULT18X18SIO #(.AREG(0), .BREG(0), .PREG(0)) m (.A(a), .B(a), .BCIN(18'd0), .CEA(1'b0), .CEB(1'b0), .CEP(1'b0), .CLK(clk), .RSTA(1'b0), .RSTB(1'b0), .RSTP(1'b0), .P(p));
endmodule
module top(input clk, input [17:0] a, output [2:0] q);
  genvar i;
  generate for (i = 0; i < 2; i = i + 1) begin : g
    wire [35:0] p;
    mac u (.clk(clk), .a(a), .p(p));
    assign q[i] = ^p;
  end endgenerate
  wire [7:0] o; wire op;
  RAMB16_S9 r (.CLK(clk), .EN(1'b1), .SSR(1'b0), .WE(a[0]), .ADDR(a[10:0]), .DI(a[8:1]), .DIP(1'b0), .DO(o), .DOP(op));
  assign q[2] = ^o;
endmodule
`;

test('#796 primitiveInstances: every instance of a counted primitive in the elaborated hierarchy, with the module that instantiates it', () => {
  assert.deepEqual(primitiveInstances(elaborated(S3E_DESIGN)), [{ module: 'mac', primitive: 'MULT18X18SIO' }, { module: 'mac', primitive: 'MULT18X18SIO' }, { module: 'top', primitive: 'RAMB16_S9' }]);
  assert.deepEqual(primitiveInstances(elaborated('module top(input a, output y);\n  assign y = ~a;\nendmodule\n')), []);
  assert.deepEqual(primitiveInstances(null), []);
});

test('#796 usedOfReport: MAP\'s lines (by id, or ISE\'s by name), else the synthesis\'s; none', () => {
  const S250 = resourcesOf(findPart('xc3s250e'), 'cp132');
  const open = { synthesis: { utilization: [{ id: 'ramb16', name: 'Number of RAMB16s', used: 5, total: 12 }, { name: 'Number of latches', used: 2, total: null }] } };
  assert.deepEqual(usedOfReport(open, S250), { ramb16: 5 });
  const ise = { map: { utilization: [{ name: 'Number of Slice Flip Flops', used: 26, total: 4896 }, { name: 'Number of RAMB16s', used: 1, total: 12 }, { name: 'Number of Slices containing only related logic', used: 16, total: 16 }] },
    synthesis: { utilization: [{ id: 'ramb16', name: 'Number of RAMB16s', used: 9 }] } };
  assert.deepEqual(usedOfReport(ise, S250), { ffs: 26, ramb16: 1 });
  assert.deepEqual(usedOfReport(null, S250), {});
  assert.deepEqual(usedOfReport({ synthesis: { utilization: [] } }, S250), {});
});

const S3E_TO_S6 = { from: 'spartan3e', to: findPart('xc6slx4'), pkg: 'cpg196', familyName: 'Spartan-6' };
test('#796 deviceChangeIssues: a Spartan-3E design on a Spartan-6: its multipliers and block RAM named with their equivalents, by module; the resources counted on the new part', () => {
  const r = deviceChangeIssues({ ...S3E_TO_S6, instances: primitiveInstances(elaborated(S3E_DESIGN)), used: { ramb16: 1, mult18x18: 2, ffs: 0, luts: 40, iob: 22 } });
  assert.deepEqual(r.messages, [
    "Module 'mac' uses MULT18X18SIO, which the Spartan-6 family does not have: use DSP48A1 instead.",
    "Module 'top' uses RAMB16_S9, which the Spartan-6 family does not have: use RAMB16BWER instead."]);
  assert.deepEqual(r.over, []);
  // over the new part: 13 block RAMs and 9 multipliers of a synthesis report on the XC6SLX4 (12 block RAMs, 8 DSP slices), 120 ports (106 pads)
  const o = deviceChangeIssues({ ...S3E_TO_S6, instances: [], used: { ramb16: 13, mult18x18: 9, luts: 9000, iob: 120 } });
  assert.deepEqual(o.messages, ['120 I/O pads needed, the XC6SLX4 has 106.', '13 block RAMs needed, the XC6SLX4 has 12.', '9 DSP slices needed, the XC6SLX4 has 8.']);
});

test('#796 deviceChangeIssues: a Spartan-6 design on a Spartan-3E: DSP48A1, PLL, RAMB8BWER and MCB named; a block RAM half takes a whole RAMB16', () => {
  const instances = [{ module: 'fir', primitive: 'DSP48A1' }, { module: 'fir', primitive: 'DSP48A1' }, { module: 'clocks', primitive: 'PLL_BASE' }, { module: 'mem', primitive: 'MCB' },
    ...Array.from({ length: 5 }, () => ({ module: 'buf', primitive: 'RAMB8BWER' }))];
  const r = deviceChangeIssues({ from: 'spartan6', to: findPart('xc3s100e'), pkg: 'cp132', familyName: 'Spartan-3E', instances, used: {} });
  assert.deepEqual(r.messages, [
    "Module 'fir' uses DSP48A1, which the Spartan-3E family does not have: use MULT18X18SIO instead.",
    "Module 'clocks' uses PLL_BASE, which the Spartan-3E family does not have: use DCM_SP instead.",
    "Module 'mem' uses MCB, which the Spartan-3E family does not have, nor an equivalent.",
    "Module 'buf' uses RAMB8BWER, which the Spartan-3E family does not have: use RAMB16_S18_S18 instead.",
    '5 block RAMs needed, the XC3S100E has 4.']);
  // (the report's RAMB16BWERs and RAMB8BWERs together as RAMB16s)
  assert.deepEqual(deviceChangeIssues({ from: 'spartan6', to: findPart('xc3s100e'), pkg: 'cp132', used: { ramb16bwer: 2, ramb8bwer: 3, pll: 1, dcm: 1 } }).messages,
    ['5 block RAMs needed, the XC3S100E has 4.']);
});

test('#796 deviceChangeIssues: a smaller part of the same family: the resources over its counts (a report\'s, the instances\', the ports); a compatible change: nothing', () => {
  const to100 = { from: 'spartan3e', to: findPart('xc3s100e'), pkg: 'cp132', familyName: 'Spartan-3E' };
  assert.deepEqual(deviceChangeIssues({ ...to100, used: { ramb16: 5, mult18x18: 4, dcm: 3, luts: 2000, slices: 1000 } }).messages,
    ['2000 LUTs needed, the XC3S100E has 1920.', '1000 slices needed, the XC3S100E has 960.', '5 block RAMs needed, the XC3S100E has 4.', '3 DCMs needed, the XC3S100E has 2.']);
  // (no report: the instances and the top's ports; more of them than the report says: the instances)
  const inst = Array.from({ length: 6 }, () => ({ module: 'top', primitive: 'MULT18X18SIO' }));
  assert.deepEqual(deviceChangeIssues({ ...to100, instances: inst, ports: 100 }).messages, ['100 I/O pads needed, the XC3S100E has 83.', '6 multipliers needed, the XC3S100E has 4.']);
  assert.deepEqual(deviceChangeIssues({ ...to100, instances: inst, used: { mult18x18: 2 } }).messages, ['6 multipliers needed, the XC3S100E has 4.']);
  // compatible: blinky's use, to the XC3S100E; a Spartan-3E design to the XC3S1200E; the same part
  assert.deepEqual(deviceChangeIssues({ ...to100, instances: [], used: { ffs: 26, luts: 28, slices: 16, iob: 9, bufgmux: 1 }, ports: 9 }), { primitives: [], over: [], messages: [] });
  assert.deepEqual(deviceChangeIssues({ from: 'spartan3e', to: findPart('xc3s1200e'), pkg: 'fg320', instances: primitiveInstances(elaborated(S3E_DESIGN)), used: { ramb16: 1, mult18x18: 2 } }).messages, []);
  // (a family not described here: the common resources only, no primitive said)
  assert.deepEqual(deviceChangeIssues({ from: 'spartan3e', to: findPart('xc3s50a'), instances: [{ module: 'top', primitive: 'RAMB16_S9' }], used: { ffs: 1500, ramb16: 9 } }).messages,
    ['1500 flip-flops needed, the XC3S50A has 1408.']);
});
