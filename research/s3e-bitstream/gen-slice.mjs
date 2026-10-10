// Full project, stage B: the settings inside a Spartan-3E slice. A base slice (SLICE_X31Y47) with
// both LUTs and both flip-flops; one design per changed setting; compare each with the base.
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const SITE = 'SLICE_X31Y47', TILE = 'CLB_X16Y24';
const BASE = {
  F: 's_f:#LUT:D=(A1*A2)', G: 's_g:#LUT:D=(A1*A2)',
  FFX: 's_x:#FF', FFY: 's_y:#FF',
  FFX_INIT_ATTR: ':INIT0', FFY_INIT_ATTR: ':INIT0', FFX_SR_ATTR: ':SRLOW', FFY_SR_ATTR: ':SRLOW',
  SYNC_ATTR: ':ASYNC', CLKINV: ':CLK', CEINV: ':CE', SRINV: ':SR', BXINV: ':BX', BYINV: ':BY',
  DXMUX: ':1', DYMUX: ':1', FXMUX: ':F', GYMUX: ':G', XUSED: ':0', YUSED: ':0',
};
// [setting, value] per design ('#OFF' = setting removed)
const VARIANTS = [
  ['FFX', 's_x:#LATCH'], ['FFY', 's_y:#LATCH'], ['FFX', ':#OFF'], ['FFY', ':#OFF'],
  ['FFX_INIT_ATTR', ':INIT1'], ['FFY_INIT_ATTR', ':INIT1'], ['FFX_SR_ATTR', ':SRHIGH'], ['FFY_SR_ATTR', ':SRHIGH'],
  ['SYNC_ATTR', ':SYNC'], ['CLKINV', ':CLK_B'], ['CEINV', ':CE_B'], ['SRINV', ':SR_B'], ['BXINV', ':BX_B'], ['BYINV', ':BY_B'],
  ['DXMUX', ':0'], ['DYMUX', ':0'], ['FXMUX', ':F5'], ['FXMUX', ':FXOR'], ['GYMUX', ':FX'], ['GYMUX', ':GXOR'],
  ['XUSED', ':#OFF'], ['YUSED', ':#OFF'],
  ['F5USED', ':0'], ['FXUSED', ':0'], ['XBUSED', ':0'], ['YBUSED', ':0'], ['COUTUSED', ':0'], ['REVUSED', ':0'],
  ['CYINIT', ':BX'], ['CYINIT', ':CIN'], ['CYSELF', ':F'], ['CYSELF', ':1'], ['CYSELG', ':G'], ['CYSELG', ':1'],
  ['CY0F', ':0'], ['CY0F', ':1'], ['CY0F', ':BX'], ['CY0F', ':F1'], ['CY0F', ':F2'], ['CY0F', ':PROD'],
  ['CY0G', ':0'], ['CY0G', ':1'], ['CY0G', ':BY'], ['CY0G', ':G1'], ['CY0G', ':G2'], ['CY0G', ':PROD'],
  ['F5MUX', 's_f5:'], ['FXMUX5', ''], ['XORF', 's_xf:'], ['XORG', 's_xg:'], ['CYMUXF', 's_cf:'], ['CYMUXG', 's_cg:'],
].filter(([k]) => k !== 'FXMUX5');
const cfg = o => Object.entries(o).filter(([, v]) => !/^:#OFF$/.test(v)).map(([k, v]) => `${k}:${v}`).join(' ');
const xdl = o => `design "fuzz" xc3s250ecp132-4 v3.2 ,\n  cfg "";\ninst "s" "SLICEL",placed ${TILE} ${SITE} ,\n  cfg " ${cfg(o)} "\n  ;\n`;
fs.writeFileSync(`${out}/BASE.xdl`, xdl(BASE));
const names = [];
VARIANTS.forEach(([k, v], i) => {
  const name = `V${String(i).padStart(2, '0')}_${k}_${v.replace(/^.*:/, '').replace(/[^\w]/g, '') || 'on'}`;
  fs.writeFileSync(`${out}/${name}.xdl`, xdl({ ...BASE, [k]: v }));
  names.push(name);
});
console.log(names.length, 'variants');
