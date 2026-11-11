// Silinx toolchain - gowin_pack's rPLL and oscillators (#2303), ported from Apicula's gowin_pack.py (YosysHQ/apicula, MIT,
// Copyright (c) 2019 Pepijn de Vos) for the GW1N: the rPLL's attributes (set_pll_attrs: its dividers checked against the device's
// frequencies, its charge pump and loop filter from them, calc_pll_pump) and the cells it takes beside its own (extra_pll_bels);
// an oscillator's (set_osc_attrs: its divider, even). Its PLLA, PLLVR and the GW5A's are not ported.
import { ATTRIDS } from './attrids.js';
import { addAttrVal } from './chipdb.js';

// { device: [max_in, max_out, min_out, max_vco, min_vco] } (MHz)
export const PERMITTED_FREQS = {
  'GW1N-1': [400, 450, 3.125, 900, 400], 'GW1NZ-1': [400, 400, 3.125, 800, 400], 'GW1N-4': [400, 500, 3.125, 1000, 400],
  'GW1NS-4': [400, 600, 4.6875, 1200, 400], 'GW1N-9': [400, 500, 3.125, 1000, 400], 'GW1N-9C': [400, 600, 3.125, 1200, 400],
  'GW1NS-2': [400, 500, 3.125, 1200, 400], 'GW2A-18': [500, 625, 3.90625, 1250, 500], 'GW2A-18C': [500, 625, 3.90625, 1250, 500],
};
// the loop filter's resistors: [above this reference frequency (MHz), its resistance (ohm)]
const FREQ_R = {
  gw1n: [[2.6, 65100.0], [3.87, 43800.0], [7.53, 22250.0], [14.35, 11800.0], [28.51, 5940.0], [57.01, 2970.0], [114.41, 1480], [206.34, 820.0]],
  gw2a: [[2.4, 69410.0], [3.53, 47150.0], [6.82, 24430.0], [12.93, 12880.0], [25.7, 6480.0], [51.4, 3240.0], [102.81, 1620], [187.13, 890.0]],
};
const GW2A = new Set(['GW2A-18', 'GW2A-18C']);

/** calc_pll_pump: the input frequency's range index, the charge current and the resistor's index (UG286, Gowin Clock User Guide). */
export function pllPump(device, fref, fvco) {
  let fclkinIdx = Math.floor((fref - 1) / 30);
  if ((fclkinIdx === 13 && fref <= 395) || (fclkinIdx === 14 && fref <= 430) || (fclkinIdx === 15 && fref <= 465) || fclkinIdx === 16) fclkinIdx--;
  const freqR = GW2A.has(device) ? FREQ_R.gw2a : FREQ_R.gw1n;
  const rVals = freqR.map(([f, r], i) => [f, r, freqR.length - 1 - i]).filter(([f]) => f < fref).reverse();
  let K1;
  if (GW2A.has(device)) {
    const K0 = (-28.938 + Math.sqrt(837.407844 - (385.07 - fvco) * 0.9892)) / 0.4846;
    K1 = 0.1942 * K0 * K0 - 13.173 * K0 + 518.86;
  } else {
    const K0 = (497.5 - Math.sqrt(247506.25 - (2675.4 - fvco) * 78.46)) / 39.23;
    K1 = 4.8714 * K0 * K0 + 6.5257 * K0 + 142.67;
  }
  const C1 = 6.69244e-11, Kvco = 1000000.0 * K1, Ndiv = fvco / fref;
  // the resistor that gives the least current through the capacitor
  for (const [, R1, rIdx] of rVals) {
    const Ic = (1.8769 / (R1 * R1 * Kvco * C1)) * 4.0 * Ndiv;
    if (Ic <= 0.00028) return [(fclkinIdx + 1) * 16, Math.floor(Ic * 100000.0 + 0.5) * 10, rIdx];
  }
  throw new Error(`gowin_pack: no charge pump for the PLL's reference ${fref} MHz and VCO ${fvco} MHz`);
}

