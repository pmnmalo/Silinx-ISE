// Full project, stage B2: a harness around the slice under test (SLICE_X31Y47): every input pin
// driven by its own driver slice, every output loaded, the carry chain connected below and above.
// Written unrouted; ISE's par routes it (placement kept); the routed XDL is the base of the variants.
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const slices = JSON.parse(fs.readFileSync(process.env.SLICES || 'e7/slices.json', 'utf8'));
const S = Object.fromEntries(slices.map(s => [s.site, s]));
const T = 'SLICE_X31Y47';
const INPUTS = ['F1', 'F2', 'F3', 'F4', 'G1', 'G2', 'G3', 'G4', 'BX', 'BY', 'CE', 'CLK', 'SR'];
const OUTPUTS = ['X', 'Y', 'XQ', 'YQ'];
// drivers: CLB_X15Y24 and CLB_X17Y24 (two outputs X / Y each); loads: CLB_X16Y25 and CLB_X16Y23
const DRIVERS = ['SLICE_X28Y46', 'SLICE_X28Y47', 'SLICE_X29Y46', 'SLICE_X29Y47', 'SLICE_X32Y46', 'SLICE_X32Y47', 'SLICE_X33Y46'];
const LOADS = ['SLICE_X30Y48', 'SLICE_X30Y49', 'SLICE_X31Y49', 'SLICE_X30Y44'];
const CIN_FROM = 'SLICE_X31Y46', COUT_TO = 'SLICE_X31Y48';
for (const s of [T, ...DRIVERS, ...LOADS, CIN_FROM, COUT_TO]) if (!S[s]) throw new Error(`no ${s}`);

const inst = (site, cfg) => `inst "${site}" "${S[site].type}",placed ${S[site].tile} ${site} ,\n  cfg " ${cfg} "\n  ;`;
const insts = [];
const nets = [];
// the slice under test: both LUTs on all 4 inputs, both flip-flops, carry chain through it
const TCFG = [
  `F:${T}_f:#LUT:D=(A1*A2*A3*A4)`, `G:${T}_g:#LUT:D=(A1*A2*A3*A4)`, `FFX:${T}_x:#FF`, `FFY:${T}_y:#FF`,
  'FFX_INIT_ATTR::INIT0', 'FFY_INIT_ATTR::INIT0', 'FFX_SR_ATTR::SRLOW', 'FFY_SR_ATTR::SRLOW', 'SYNC_ATTR::ASYNC',
  'CLKINV::CLK', 'CEINV::CE', 'SRINV::SR', 'BXINV::BX', 'BYINV::BY', 'DXMUX::1', 'DYMUX::1', 'FXMUX::F', 'GYMUX::G', 'XUSED::0', 'YUSED::0',
  'CYINIT::CIN', 'CYSELF::F', 'CYSELG::G', 'CY0F::BX', 'CY0G::BY', `CYMUXF:${T}_cf:`, `CYMUXG:${T}_cg:`, 'COUTUSED::0',
].join(' ');
insts.push(inst(T, TCFG));
// drivers: LUT F -> X, LUT G -> Y (their own inputs left open)
const drvOut = [];
for (const d of DRIVERS) {
  insts.push(inst(d, `F:${d}_f:#LUT:D=A1 G:${d}_g:#LUT:D=A1 FXMUX::F GYMUX::G XUSED::0 YUSED::0`));
  drvOut.push([d, 'X'], [d, 'Y']);
}
INPUTS.forEach((p, k) => nets.push({ name: `in_${p}`, out: drvOut[k], ins: [[T, p]] }));
// loads: the output goes to F1 of a load slice's LUT
for (const l of LOADS) insts.push(inst(l, `F:${l}_f:#LUT:${l === LOADS[3] ? 'D=(A1*A2)' : 'D=A1'} FXMUX::F XUSED::0`));
OUTPUTS.forEach((p, k) => nets.push({ name: `out_${p}`, out: [T, p], ins: [[LOADS[k], 'F1']] }));
// carry chain: CIN_FROM.COUT -> T.CIN, T.COUT -> COUT_TO.CIN
insts.push(inst(CIN_FROM, `F:${CIN_FROM}_f:#LUT:D=A1 CYSELF::F CY0F::F1 CYINIT::BX CYSELG::G CY0G::G1 G:${CIN_FROM}_g:#LUT:D=A1 CYMUXF:${CIN_FROM}_cf: CYMUXG:${CIN_FROM}_cg: COUTUSED::0 BXINV::BX`));
insts.push(inst(COUT_TO, `F:${COUT_TO}_f:#LUT:D=A1 XORF:${COUT_TO}_xf: CYINIT::CIN CYSELF::F FXMUX::FXOR XUSED::0`));
nets.push({ name: 'carry_in', out: [CIN_FROM, 'COUT'], ins: [[T, 'CIN']] });
nets.push({ name: 'carry_out', out: [T, 'COUT'], ins: [[COUT_TO, 'CIN']] });
// COUT_TO's X goes to the 4th... keep it loaded by its own BX? (a net needs a load): to LOADS[3] F2
nets.push({ name: 'carry_sum', out: [COUT_TO, 'X'], ins: [[LOADS[3], 'F2']] });
const netText = nets.map(n => `net "${n.name}" ,\n  outpin "${n.out[0]}" ${n.out[1]} ,\n${n.ins.map(([i, p]) => `  inpin "${i}" ${p} ,`).join('\n')}\n  ;`).join('\n');
fs.writeFileSync(`${out}/H.xdl`, `design "harness" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n${insts.join('\n')}\n${netText}\n`);
console.log(`${insts.length} slices, ${nets.length} nets`);
