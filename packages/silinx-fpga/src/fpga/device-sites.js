// Silinx - a Spartan-3E device's sites by kind, with their positions, and its I/O banks' voltages (browser + Node).

// I/O banks of the Spartan-3E: one per side (top 0, right 1, bottom 2, left 3), named by the I/O
// tile (TIOIS, RIOIS_PCI, BIBUFS, LIOIS_CLK_PCI…). Every I/O of a bank, input or output, shares the
// bank's output voltage (VCCO), which its I/O standard sets: ISE's DRC refuses a mix
// (PhysDesignRules:755, "IOB comp … is VCCO incompatible for bank …").
const BANK_OF_SIDE = { T: 0, R: 1, B: 2, L: 3 };
export const bankOfPad = p => BANK_OF_SIDE[String(p.tile || '')[0]] ?? -1;
const VCCO = [[/^(LVTTL|LVCMOS33|PCI33_3|PCI66_3)$/, 3.3], [/^(LVCMOS25|LVDS_25|BLVDS_25|LVPECL_25|RSDS_25|MINI_LVDS_25|SSTL2_I|SSTL2_II|DIFF_SSTL2_I|DIFF_SSTL2_II)$/, 2.5],
  [/^(LVCMOS18|SSTL18_I|DIFF_SSTL18_I|HSTL_I_18|HSTL_III_18|DIFF_HSTL_I_18|DIFF_HSTL_III_18)$/, 1.8], [/^(LVCMOS15|HSTL_I|HSTL_III)$/, 1.5], [/^LVCMOS12$/, 1.2]];
/** The VCCO an I/O standard needs (null: unknown, no constraint). */
export const vccoOfStandard = std => VCCO.find(([re]) => re.test(String(std || '').toUpperCase()))?.[1] ?? null;

// ------------------------------------------------------------------ the device
/** Sites of the device by kind, with positions: slices by (x, y), pads by name, clock buffers.
 *  dev: parseXdlrc() of the device report, or the routing graph (fpga/device.js Device);
 *  allowBufg(tileName, site): the global buffers the flow can use (bitgen.js knownRouting). */
export function deviceSites(dev, { allowBufg = null } = {}) {
  const rows = dev.rows;
  const slices = new Map(), pads = new Map(), bufgmux = [], hard = { RAMB16: [], MULT18X18SIO: [] }, dcms = [];
  // the Device keeps the sites per tile as [name, bonded (0 internal, 1 bonded, 2 unbonded)]
  const tiles = dev.tiles || Array.from(dev.tileNames, (name, k) => ({
    name, r: dev.tileRow[k], c: dev.tileCol[k],
    sites: dev.tileSites[k].map(([n, b], i) => ({ name: n, type: dev.templates[dev.tileTemplate[k]].sites[i].type, bonded: b === 1 })),
  }));
  for (const t of tiles) {
    for (const s of t.sites) {
      let m;
      // physical position: tile column, tile row counted from the bottom (y grows upward as the
      // slice and CLB numbering does); the two slices of a column of a CLB half a tile apart
      if ((m = /^SLICE_X(\d+)Y(\d+)$/.exec(s.name))) {
        const x = +m[1], y = +m[2];
        slices.set(`${x},${y}`, { name: s.name, tile: t.name, type: s.type, x, y, px: t.c + (x % 2) * 0.5, py: rows - 1 - t.r + (y % 2) * 0.5 });
      } else if (/^(IOB|IBUF|DIFFM|DIFFS|DIFFMI|DIFFSI)$/.test(s.type) && s.bonded) {
        // (pair: the tile of a differential pair, DIFFM / DIFFS, whose two IOBs share each clock wire, #749)
        pads.set(s.name, { name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r, inputOnly: /^(IBUF|DIFFMI|DIFFSI)$/.test(s.type),
          pair: /^DIFF[MS]/.test(s.type) ? t.name : null, master: /^DIFFM/.test(s.type) });
      } else if (s.type === 'BUFGMUX') {
        if (!allowBufg || allowBufg(t.name, s.name)) bufgmux.push({ name: s.name, tile: t.name, px: t.c, py: rows - 1 - t.r });
      } else if (s.type === 'DCM') {
        dcms.push({ name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r });
      } else if (hard[s.type]) {
        // a block RAM and the multiplier of its tile (they share the tile's routing): four CLB rows
        // high, the site's tile at the top
        hard[s.type].push({ name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r - 1.5 });
      }
    }
  }
  // the multiplier a multiplier's BCOUT cascades into (#2): the site above it in its column, MULT18X18_XxY(y + 1)
  const multName = new Set(hard.MULT18X18SIO.map(m => m.name));
  for (const m of hard.MULT18X18SIO) {
    const above = m.name.replace(/Y(\d+)$/, (_, y) => `Y${+y + 1}`);
    m.above = multName.has(above) ? above : null;
  }
  return { part: dev.part, rows, cols: dev.cols, slices, pads, bufgmux, brams: hard.RAMB16, mults: hard.MULT18X18SIO, dcms };
}
