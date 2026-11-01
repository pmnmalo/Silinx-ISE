// A simulated iCE40 board on an FTDI FT2232H (#2298), for core/ftdi-ice40.js's tests: WebUSB's USBDevice methods, the
// FT2232H's channel A in MPSSE mode (its commands as FTDI's AN_108 defines them), a Winbond W25Q-like SPI flash on its
// SPI pins and CS (ADBUS4), and the iCE40's CRESET_B (ADBUS7) and CDONE (ADBUS6): released, the FPGA loads the flash and
// raises CDONE when the flash begins with an iCE40 image (its sync word 7E AA 99 7E).

const SYNC = [0x7e, 0xaa, 0x99, 0x7e];

export function ftdiBoard({ flashSize = 1 << 24, jedec = [0xef, 0x40, 0x18], packet = 512, stuck = null, mpsse = true, claimError = null } = {}) {
  const flash = new Uint8Array(flashSize).fill(0xff);
  const st = { flash, opened: false, claimed: false, mode: null, cs: true, creset: true, cdone: false, wel: false, poweredDown: true,
    contention: false, controls: [], commands: [], erased: [], rx: [], cmd: null, packet };
  const loads = () => SYNC.every((b, i) => flash[i] === b);

  // a byte on the SPI bus while CS is low: the flash's answer
  function spi(b) {
    const c = st.cmd;
    c.push(b);
    if (st.poweredDown && c[0] !== 0xab) return 0xff;
    const k = c.length - 1;
    switch (c[0]) {
      case 0x9f: return k >= 1 && k <= 3 ? jedec[k - 1] : 0xff;
      case 0x05: return k >= 1 ? (st.wel ? 2 : 0) : 0xff;
      case 0x03: return k >= 4 ? flash[(((c[1] << 16) | (c[2] << 8) | c[3]) + k - 4) % flashSize] : 0xff;
      default: return 0xff;
    }
  }
  // CS high: the command done
  function finish() {
    const c = st.cmd;
    st.cmd = null;
    if (!c?.length) return;
    st.commands.push(c[0]);
    const addr = () => (c[1] << 16) | (c[2] << 8) | c[3];
    if (c[0] === 0xab) { st.poweredDown = false; return; }
    if (st.poweredDown) return;
    if (c[0] === 0xb9) st.poweredDown = true;
    else if (c[0] === 0x06) st.wel = true;
    else if (c[0] === 0xd8 && c.length === 4 && st.wel) {
      const a = addr() & ~0xffff;
      flash.fill(0xff, a, a + 0x10000);
      st.erased.push(a);
      st.wel = false;
    } else if (c[0] === 0x02 && c.length >= 5 && st.wel) {
      const a = addr();
      // a page's bytes, wrapping inside the page; programming only clears bits
      c.slice(4).forEach((v, i) => { const at = (a & ~0xff) | ((a + i) & 0xff); if (at !== stuck) flash[at] &= v; });
      st.wel = false;
    }
  }
  function gpio(v) {
    const cs = !!(v & 0x10), creset = !!(v & 0x80);
    if (!cs && st.cs) st.cmd = [];
    if (cs && !st.cs) finish();
    if (creset && !st.creset) st.cdone = loads();   // released: the FPGA loads the flash
    if (!creset) st.cdone = false;
    st.cs = cs; st.creset = creset;
  }
  function mpsseStream(d) {
    for (let i = 0; i < d.length;) {
      const op = d[i++];
      if (op === 0x80) { gpio(d[i]); i += 2; } else if (op === 0x81) st.rx.push((st.cs ? 0x10 : 0) | (st.cdone ? 0x40 : 0) | (st.creset ? 0x80 : 0));
      else if (op === 0x86) i += 2;
      else if ([0x8a, 0x97, 0x8d, 0x85, 0x87].includes(op)) { /* the clock's settings, send immediate */ } else if (op === 0x11 || op === 0x31) {
        const n = d[i] + (d[i + 1] << 8) + 1;
        const bytes = d.slice(i + 2, i + 2 + n);
        i += 2 + n;
        for (const b of bytes) {
          if (st.cs) { st.rx.push(...(op === 0x31 ? [0xff] : [])); continue; }
          if (st.creset) st.contention = true;   // (the FPGA's SPI pins on the flash too)
          const r = spi(b);
          if (op === 0x31) st.rx.push(r);
        }
      } else st.rx.push(0xfa, op);   // a bad command
    }
  }

  const usb = {
    vendorId: 0x0403, productId: 0x6010, configuration: null,
    async open() { st.opened = true; },
    async selectConfiguration() { usb.configuration = { interfaces: [{ alternate: { endpoints: [{ direction: 'in', packetSize: packet }, { direction: 'out', packetSize: packet }] } }] }; },
    async claimInterface() { if (claimError) throw new Error(claimError); st.claimed = true; },
    async releaseInterface() { st.claimed = false; },
    async close() { st.opened = false; },
    async controlTransferOut(setup) {
      st.controls.push([setup.request, setup.value]);
      if (setup.request === 0x0b) st.mode = setup.value >> 8;
      return { status: 'ok' };
    },
    async transferOut(ep, data) {
      if (ep !== 2) throw new Error(`endpoint ${ep}`);
      if (st.mode === 2 && mpsse) mpsseStream([...data]);
      return { status: 'ok', bytesWritten: data.length };
    },
    async transferIn(ep, len) {
      if (ep !== 1) throw new Error(`endpoint ${ep}`);
      // packets of the endpoint's size, each with its 2 status bytes (none of the data when there is none)
      const out = [];
      do { out.push(0x32, 0x60, ...st.rx.splice(0, packet - 2)); } while (st.rx.length && out.length + packet <= len);
      return { status: 'ok', data: new DataView(new Uint8Array(out).buffer) };
    },
  };
  return { usb, st };
}

/** An iCE40 image of n bytes: its sync word first, then bytes of every value. */
export const ice40Image = n => Uint8Array.from({ length: n }, (_, i) => (i < 4 ? SYNC[i] : (i * 7 + (i >> 8)) & 0xff));