// the rPLL's parameters by default (the documentation's), and its internal attributes'
export const PLL_DEFAULTS = {
  FCLKIN: '100.00', IDIV_SEL: '0', DYN_IDIV_SEL: 'FALSE', FBDIV_SEL: '0', DYN_FBDIV_SEL: 'FALSE', ODIV_SEL: '1000', DYN_ODIV_SEL: 'FALSE',
  PSDA_SEL: '0000 ', DUTYDA_SEL: '1000 ', DYN_DA_EN: 'FALSE', CLKOUT_FT_DIR: '1', CLKOUT_DLY_STEP: '0', CLKOUTP_FT_DIR: '1', CLKOUTP_DLY_STEP: '0',
  DYN_SDIV_SEL: '10', CLKFB_SEL: 'INTERNAL', CLKOUTD_SRC: 'CLKOUT', CLKOUTD3_SRC: 'CLKOUT', CLKOUT_BYPASS: 'FALSE', CLKOUTP_BYPASS: 'FALSE',
  CLKOUTD_BYPASS: 'FALSE', DEVICE: 'GW1N-1',
};
const PLL_INTERNAL = {
  INSEL: 'CLKIN1', FBSEL: 'CLKFB3', PLOCK: 'ENABLE', FLOCK: 'ENABLE', FLTOP: 'ENABLE', GMCMODE: 15, CLKOUTDIV3: 'ENABLE', CLKOUTDIV: 'ENABLE',
  CLKOUTPS: 'ENABLE', PDN: 'ENABLE', PASEL: 0, IRSTEN: 'DISABLE', SRSTEN: 'DISABLE', PWDEN: 'ENABLE', RSTEN: 'ENABLE', FLDCOUNT: 16, GMCGAIN: 0,
  LPR: 'R4', ICPSEL: 50,
};
// a parameter that sets an internal attribute to a value when it is TRUE (or a given value)
const PLL_SWITCH = {
  CLKOUTD_SRC: ['CLKOUTP', 'CLKOUTDIVSEL', 'CLKOUTPS'], CLKOUTD3_SRC: ['CLKOUTP', 'CLKOUTDIV3SEL', 'CLKOUTPS'],
  DYN_IDIV_SEL: ['TRUE', 'IDIVSEL', 'DYN'], DYN_FBDIV_SEL: ['TRUE', 'FDIVSEL', 'DYN'], DYN_ODIV_SEL: ['TRUE', 'ODIVSEL', 'DYN'],
  CLKOUT_BYPASS: ['TRUE', 'BYPCK', 'BYPASS'], CLKOUTP_BYPASS: ['TRUE', 'BYPCKPS', 'BYPASS'], CLKOUTD_BYPASS: ['TRUE', 'BYPCKDIV', 'BYPASS'],
};
const bin = v => parseInt(String(v).trim(), 2);
const upper = parms => Object.fromEntries(Object.entries(parms).map(([k, v]) => [k, typeof v === 'string' ? v.toUpperCase() : v]));

