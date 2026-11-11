// Silinx toolchain - the Gowin's clocks (#3488): the CST's clocks (Silinx's create_clock comment) and those the design makes, each
// rPLL's outputs and each oscillator's, at their own frequencies, written as the SDC nextpnr-himbaechel-gowin reads (--sdc): it
// derives no clock through a PLL, and its --freq applied every clock it had no constraint for (a 54 MHz CLKOUT checked at 27 MHz).
//   rPLL (UG286, Gowin Clock User Guide): CLKOUT = CLKOUTP = FCLKIN*(FBDIV_SEL+1)/(IDIV_SEL+1); CLKOUTD = its source (CLKOUTD_SRC)
//   / DYN_SDIV_SEL; CLKOUTD3 = its source (CLKOUTD3_SRC) / 3; an output bypassed (CLKOUT_BYPASS…) is CLKIN, FCLKIN; FCLKIN out of
//   its range is 100 MHz, as gowin_pack takes it; dividers dynamic (DYN_IDIV_SEL…): not known, no constraint.
//   OSC: f_osc / FREQ_DIV, f_osc 210 MHz on the GW1N(R)-4s, 250 MHz on the others (UG286's 6.1.1); the other oscillators: none.
import { PERMITTED_FREQS, PLL_DEFAULTS } from './fpga/gowin/pll-osc.js';

const bin = v => parseInt(String(v).trim(), 2);
const isTrue = v => String(v).trim().toUpperCase() === 'TRUE';

/** An rPLL's outputs' frequencies (MHz) from its parameters (Yosys's: integers in binary), on a device (family): { CLKOUT,
 *  CLKOUTP, CLKOUTD, CLKOUTD3 }, or null when its dividers are dynamic. */
export function pllFrequencies(parms, device) {
  const p = { ...PLL_DEFAULTS, ...parms };
  if (['DYN_IDIV_SEL', 'DYN_FBDIV_SEL', 'DYN_ODIV_SEL'].some(k => isTrue(p[k]))) return null;
  let fclkin = parseFloat(p.FCLKIN);
  if (!(fclkin >= 3 && fclkin <= (PERMITTED_FREQS[device]?.[0] ?? 400))) fclkin = 100;
  const pll = fclkin * (1 + bin(p.FBDIV_SEL)) / (1 + bin(p.IDIV_SEL));
  const f = { CLKOUT: isTrue(p.CLKOUT_BYPASS) ? fclkin : pll, CLKOUTP: isTrue(p.CLKOUTP_BYPASS) ? fclkin : pll };
  const src = k => (String(p[k]).trim().toUpperCase() === 'CLKOUTP' ? f.CLKOUTP : f.CLKOUT);
  f.CLKOUTD = isTrue(p.CLKOUTD_BYPASS) ? fclkin : src('CLKOUTD_SRC') / bin(p.DYN_SDIV_SEL);
  f.CLKOUTD3 = src('CLKOUTD3_SRC') / 3;
  return f;
}

/** An oscillator's frequency (MHz): OSC's, f_osc / FREQ_DIV (100 by default); null for the others. */
export function oscFrequency(type, parms, device) {
  if (type !== 'OSC') return null;
  return (/-4/.test(device) ? 210 : 250) / bin(parms.FREQ_DIV ?? '1100100');
}

const brace = s => `{${s}}`;

/** The design's clocks (its synthesized netlist, JSON) as nextpnr's constraints: [{ target, name, mhz }] (target: an SDC
 *  get_ports or get_pins), the CST's clocks (cstClocks: [{ net, period }]) first, then each rPLL's and oscillator's connected
 *  outputs; sdc: their text ('' with none). */
export function gowinClocks(netlist, top, device, cstClocks = []) {
  const json = typeof netlist === 'string' ? JSON.parse(netlist) : netlist;
  const clocks = cstClocks.map(c => ({ target: `get_ports ${brace(c.net)}`, name: c.net, mhz: 1000 / c.period }));
  const cells = json.modules?.[top]?.cells || {};
  for (const [name, cell] of Object.entries(cells)) {
    const out = cell.type === 'rPLL' ? pllFrequencies(cell.parameters || {}, device)
      : /^OSC/.test(cell.type) ? { OSCOUT: oscFrequency(cell.type, cell.parameters || {}, device) } : null;
    for (const [pin, mhz] of Object.entries(out || {})) {
      if (!mhz || typeof cell.connections?.[pin]?.[0] !== 'number') continue;
      clocks.push({ target: `get_pins ${brace(`${name}/${pin}`)}`, name: `${name}/${pin}`, mhz });
    }
  }
  const sdc = clocks.map(c => `create_clock -period ${(1000 / c.mhz).toFixed(6)} [${c.target}]\n`).join('');
  return { clocks, sdc };
}
