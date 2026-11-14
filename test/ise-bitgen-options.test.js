// ISE's bitgen option file (.ut) of each family (#3869): every option Silinx writes is one the family's bitgen takes,
// with a value it lists. A bitgen option a family does not have stops ISE's build (Bitgen:38: the Spartan-3A's
// DCMShutdown) and a value it does not list too (the Spartan-3's ConfigRate:1). The table below is `bitgen -help
// <family>` of ISE 14.7 (xilinx/ise:14.7), the options Silinx writes only, their values as bitgen lists them ('*': any).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateUt } from '../server/ise.js';
import { FAMILIES } from '../core/devices.js';

const BITGEN = {
  spartan3: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable', ConfigRate: '6 3 12 25 50',
    ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone', TckPin: 'Pullup Pulldown Pullnone',
    TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone', TmsPin: 'Pullup Pulldown Pullnone',
    UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*', DCMShutdown: 'Disable Enable',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  spartan3e: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable', ConfigRate: '1 3 6 12 25 50',
    ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone', TckPin: 'Pullup Pulldown Pullnone',
    TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone', TmsPin: 'Pullup Pulldown Pullnone',
    UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*', DCMShutdown: 'Disable Enable',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  spartan3a: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '6 1 3 7 8 10 12 13 17 22 25 27 33 44 50 100', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 1 2 3 4 5 6', Security: 'None Level1 Level2 Level3',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  spartan3adsp: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '6 1 3 7 8 10 12 13 17 22 25 27 33 44 50 100', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 1 2 3 4 5 6', Security: 'None Level1 Level2 Level3',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  spartan6: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable', ConfigRate: '2 1 4 6 10 12 16 22 26',
    ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone', TckPin: 'Pullup Pulldown Pullnone',
    TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone', TmsPin: 'Pullup Pulldown Pullnone',
    UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*', StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6',
    GTS_cycle: '5 1 2 3 4 6 Done Keep', GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 1 2 3 4 5 6',
    Security: 'None Level1 Level2 Level3', DonePipe: 'No Yes', DriveDone: 'No Yes' },
  virtex4: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '4 5 7 8 9 10 13 15 20 26 30 34 41 45 51 55 60', ProgPin: 'Pullup Pullnone',
    DonePin: 'Pullup Pullnone', TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone',
    TdoPin: 'Pullup Pulldown Pullnone', TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone',
    UserID: '*', StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  virtex5: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '2 6 9 13 17 20 24 27 31 35 38 42 46 49 53', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  virtex6: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '2 4 6 10 12 16 22 26 33 40 50 66', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'No Yes', DriveDone: 'No Yes' },
  artix7: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '3 6 9 12 16 22 26 33 40 50 66', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'Yes No' },
  kintex7: { DebugBitstream: 'No Yes', Binary: 'No Yes', CRC: 'Enable Disable',
    ConfigRate: '3 6 9 12 16 22 26 33 40 50 66', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'Yes No' },
  zynq: { Binary: 'No Yes', CRC: 'Enable Disable', ProgPin: 'Pullup Pullnone', DonePin: 'Pullup Pullnone',
    TckPin: 'Pullup Pulldown Pullnone', TdiPin: 'Pullup Pulldown Pullnone', TdoPin: 'Pullup Pulldown Pullnone',
    TmsPin: 'Pullup Pulldown Pullnone', UnusedPin: 'Pulldown Pullup Pullnone', UserID: '*',
    StartupClk: 'Cclk UserClk JtagClk', DONE_cycle: '4 1 2 3 5 6', GTS_cycle: '5 1 2 3 4 6 Done Keep',
    GWE_cycle: '6 1 2 3 4 5 Done Keep', LCK_cycle: 'NoWait 0 1 2 3 4 5 6', Security: 'None Level1 Level2',
    DonePipe: 'Yes No' },
};

// the .ut's options as { name: value }, bitgen's names being case-insensitive (StartUpClk / StartupClk)
const options = ut => [...ut.matchAll(/^-g (\w+):(\S+)$/gm)].map(m => [m[1], m[2]]);

test('#3869 every bitgen option Silinx writes is one the family\'s bitgen takes, with a value it lists', () => {
  const ise = FAMILIES.filter(f => !['ice40', 'ecp5', 'gowin'].includes(f.id)).map(f => f.id);
  assert.deepEqual(ise.filter(id => !BITGEN[id]), []);
  for (const family of ise) {
    const takes = Object.fromEntries(Object.entries(BITGEN[family]).map(([k, v]) => [k.toLowerCase(), v.split(' ')]));
    for (const binary of [false, true]) {
      for (const startupClk of ['JtagClk', 'Cclk', 'UserClk']) {
        for (const [name, value] of options(generateUt({ family, binary, impl: { startupClk } }))) {
          const values = takes[name.toLowerCase()];
          assert.ok(values, `${family}: bitgen has no option ${name}`);
          if (values[0] !== '*') assert.ok(values.some(v => v.toLowerCase() === value.toLowerCase()), `${family}: ${name}:${value} not in ${values.join(', ')}`);
        }
      }
    }
  }
});

test('#3869 the Spartan-3A\'s and 3A DSP\'s .ut have no DCMShutdown, the Spartan-3\'s ConfigRate is 6, the Zynq\'s no DebugBitstream', () => {
  for (const family of ['spartan3a', 'spartan3adsp']) {
    const ut = generateUt({ family });
    assert.doesNotMatch(ut, /DCMShutdown/, family);
    assert.match(ut, /^-g ConfigRate:1$/m, family);
    assert.match(ut, /^-g DonePin:PullUp$/m, family);
  }
  assert.match(generateUt({ family: 'spartan3' }), /^-g ConfigRate:6$/m);
  assert.match(generateUt({ family: 'spartan3' }), /^-g DCMShutdown:Disable$/m);
  assert.doesNotMatch(generateUt({ family: 'zynq' }), /DebugBitstream/);
  assert.match(generateUt({ family: 'artix7' }), /^-g DebugBitstream:No$/m);
  // (the Spartan-3E's, whose bitstreams the Silinx toolchain writes byte-identical to ISE's, as it was)
  assert.equal(generateUt({ family: 'spartan3e' }), ['-w', '-g DebugBitstream:No', '-g Binary:no', '-g CRC:Enable', '-g ConfigRate:1',
    '-g ProgPin:PullUp', '-g DonePin:PullUp', '-g TckPin:PullUp', '-g TdiPin:PullUp', '-g TdoPin:PullUp', '-g TmsPin:PullUp',
    '-g UnusedPin:PullDown', '-g UserID:0xFFFFFFFF', '-g DCMShutdown:Disable', '-g StartUpClk:JtagClk', '-g DONE_cycle:4',
    '-g GTS_cycle:5', '-g GWE_cycle:6', '-g LCK_cycle:NoWait', '-g Security:None', '-g DonePipe:No', '-g DriveDone:No', ''].join('\n'));
});
