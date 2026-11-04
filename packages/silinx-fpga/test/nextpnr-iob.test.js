// The IOB's settings of nextpnr's routed design (src/fpga/nextpnr-iob.js): a register alone on its IOB's second
// flip-flop (#2766: the DIFFM of a pair whose two registers of one kind have different clocks), as ISE's map writes it
// and as Silinx's placer did (#749): the first flip-flop's settings named for the second; the first flip-flop and the
// DDR registers as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { iobSettings } from '../src/fpga/nextpnr-iob.js';

const ff = (name, type, connections, parameters = {}) => ({ name, type, parameters: { INIT: '0', SRMODE: 'SYNC_RESET', ...parameters }, connections });
const outPad = { type: 'IOB', connections: { O: [5] }, attributes: { IOSTANDARD: 'LVCMOS33' } };
const inPad = { type: 'IOB', connections: { I: [7] }, attributes: { IOSTANDARD: 'LVCMOS33' } };
const cfg = s => s.cfg.map(c => c.join(':'));

test('iobSettings: an output register alone on OFF2, OMUX on it, clocked by OTCLK2, its data on O2 (#2766)', () => {
  const s = iobSettings({ IOB: outPad, OFF2: ff('led<1>', 'OFF', { CLK: [9], D: [4] }) }, 'led<1>', { cells: {} }, 'xc3s250ecp132-4');
  assert.equal(s.type, 'IOB');
  assert.deepEqual(cfg(s), ['DRIVEATTRBOX::12', 'IOATTRBOX::LVCMOS33', 'O2INV::O2', 'OMUX::OFF2', 'SLEW::SLOW', 'OFF2:led<1>:#FF', 'OFF2_INIT_ATTR::INIT0',
    'OTCLK2INV::OTCLK2', 'O2_DDRMUX::1', 'OUTBUF:led<1>_OBUF:', 'PAD:led<1>:']);
});

test('iobSettings: an input register alone on IFF2, clocked by ICLK2 (inverted: ICLK2_B), its delay as on IFF1\'s (#2766)', () => {
  const s = iobSettings({ IOB: inPad, IFF2: ff('sw<0>', 'IFF', { CLK: [3], D: [7] }, { CLKINV: '1' }) }, 'sw<0>', { cells: {} }, 'xc3s250ecp132-4');
  assert.equal(s.type, 'IBUF');
  assert.deepEqual(cfg(s), ['IOATTRBOX::LVCMOS33', 'IFF2:sw<0>:#FF', 'IFF2_INIT_ATTR::INIT0', 'ICLK2INV::ICLK2_B', 'IDDRIN_MUX::2', 'IFD_DELAY_VALUE::DLY3',
    'IFFDELMUX::0', 'IFFDMUX::1', 'PRE_DELAY_MUX::0', 'IFD_DELAY:sw<0>.IFD_DELAY:', 'INBUF:sw<0>_IBUF:', 'PAD:sw<0>:']);
});

test('iobSettings: OFF1 alone and an ODDR2 (OFF1 and OFF2) as before: OMUX on OFF1, on OFFDDR', () => {
  const one = iobSettings({ IOB: outPad, OFF1: ff('led<0>', 'OFF', { CLK: [9], D: [4] }) }, 'led<0>', { cells: {} }, 'xc3s250ecp132-4');
  assert.deepEqual(cfg(one), ['DRIVEATTRBOX::12', 'IOATTRBOX::LVCMOS33', 'O1INV::O1', 'OMUX::OFF1', 'SLEW::SLOW', 'OFF1:led<0>:#FF', 'OFF1_INIT_ATTR::INIT0',
    'OTCLK1INV::OTCLK1', 'O1_DDRMUX::1', 'OUTBUF:led<0>_OBUF:', 'PAD:led<0>:']);
  const ddr = iobSettings({ IOB: outPad, OFF1: ff('d/FF0', 'OFF', { CLK: [9] }), OFF2: ff('d/FF1', 'OFF', { CLK: [9] }, { CLKINV: '1' }) }, 'q', { cells: {} }, 'xc3s250ecp132-4');
  assert.ok(cfg(ddr).includes('OMUX::OFFDDR'));
  for (const c of ['OFF1:d/FF0:#FF', 'OFF2:d/FF1:#FF', 'OTCLK1INV::OTCLK1', 'OTCLK2INV::OTCLK2_B', 'OFFDDRBLACKBOX:d:']) assert.ok(cfg(ddr).includes(c), c);
});
