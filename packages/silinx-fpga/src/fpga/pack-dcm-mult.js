// Silinx toolchain - the packer's DCMs and multipliers (#405: out of packWith in core/fpga/pack.js): a DCM_SP's pins
// and settings; MULT18X18, MULT18X18S and MULT18X18SIO, their chains through BCIN (#2).
import { paramInt } from './netlist.js';
import { PackError } from './pack.js';

/** { packDcm, packMult } of packWith. */
export function mountDcmMult(ctx) {
  const {
    cells, ci, extra, hardSite, instLocs, multBelow, nets
  } = ctx;

  // DCM (DCM_SP): its pins by name (STATUS<i> -> STATUSi); only the settings in the bit database
  // (research/s3e-bitstream/README.md, stages D and F: every DCM of the four devices) are accepted.
  // Its site: an INST LOC of the UCF, else the placer's choice (#47)
  function packDcm(c) {
    const p = c.params;
    const str = k => String(p[k] ?? '').trim().toUpperCase();
    const bad = why => { throw new PackError(`pack: ${c.type} ${c.name}: ${why}`); };
    // DESKEW_ADJUST: SYSTEM_SYNCHRONOUS is 7 and SOURCE_SYNCHRONOUS 0 in ISE's map (#46)
    const deskew = str('DESKEW_ADJUST') || 'SYSTEM_SYNCHRONOUS';
    if (!/^(SYSTEM_SYNCHRONOUS|SOURCE_SYNCHRONOUS|[0-9]|1[0-5])$/.test(deskew)) bad(`DESKEW_ADJUST = ${deskew} is not in the bit database yet`);
    const s = hardSite(c, 'dcm', 'DCM', pin => {
      const q = /^STATUS<(\d+)>$/.exec(pin);
      if (q) return `STATUS${q[1]}`;
      return /^(CLKIN|CLKFB|RST|DSSEN|PSCLK|PSEN|PSINCDEC|CLK0|CLK90|CLK180|CLK270|CLK2X|CLK2X180|CLKDV|CLKFX|CLKFX180|LOCKED|PSDONE)$/.test(pin) ? pin : null;
    });
    // a real as XDL writes it: 2.5 -> 2_5, 20 -> 20.0000000000000000 (the input period)
    const real = k => { const v = parseFloat(p[k]); return Number.isNaN(v) ? null : v; };
    const int = (k, d) => (p[k] === undefined ? d : paramInt(p[k], d));
    const dv = real('CLKDV_DIVIDE') ?? 2;
    s.dcm = {
      CLKDV_DIVIDE: String(dv).replace('.', '_'), CLKFX_DIVIDE: String(int('CLKFX_DIVIDE', 1)), CLKFX_MULTIPLY: String(int('CLKFX_MULTIPLY', 4)),
      CLKOUT_PHASE_SHIFT: str('CLKOUT_PHASE_SHIFT') || 'NONE', CLK_FEEDBACK: str('CLK_FEEDBACK') || '1X',
      DESKEW_ADJUST: { SYSTEM_SYNCHRONOUS: '7', SOURCE_SYNCHRONOUS: '0' }[deskew] ?? deskew, DFS_FREQUENCY_MODE: str('DFS_FREQUENCY_MODE') || 'LOW',
      DLL_FREQUENCY_MODE: str('DLL_FREQUENCY_MODE') || 'LOW', DUTY_CYCLE_CORRECTION: str('DUTY_CYCLE_CORRECTION') === 'FALSE' ? 'FALSE' : 'TRUE',
      PHASE_SHIFT: String(p.PHASE_SHIFT === undefined ? 0 : BigInt.asIntN(32, BigInt(paramInt(p.PHASE_SHIFT, 0)))),
      period: real('CLKIN_PERIOD'), startupWait: str('STARTUP_WAIT') === 'TRUE', divideBy2: str('CLKIN_DIVIDE_BY_2') === 'TRUE',
    };
    s.loc = instLocs.get(c.name) || null;
  }
  // Multiplier: MULT18X18 (no registers), MULT18X18S (registered product: C, CE, R) or MULT18X18SIO.
  // As ISE builds the first two (#50): MULT18X18S's CE on CEA, CEB and CEP, R on RSTA, RSTB and
  // RSTP; MULT18X18's enables and clock tied to 0, its resets to 1.
  // The cascade (#2): a MULT18X18SIO with B_INPUT = CASCADE takes B from the BCOUT of the multiplier below it
  // (BCIN<k> = its BCOUT<k>, the block-RAM column's dedicated wires MULT_CCARRY_BCOUTk -> MULT_CARRYB_BCOUTk, as ISE
  // builds it; measured with ISE, research/s3e-bitstream gen-cascade.mjs); the placer puts a chain on consecutive
  // sites of a column (multChains). BCIN with B_INPUT = DIRECT is not used, nor B with CASCADE (connected, ISE's DRC
  // warns: PhysDesignRules:1135, "Input pins B0-B17 should not be connected if B_INPUT is set to CASCADE").
  function cascaded(c) { return c.type === 'MULT18X18SIO' && String(c.params.B_INPUT || 'DIRECT').trim().toUpperCase() === 'CASCADE'; }
  function multCascade(c) {
    const bad = why => { throw new PackError(`pack: ${c.type} ${c.name}: ${why}`); };
    for (const [p, n] of Object.entries(c.pins)) {
      const q = /^BCOUT<(\d+)>$/.exec(p);
      if (!q) continue;
      for (const l of nets[n].loads) if (!(cascaded(cells[l.cell]) && l.pin === `BCIN<${q[1]}>`)) bad(`the cascade output BCOUT<${q[1]}> into anything but BCIN<${q[1]}> of a multiplier with B_INPUT = CASCADE is not supported`);
      if (new Set(nets[n].loads.map(l => l.cell)).size > 1) bad('the cascade output BCOUT into more than one multiplier is not possible');
    }
    if (!cascaded(c)) return;
    const below = new Set();
    for (let k = 0; k < 18; k++) {
      const n = c.pins[`BCIN<${k}>`], d = n === undefined ? null : nets[n].driver;
      if (!d || cells[d.cell].type !== 'MULT18X18SIO' || d.pin !== `BCOUT<${k}>`) bad(`B_INPUT = CASCADE: BCIN<${k}> is not the BCOUT<${k}> of a multiplier`);
      below.add(d.cell);
    }
    if (below.size > 1) bad('B_INPUT = CASCADE: BCIN from more than one multiplier');
    multBelow.set(ci(c), [...below][0]);
  }
  function packMult(c) {
    multCascade(c);
    const casc = cascaded(c);
    const s = hardSite(c, 'mult', 'MULT18X18SIO', p => {
      const q = /^(A|B|P|BCIN|BCOUT)<(\d+)>$/.exec(p);
      if (q && q[1] === 'BCIN') return casc ? `BCIN${q[2]}` : null;
      if (q && q[1] === 'BCOUT') return nets[c.pins[p]].loads.length ? `BCOUT${q[2]}` : null;
      if (q) return casc && q[1] === 'B' ? null : `${q[1]}${q[2]}`;
      if (c.type === 'MULT18X18S') return { C: 'CLK', CE: ['CEA', 'CEB', 'CEP'], R: ['RSTA', 'RSTB', 'RSTP'] }[p] || null;
      return /^(CLK|CEA|CEB|CEP|RSTA|RSTB|RSTP)$/.test(p) ? p : null;
    });
    if (c.type === 'MULT18X18') {
      for (const pin of ['CEA', 'CEB', 'CEP', 'CLK', 'RSTA', 'RSTB', 'RSTP']) {
        extra.push({ net: /^RST/.test(pin) ? 1 : 0, inst: s.idx, pin, kind: 'gen' });
        s.conn.add(pin);
      }
    }
    s.mult = c.type;
  }

  return { packDcm, packMult };
}
