// #96: the bidirectional pads (IOBUF on an inout port) in the Silinx toolchain: the packer's IOB (its output buffer
// from O1, its enable on T1, its input buffer to the fabric), the packed design behaving as the netlist
// (test/fpga-sim.js: the pad's value from outside while the design does not drive it), the post-translate and
// post-map models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';
import { postTranslateModels, postMapModels } from '../core/sim-model.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { compareSims } from './fpga-sim.js';

// clk -> IBUFG -> BUFG (bit 4); io: an inout port of 2 bits (an IOBUF each); a flip-flop (r) captures io(0), drives
// io(1); io(0)'s enable from the input oe, io(1)'s tied to 0 (always driving); b: an IOBUF whose input nothing reads
function bidir() {
  const io = (I, O) => ({ port_directions: { I: 'input', O: 'output' }, connections: { I: [I], O: [O] } });
  const iobuf = (i, t, o, pad) => ({ type: 'IOBUF', port_directions: { I: 'input', T: 'input', O: 'output', IO: 'inout' }, connections: { I: [i], T: [t], O: o === null ? [] : [o], IO: [pad] } });
  const cells = {
    clkbuf: { type: 'IBUFG', ...io(2, 3) }, clkg: { type: 'BUFG', ...io(3, 4) }, oebuf: { type: 'IBUF', ...io(5, 6) },
    u0: iobuf(20, 6, 21, 10), u1: iobuf(22, '0', 23, 11), ub: iobuf(21, 6, null, 12),
    r: { type: 'FDRE', parameters: {}, attributes: {}, port_directions: { C: 'input', CE: 'input', R: 'input', D: 'input', Q: 'output' }, connections: { C: [4], CE: ['1'], R: ['0'], D: [21], Q: [22] } },
    x: { type: 'LUT2', parameters: { INIT: '0110' }, attributes: {}, port_directions: { I0: 'input', I1: 'input', O: 'output' }, connections: { I0: [22], I1: [23], O: [20] } },
  };
  const ports = { clk: { direction: 'input', bits: [2] }, oe: { direction: 'input', bits: [5] }, io: { direction: 'inout', bits: [10, 11] }, b: { direction: 'inout', bits: [12] } };
  cells.u0.connections.O = [21];
  return readYosysJson({ modules: { t: { attributes: { top: 1 }, ports, cells, netnames: {} } } });
}
const iob = (p, port) => p.insts.find(i => i.kind === 'iob' && i.name === port);
const cfgText = inst => inst.cfg.map(c => `${c.attr}:${c.name}:${c.value}`).join(' ');
const pinsOf = (p, inst) => {
  const k = p.insts.indexOf(inst), out = [];
  for (const n of p.nets) for (const x of n.inpins) if (x.inst === k) out.push(x.pin);
  for (const n of p.nets) for (const x of n.outpins) if (x.inst === k) out.push(`${x.pin}>`);
  return out.sort();
};

test('a bidirectional pad (IOBUF): its output on O1, its enable on T1 (tied to 0: none), its input to the fabric (IMUX) when read', () => {
  const p = pack(bidir());
  assert.deepEqual(p.warnings, []);
  assert.equal(cfgText(iob(p, 'io<0>')), 'DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 O1INV::O1 OMUX::O1 SLEW::SLOW T1INV::T1 TMUX::T1 IDELMUX::1 IMUX::1 INBUF:io<0>_IBUF: OUTBUF:io<0>_OBUF: PAD:io<0>:');
  assert.equal(cfgText(iob(p, 'io<1>')), 'DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 O1INV::O1 OMUX::O1 SLEW::SLOW IDELMUX::1 IMUX::1 INBUF:io<1>_IBUF: OUTBUF:io<1>_OBUF: PAD:io<1>:');
  assert.equal(cfgText(iob(p, 'b')), 'DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 O1INV::O1 OMUX::O1 SLEW::SLOW T1INV::T1 TMUX::T1 OUTBUF:b_OBUF: PAD:b:');
  assert.deepEqual([pinsOf(p, iob(p, 'io<0>')), pinsOf(p, iob(p, 'io<1>')), pinsOf(p, iob(p, 'b'))], [['I>', 'O1', 'T1'], ['I>', 'O1'], ['O1', 'T1']]);
  // with the UCF's standard, drive, slew and pull
  const q = pack(bidir(), { ucf: 'NET "io<0>" IOSTANDARD = LVCMOS33 | DRIVE = 4 | SLEW = FAST | PULLUP ;\n' });
  assert.match(cfgText(iob(q, 'io<0>')), /^DRIVEATTRBOX::4 IOATTRBOX::LVCMOS33 .* SLEW::FAST .* PAD:io<0>: PULL::PULLUP$/);
});

test('the packed bidirectional pads behave as the netlist: driven, or read from outside while released (random stimulus)', () => {
  const nl = bidir(), p = pack(nl);
  for (const seed of [1, 2]) {
    const d = compareSims(nl, p, { cycles: 300, seed });
    assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
  }
});

test('the bidirectional pads in the post-translate and post-map models: an X_OBUFT onto the inout port (the map\'s an X_OBUF with no enable), an X_BUF from it; both compiled (VHDL, Verilog)', () => {
  const nl = bidir();
  for (const [m, obufs] of [[postTranslateModels(nl, { top: 't' }), 'X_OBUFT X_OBUFT X_OBUFT'], [postMapModels(nl, pack(nl), { top: 't' }), 'X_OBUF X_OBUFT X_OBUFT']]) {
    assert.deepEqual(m.unknown, []);
    assert.match(m.vhdl, /^ {4}io : inout STD_LOGIC_VECTOR \( 1 downto 0 \)/m);
    const insts = [...m.vhdl.matchAll(/^ {2}(\S+) : (X_\w+)$/gm)].map(x => x[2]);
    assert.equal(insts.filter(x => /^X_OBUF/.test(x)).sort().join(' '), obufs);
    assert.ok(insts.filter(x => x === 'X_BUF').length >= 2);
    for (const [lang, text] of [['vhdl', m.vhdl], ['verilog', m.verilog]]) {
      const all = [{ path: `m.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text }];
      const lib = compile([...primitiveSources(all), ...all]);
      assert.deepEqual([...lib.errors, ...elaborate(lib, 't').diags].filter(x => x.severity === 'error').map(x => x.message), [], lang);
    }
  }
});