/** set_pll_attrs for an rPLL: its parameters (nextpnr's cell's) to the PLL table's attribute codes. */
export function pllAttrs(db, device, parms) {
  const freqs = PERMITTED_FREQS[device];
  if (!freqs) throw new Error(`gowin_pack: the rPLL of the ${device} is not supported`);
  const inattrs = { ...upper(parms) };
  for (const [k, v] of Object.entries(PLL_DEFAULTS)) if (!(k in inattrs)) inattrs[k] = v;
  const a = { ...PLL_INTERNAL };
  let fclkin, idiv, fbdiv, odiv;
  for (const [attr, val] of Object.entries(inattrs)) {
    if (attr in a) a[attr] = val;
    if (attr in PLL_SWITCH) { const [when, k, v] = PLL_SWITCH[attr]; if (val === when) a[k] = v; continue; }
    if (attr === 'IDIV_SEL') idiv = a.IDIV = 1 + bin(val);
    else if (attr === 'FBDIV_SEL') fbdiv = a.FDIV = 1 + bin(val);
    else if (attr === 'DYN_SDIV_SEL') a.SDIV = bin(val);
    else if (attr === 'ODIV_SEL') odiv = a.ODIV = bin(val);
    else if (attr === 'DYN_DA_EN') {
      if (val === 'TRUE') {
        Object.assign(a, { DPSEL: 'DYN', DUTY: 0, PHASE: 0, PASEL: 'DISABLE' });
        a.OPDLY = bin(inattrs.CLKOUT_DLY_STEP) * 50;   // (steps of 50 ps)
        a.OSDLY = bin(inattrs.CLKOUTP_DLY_STEP) * 50;
      } else {
        a.OSDLY = 'DISABLE'; a.OPDLY = 'DISABLE';
        const phase = bin(inattrs.PSDA_SEL), duty = bin(inattrs.DUTYDA_SEL);
        a.PHASE = phase;
        a.DUTY = phase + duty < 16 ? phase + duty : phase + duty - 16;
      }
    } else if (attr === 'FCLKIN') {
      fclkin = parseFloat(val);
      if (!(fclkin >= 3 && fclkin <= freqs[0])) fclkin = 100.0;   // (gowin_pack says the frequency is out of range and takes 100 MHz)
    }
  }
  if (inattrs.DYN_IDIV_SEL === 'FALSE' && inattrs.DYN_FBDIV_SEL === 'FALSE' && inattrs.DYN_ODIV_SEL === 'FALSE') {
    // static: the dividers' frequencies checked now
    const clkout = fclkin * fbdiv / idiv;
    if (clkout <= freqs[2] || clkout > freqs[1]) throw new Error(`gowin_pack: CLKOUT = FCLKIN*(FBDIV_SEL+1)/(IDIV_SEL+1) = ${clkout}MHz not in range ${freqs[2]} - ${freqs[1]}MHz`);
    const pfd = fclkin / idiv;
    if (pfd < 3.0 || pfd > freqs[0]) throw new Error(`gowin_pack: PFD = FCLKIN/(IDIV_SEL+1) = ${pfd}MHz not in range 3.0 - ${freqs[0]}MHz`);
    const fvco = odiv * fclkin * fbdiv / idiv;
    if (fvco < freqs[4] || fvco > freqs[3]) throw new Error(`gowin_pack: VCO = FCLKIN*(FBDIV_SEL+1)*ODIV_SEL/(IDIV_SEL+1) = ${fvco}MHz not in range ${freqs[4]} - ${freqs[3]}MHz`);
  }
  const [fclkinIdx, icp, rIdx] = pllPump(device, fclkin / idiv, (odiv * fbdiv * fclkin) / idiv);
  a.ICPSEL = icp; a.LPR = `R${rIdx}`; a.FLDCOUNT = fclkinIdx;
  const fin = new Set();
  for (let i = 0; i < 16; i++) addAttrVal(db, 'PLL', fin, i, 0);
  for (const [attr, val] of Object.entries(a)) addAttrVal(db, 'PLL', fin, ATTRIDS.pll.ids[attr], typeof val === 'string' ? ATTRIDS.pll.vals[val] : val);
  return fin;
}

/** extra_pll_bels: the cells an rPLL takes beside its own (col from 1), RPLLB's: three on the GW1N-9C's side, one on the small GW1Ns. */
export function pllAuxCols(device, col) {
  if (['GW1N-9C', 'GW1N-9', 'GW2A-18', 'GW2A-18C'].includes(device)) { const dx = col > 28 ? -1 : 1; return [1, 2, 3].map(off => col + dx * off); }
  if (['GW1N-1', 'GW1NZ-1', 'GW1N-4'].includes(device)) return [col + 1];
  return [];
}

/** set_osc_attrs: an oscillator's (OSC, OSCZ, OSCF, OSCH, OSCW, OSCO) parameters to the OSC table's codes; its divider even. */
export function oscAttrs(db, typ, parms) {
  const a = {};
  for (const [p, val] of Object.entries(upper(parms))) {
    if (p === 'FREQ_DIV') {
      const fdiv = bin(val);
      if (fdiv % 2 === 1) throw new Error(`gowin_pack: Divisor of ${typ} must be even`);
      a.MCLKCIB = fdiv; a.MCLKCIB_EN = 'ENABLE';
    } else if (p === 'REGULATOR_EN' && bin(val) === 1) a.OSCREG = 'ENABLE';
  }
  a.NORMAL = 'ENABLE';
  if (typ !== 'OSC' && typ !== 'OSCW') a.USERPOWER_SAVE = 'ENABLE';
  const fin = new Set();
  for (const [attr, val] of Object.entries(a)) addAttrVal(db, 'OSC', fin, ATTRIDS.osc.ids[attr], typeof val === 'string' ? ATTRIDS.osc.vals[val] : val);
  return fin;
}

/** The OSC table's codes of its power save on (the fuses an oscillator clears first). */
export function oscPowerSave(db) {
  const s = new Set();
  addAttrVal(db, 'OSC', s, ATTRIDS.osc.ids.POWER_SAVE, ATTRIDS.osc.vals.ENABLE);
  return s;
}
