// The open-flow fixtures of the hard blocks (test/fixtures/open-flow: block RAMs, multipliers, DCMs (two of
// them on clock pads' dedicated paths of their own, #92), their control pins tied to constants, #50; a pad's global
// buffer into a DCM's CLKIN, #94; input registers on pads whose neighbour is unused, #751; twelve clocks, #95; two side GCLK pins on their own side buffers, #641; shift registers, fixed and read at a variable tap, #5, chained through Q15, #2; multipliers cascaded through BCIN, #2; four clocks on block RAMs' ports and multipliers, #2; a manual clock, a button
// through the general routing into a global buffer, #347; paths across the XC3S1200E on its long-line splitters, #709) with Xilinx ISE 14.7 (opt-in, as
// test/ise/examples.test.js: it needs ISE's Docker image): the Silinx toolchain's routed design of
// each passes ISE's design rule check with no error and no warning, and Silinx's bitstream is
// byte-identical to ISE's bitgen of it, CRC on and off (scripts/check-open-flow.mjs).
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/open-flow.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../examples-lib.mjs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { deviceSites } from '../../packages/silinx-fpga/src/fpga/place.js';

const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !process.env.SILINX_ISE_HOST ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
const FIXTURES = ['feat_bram', 'feat_mult', 'feat_mult_chain', 'feat_constmult', 'feat_dcm', 'feat_dcm_pads', 'feat_iob_plain', 'feat_iob_lines', 'feat_iob_pair', 'feat_iob_lone', 'feat_iob_owners', 'feat_iob_ddr', 'feat_iob_ddr_v', 'feat_iob_bidir', 'feat_iob_bidir_v', 'feat_dcm_bufgin', 'feat_clocks12', 'feat_side_clock', 'feat_bufgmux', 'feat_bufgmux_1', 'hard_prim', 'feat_const_bram', 'feat_const_mult', 'feat_const_dcm', 'feat_srl', 'feat_srl_var', 'feat_srl_chain', 'feat_manual_clock', 'feat_ll_splitters', 'feat_bram_clocks', 'feat_clock_data'];

test('the open-flow fixtures of the hard blocks: Silinx\'s bitstream byte-identical to ISE\'s, ISE\'s DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...FIXTURES.map(f => path.join(ROOT, 'test/fixtures/open-flow', f))], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const f of FIXTURES) {
    assert.match(r.stdout, new RegExp(`^${f}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${f}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});

// The clock fixtures on every device of the Silinx toolchain, with no constraints (the placer's
// choice of pads, DCM sites and global buffers): a pad's global buffer into a DCM's CLKIN (#94), twelve
// global clocks on the top / bottom and side buffers (#95)
const DEVICES = [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']];
const CLOCK_FIXTURES = ['feat_dcm_bufgin', 'feat_clocks12'];

test('the clock fixtures on every device: Silinx\'s bitstream byte-identical to ISE\'s, ISE\'s DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-clocks-'));
  const names = [];
  for (const f of CLOCK_FIXTURES) for (const [part, pkg] of DEVICES) {
    const name = `${f}-${part}`, dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow', f, 'top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    names.push(name);
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...names.map(n => path.join(tmp, n))], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const n of names) {
    assert.match(r.stdout, new RegExp(`^${n}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${n}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});

// feat_iob_pair with its registers LOC'd on two differential pairs of every device (#749, #759): each pair's two
// registers of one kind on different clocks, the DIFFM's on its IOB's second flip-flop alone (IFF2, OFF2), as ISE's map
// puts it. The pairs: the first two whose pads can both drive an output, by tile.
function twoPairs(part, pkg) {
  const byTile = new Map();
  for (const p of deviceSites(loadDeviceCache(`${part}${pkg}-4`)).pads.values()) if (p.pair && !p.inputOnly && p.name !== 'B8') byTile.set(p.pair, [...(byTile.get(p.pair) || []), p]);
  return [...byTile.values()].filter(ps => ps.length === 2).slice(0, 2).map(ps => ps.sort((a, b) => b.master - a.master).map(p => p.name));
}

test('feat_iob_pair LOC\'d on two pairs of every device: the second flip-flops alone, byte-identical to ISE\'s, DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-iobpair-'));
  const names = [];
  for (const [part, pkg] of DEVICES) {
    const name = `feat_iob_pair_loc-${part}`, dir = path.join(tmp, name);
    fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iob_pair'), dir, { recursive: true });
    const [[m0, s0], [m1, s1]] = twoPairs(part, pkg);
    // (each net's standard too: the fixture's NET "led<*>" is not applied by the open flow yet, #773, and the clock's
    // LVCMOS33 on B8 would leave its bank to them)
    fs.appendFileSync(path.join(dir, 'top.ucf'), [['led<0>', s0], ['led<1>', m0], ['sw<0>', m1], ['sw<1>', s1]].map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;\n`).join(''));
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ ...j, name, board: undefined, device: { family: 'spartan3e', part, package: pkg, speed: '-4' } }));
    names.push(name);
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...names.map(n => path.join(tmp, n))], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const n of names) {
    assert.match(r.stdout, new RegExp(`^${n}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${n}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});

