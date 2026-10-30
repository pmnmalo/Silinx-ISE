// Silinx toolchain - a DCM's settings in nextpnr's routed design (#2194), as ISE's map writes them and as Silinx's packer
// does (fpga/pack-dcm-mult.js packDcm, pack-cfg.js dcmCfg); each output's period, for nextpnr's clock constraints.
import { paramInt } from './netlist.js';

/** A DCM cell's parameters as its settings (nextpnr writes a string parameter with a trailing space). */
export function dcmSettings(params = {}) {
  const p = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  const str = k => String(p[k] ?? '').trim().toUpperCase();
  // DESKEW_ADJUST: SYSTEM_SYNCHRONOUS is 7 and SOURCE_SYNCHRONOUS 0 in ISE's map
  const deskew = str('DESKEW_ADJUST') || 'SYSTEM_SYNCHRONOUS';
  if (!/^(SYSTEM_SYNCHRONOUS|SOURCE_SYNCHRONOUS|[0-9]|1[0-5])$/.test(deskew)) throw new Error(`DESKEW_ADJUST = ${deskew} is not in the bit database yet`);
  const real = k => { const v = parseFloat(p[k]); return Number.isNaN(v) ? null : v; };
  const int = (k, d) => (p[k] === undefined ? d : paramInt(p[k], d));
  return {
    CLKDV_DIVIDE: String(real('CLKDV_DIVIDE') ?? 2).replace('.', '_'), CLKFX_DIVIDE: String(int('CLKFX_DIVIDE', 1)), CLKFX_MULTIPLY: String(int('CLKFX_MULTIPLY', 4)),
    CLKOUT_PHASE_SHIFT: str('CLKOUT_PHASE_SHIFT') || 'NONE', CLK_FEEDBACK: str('CLK_FEEDBACK') || '1X',
    DESKEW_ADJUST: { SYSTEM_SYNCHRONOUS: '7', SOURCE_SYNCHRONOUS: '0' }[deskew] ?? deskew, DFS_FREQUENCY_MODE: str('DFS_FREQUENCY_MODE') || 'LOW',
    DLL_FREQUENCY_MODE: str('DLL_FREQUENCY_MODE') || 'LOW', DUTY_CYCLE_CORRECTION: str('DUTY_CYCLE_CORRECTION') === 'FALSE' ? 'FALSE' : 'TRUE',
    PHASE_SHIFT: String(p.PHASE_SHIFT === undefined ? 0 : BigInt.asIntN(32, BigInt(paramInt(p.PHASE_SHIFT, 0)))),
    period: real('CLKIN_PERIOD'), startupWait: str('STARTUP_WAIT') === 'TRUE', divideBy2: str('CLKIN_DIVIDE_BY_2') === 'TRUE',
  };
}

/** A DCM instance's settings: [attr, name, value] in the order Silinx's packer writes them. */
export function dcmCfgOf(d, name) {
  const cfg = [['CLKDV_DIVIDE', '', d.CLKDV_DIVIDE], ...(d.divideBy2 ? [['CLKIN_DIVIDE_BY_2', '', 'CLKIN_DIVIDE_BY_2']] : []), ['CLKOUT_PHASE_SHIFT', '', d.CLKOUT_PHASE_SHIFT], ['CLK_FEEDBACK', '', d.CLK_FEEDBACK],
    ['DESKEW_ADJUST', '', d.DESKEW_ADJUST], ['DFS_FREQUENCY_MODE', '', d.DFS_FREQUENCY_MODE], ['DLL_FREQUENCY_MODE', '', d.DLL_FREQUENCY_MODE],
    ['DUTY_CYCLE_CORRECTION', '', d.DUTY_CYCLE_CORRECTION], ['FACTORY_JF1', '', '0XC0'], ['FACTORY_JF2', '', '0X80']];
  if (d.startupWait) cfg.push(['STARTUP_WAIT', '', 'STARTUP_WAIT']);
  for (const pin of ['PSCLK', 'PSEN', 'PSINCDEC', 'RST']) cfg.push([`${pin}INV`, '', pin]);
  cfg.push(['DCM', name, ''], ['CLKFX_DIVIDE', '', d.CLKFX_DIVIDE], ['CLKFX_MULTIPLY', '', d.CLKFX_MULTIPLY]);
  for (const h of ['COM', 'DFS', 'DLLC', 'DLLS', 'MISC']) cfg.push([`LL_HEX_${h}`, '', '']);
  cfg.push(['PHASE_SHIFT', '', d.PHASE_SHIFT]);
  if (d.period !== null) cfg.push(['X_CLKIN_PERIOD', '', d.period.toFixed(16)]);
  return cfg;
}

/** A clock output's period in its input's periods (as trce derives it: timing-checks.js dcmOutput), null if not a clock. */
export function dcmPeriodFactor(d, pin) {
  const div2 = d.divideBy2 ? 2 : 1;
  if (/^CLK(0|90|180|270)$/.test(pin)) return div2;
  if (/^CLK2X(180)?$/.test(pin)) return div2 / 2;
  if (pin === 'CLKDV') return div2 * parseFloat(d.CLKDV_DIVIDE.replace('_', '.'));
  if (/^CLKFX(180)?$/.test(pin)) return div2 * +d.CLKFX_DIVIDE / +d.CLKFX_MULTIPLY;
  return null;
}
