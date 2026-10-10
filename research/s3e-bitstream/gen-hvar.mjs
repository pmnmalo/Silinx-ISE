// Full project, stage B2: variants of the routed harness (h/HR.xdl): only the settings of the slice
// under test change, the placement and routing stay byte-for-byte the same.
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const text = fs.readFileSync(src, 'utf8');
const T = 'SLICE_X31Y47';
const m = new RegExp(`(inst "${T}" "SLICEL",placed \\S+ ${T}\\s*,\\s*cfg ")([^"]*)(")`).exec(text);
if (!m) throw new Error('slice under test not found');
// the settings as a map attr -> 'name:value'
const items = m[2].trim().split(/\s+/).map(x => { const i = x.indexOf(':'); return [x.slice(0, i), x.slice(i + 1)]; });
const base = new Map(items);
const write = (name, changes) => {
  const c = new Map(base);
  for (const [k, v] of Object.entries(changes)) if (v === null) c.delete(k); else c.set(k, v);
  fs.writeFileSync(`${out}/${name}.xdl`, text.replace(m[0], `${m[1]} ${[...c].map(([k, v]) => `${k}:${v}`).join(' ')} ${m[3]}`));
};
fs.writeFileSync(`${out}/BASE.xdl`, text);
const V = {
  CLKINV_B: { CLKINV: ':CLK_B' }, CEINV_B: { CEINV: ':CE_B' }, SRINV_B: { SRINV: ':SR_B' }, BXINV_B: { BXINV: ':BX_B' }, BYINV_B: { BYINV: ':BY_B' },
  LATCH: { FFX: `${T}_x:#LATCH`, FFY: `${T}_y:#LATCH` },
  INIT1_X: { FFX_INIT_ATTR: ':INIT1' }, INIT1_Y: { FFY_INIT_ATTR: ':INIT1' }, SRHIGH_X: { FFX_SR_ATTR: ':SRHIGH' }, SRHIGH_Y: { FFY_SR_ATTR: ':SRHIGH' }, SYNC: { SYNC_ATTR: ':SYNC' },
  DXMUX_0: { DXMUX: ':0', CY0F: ':0' }, DYMUX_0: { DYMUX: ':0', CY0G: ':0' },
  CYINIT_BX: { CYINIT: ':BX' },
  CYSELF_1: { CYSELF: ':1' }, CYSELG_1: { CYSELG: ':1' },
  CY0F_0: { CY0F: ':0', DXMUX: ':0' }, CY0F_1: { CY0F: ':1', DXMUX: ':0' }, CY0F_F1: { CY0F: ':F1', DXMUX: ':0' }, CY0F_F2: { CY0F: ':F2', DXMUX: ':0' }, CY0F_PROD: { CY0F: ':PROD', DXMUX: ':0' },
  CY0G_0: { CY0G: ':0', DYMUX: ':0' }, CY0G_1: { CY0G: ':1', DYMUX: ':0' }, CY0G_G1: { CY0G: ':G1', DYMUX: ':0' }, CY0G_G2: { CY0G: ':G2', DYMUX: ':0' }, CY0G_PROD: { CY0G: ':PROD', DYMUX: ':0' },
  FXMUX_FXOR: { FXMUX: ':FXOR', XORF: `${T}_xf:` }, GYMUX_GXOR: { GYMUX: ':GXOR', XORG: `${T}_xg:` },
  FXMUX_F5: { FXMUX: ':F5', F5MUX: `${T}_f5:`, F5USED: null }, GYMUX_FX: { GYMUX: ':FX' },
  NO_CYMUXG: { CYMUXG: null, COUTUSED: null },
};
for (const [name, ch] of Object.entries(V)) write(name, ch);
console.log(Object.keys(V).length, 'variants');
