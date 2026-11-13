// A simulated ULX3S (#2298), for core/ft231x-jtag.js's tests: its FTDI FT231X (0403:6015, full speed: 64-byte packets, each
// beginning with its 2 modem status bytes) in bit-bang mode, behind WebUSB's USBDevice methods, wired to the ECP5's JTAG as the
// board is (openFPGALoader's ulx3s, ujprog's FT231X map): TCK on DSR (0x20), TMS on DCD (0x40), TDI on RI (0x80), TDO on CTS
// (0x08). Each byte written sets the outputs (the direction mask's bits); TCK rising clocks the TAP (test/fixtures/
// ftdi-jtag-sim.js simTap, its ECP5). Asynchronous bit-bang (mode 1) reads nothing; synchronous (mode 4) answers each byte
// with the pins as they were just before it was applied (TDO the TAP's output then). The RX FIFO holds 512 bytes: more
// written in synchronous mode without reading them back is an overflow (st.overflow), as the chip would lose them.
import { simDevice, simTap } from './ftdi-jtag-sim.js';

const TCK = 0x20, TMS = 0x40, TDI = 0x80, TDO = 0x08;

export function ft231xBoard({ device = 'lfe5u-85f', deviceOptions = {}, claimError = null } = {}) {
  const dev = simDevice(device, deviceOptions);
  const st = { dev, mode: null, mask: 0, pins: 0, rx: [], overflow: false, controls: [], baud: null, latency: null };
  const tap = simTap(dev, st);
  const packet = 64;

  function byte(v) {
    const before = (st.pins & ~TDO) | (tap.tdo() ? TDO : 0);
    if (st.mode === 4) { st.rx.push(before); if (st.rx.length > 512) st.overflow = true; }
    const out = v & st.mask;
    if (!(st.pins & TCK) && (out & TCK)) tap.tck(out & TMS ? 1 : 0, out & TDI ? 1 : 0);
    st.pins = out;
  }

  const usb = {
    vendorId: 0x0403, productId: 0x6015, configuration: null,
    async open() {},
    async selectConfiguration() { usb.configuration = { interfaces: [{ alternate: { endpoints: [{ direction: 'in', packetSize: packet }, { direction: 'out', packetSize: packet }] } }] }; },
    async claimInterface() { if (claimError) throw new Error(claimError); },
    async releaseInterface() {},
    async close() {},
    async controlTransferOut(setup) {
      st.controls.push([setup.request, setup.value]);
      if (setup.request === 0x0b) { st.mode = setup.value >> 8; st.mask = setup.value & 0xff; }
      if (setup.request === 0x03) st.baud = setup.value;
      if (setup.request === 0x09) st.latency = setup.value;
      if (setup.request === 0x00 && setup.value === 1) st.rx = [];   // (the RX buffer purged)
      return { status: 'ok' };
    },
    async transferOut(ep, data) {
      if (ep !== 2) throw new Error(`endpoint ${ep}`);
      if (st.mode === 1 || st.mode === 4) for (const v of data) byte(v);
      return { status: 'ok', bytesWritten: data.length };
    },
    async transferIn(ep, len) {
      if (ep !== 1) throw new Error(`endpoint ${ep}`);
      const out = [];
      do { out.push(0x01, 0x60, ...st.rx.splice(0, packet - 2)); } while (st.rx.length && out.length + packet <= len);
      return { status: 'ok', data: new DataView(new Uint8Array(out).buffer) };
    },
  };
  return { usb, st };
}