// The IOBs' DDR registers and the bidirectional pads on every device (#96), in VHDL and Verilog, their pads left to the
// placer (on the XC3S500E, an IDDR2 beside a plain input: the bits of its own a neighbour's features held before)
const DDR_FIXTURES = [['feat_iob_ddr', 'top.vhd'], ['feat_iob_ddr_v', 'top.v'], ['feat_iob_bidir', 'top.vhd'], ['feat_iob_bidir_v', 'top.v']];

test('feat_iob_ddr (IDDR2, ODDR2) and feat_iob_bidir (IOBUF) on every device, in VHDL and Verilog: Silinx\'s bitstream byte-identical to ISE\'s, ISE\'s DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-ddr-'));
  const names = [];
  for (const [f, file] of DDR_FIXTURES) for (const [part, pkg] of DEVICES) {
    const name = `${f}-${part}`, dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow', f, file), path.join(dir, file));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: file, lang: file.endsWith('.v') ? 'verilog' : 'vhdl', role: 'design' }] }));
    names.push(name);
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...names.map(n => path.join(tmp, n))], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const n of names) {
    assert.match(r.stdout, new RegExp(`^${n}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${n}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});

// feat_iob_lines on every device (#671): its IOB registers on left and right pads of each device, each on an I/O tile of
// its own (the two IOBs of a tile share each clock wire), spread over the side's rows (every clock row, up and down),
// on pads where the plain register is measured; the eight clocks on the eight top and bottom buffers (lines 0-7)
function sidePads(part, pkg) {
  const dev = loadDeviceCache(`${part}${pkg}-4`);
  const feats = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/silinx-fpga/bitdb', `${part}-${pkg}-pads.json`), 'utf8')).padFeatures;
  const byTile = new Map();
  for (const p of deviceSites(dev).pads.values()) if (/^[LR]I(OIS|BUFS)/.test(p.tile)) byTile.set(p.tile, [...(byTile.get(p.tile) || []), p]);
  const y = t => +/Y(\d+)$/.exec(t)[1];
  const pick = (side, kinds) => {
    const tiles = [...byTile.keys()].filter(t => t[0] === side).sort((a, b) => y(a) - y(b));
    const out = [];
    for (let i = 0, from = 0; i < kinds.length; i++) {
      const want = Math.max(from, Math.round(i * (tiles.length - 1) / Math.max(1, kinds.length - 1)));
      for (let j = want; j < tiles.length; j++) {
        const p = byTile.get(tiles[j]).find(q => kinds[i] === 'in' ? feats[q.name]?.['R:IFF1:#FF'] : !q.inputOnly && feats[q.name]?.['R:OFF1:#FF']);
        if (p) { out.push(p.name); from = j + 1; break; }
      }
    }
    return out;
  };
  // r(0), q(0), r(2), q(2), r(4), q(4) on the left; r(1), q(1), r(3), q(3), r(5) on the right
  const [l, r] = [pick('L', ['in', 'out', 'in', 'out', 'in', 'out']), pick('R', ['in', 'out', 'in', 'out', 'in'])];
  const ins = [l[0], r[0], l[2], r[2], l[4], r[4]], outs = [l[1], r[1], l[3], r[3], l[5]];
  return { ins, outs };
}

test('feat_iob_lines on every device: IOB registers of left and right pads on the eight global lines, byte-identical to ISE\'s, DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-ioblines-'));
  const names = [];
  for (const [part, pkg] of DEVICES) {
    const name = `feat_iob_lines-${part}`, dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iob_lines/top.vhd'), path.join(dir, 'top.vhd'));
    const { ins, outs } = sidePads(part, pkg);
    // (the design's ports: r(0-5) from sw(1), sw(2), sw(4)-sw(6), btn(0); q(0-4) to led(7), an(0)-an(3))
    const inPorts = ['sw<1>', 'sw<2>', 'sw<4>', 'sw<5>', 'sw<6>', 'btn<0>'], outPorts = ['led<7>', 'an<0>', 'an<1>', 'an<2>', 'an<3>'];
    assert.equal(ins.length + outs.length, 11, `${part}: ${ins} / ${outs}`);
    fs.writeFileSync(path.join(dir, 'top.ucf'), [...inPorts.map((p, i) => [p, ins[i]]), ...outPorts.map((p, i) => [p, outs[i]])]
      .map(([n, pad]) => `NET "${n}" LOC = "${pad}" ;\nNET "${n}" IOB = TRUE ;`).join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], constraints: 'top.ucf' }));
    names.push(name);
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...names.map(n => path.join(tmp, n))], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const n of names) {
    assert.match(r.stdout, new RegExp(`^${n}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${n}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});

// feat_iob_lone on the XC3S1200E too (#751): its inputs B3, E17, F14 and G13 there are B3's tile, the input-only pad E17
// above F14's tile, F14 with F15 and E17 unused, G13 with G14 and E18 unused
test('feat_iob_lone on the XC3S1200E: input registers on pads whose neighbouring pad is unused, byte-identical to ISE\'s, DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-ioblone-'));
  const name = 'feat_iob_lone-xc3s1200e', dir = path.join(tmp, name);
  fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iob_lone'), dir, { recursive: true });
  const proj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ ...proj, name, device: { ...proj.device, part: 'xc3s1200e' }, board: 'nexys2-1200' }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), dir], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, new RegExp(`^${name}: open flow ok; 0 warning\\(s\\)$`, 'm'));
  assert.match(r.stdout, new RegExp(`^${name}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
});

// feat_iob_owners on the XC3S1200E too (#897): A3, C9, B9 and C15 are the pads whose bits there had gone to B3, E9, D9 and
// A16 (D13's to E12 on the XC3S500E only)
test('feat_iob_owners on the XC3S1200E: IDDR2s on pads whose neighbour held some of their bits, byte-identical to ISE\'s, DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-iobowners-'));
  const name = 'feat_iob_owners-xc3s1200e', dir = path.join(tmp, name);
  fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iob_owners'), dir, { recursive: true });
  const proj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ ...proj, name, device: { ...proj.device, part: 'xc3s1200e' }, board: 'nexys2-1200' }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), dir], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, new RegExp(`^${name}: open flow ok; 0 warning\\(s\\)$`, 'm'));
  assert.match(r.stdout, new RegExp(`^${name}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
});

// feat_ll_splitters at the seeds where the router takes the XC3S1200E's other long-line splitters (#709): the left side
// DCMs' column's (CLKLH_DCM_LL) at seeds 2, 7 and 8, with CLKH_LL's at 8
test('feat_ll_splitters at seeds 2, 7, 8: the side DCM column\'s long-line splitter, byte-identical to ISE\'s, DRC clean, no warning (#709)', { skip, timeout: 60 * 60000 }, () => {
  const dir = path.join(ROOT, 'test/fixtures/open-flow/feat_ll_splitters');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...['2', '7', '8'].flatMap(s => [dir, '--seed', s])], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const s of ['2', '7', '8']) {
    const n = `feat_ll_splitters-seed-${s}`;
    assert.match(r.stdout, new RegExp(`^${n}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${n}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});
