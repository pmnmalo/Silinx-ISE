// The parsers of AMD Vivado's reports (#1649, server/vivado-reports.js) on excerpts of Vivado 2025.2's own (the
// examples on the Basys 3's xc7a35tcpg236-1, test/vivado/examples.test.js): a few lines of each report's tables, as
// Vivado writes them (none of its files is part of Silinx), and the edge cases (no clock, timing not met, an older
// report's columns, a DRC with rules, a failed command, the log's cumulative counts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../server/vivado-reports.js';

const UTIL = `1. Slice Logic
--------------

+-------------------------+------+-------+------------+-----------+-------+
|        Site Type        | Used | Fixed | Prohibited | Available | Util% |
+-------------------------+------+-------+------------+-----------+-------+
| Slice LUTs              |    1 |     0 |          0 |     20800 | <0.01 |
|   LUT as Logic          |    1 |     0 |          0 |     20800 | <0.01 |
|   LUT as Memory         |    0 |     0 |          0 |      9600 |  0.00 |
| Slice Registers         |   27 |     0 |          0 |     41600 |  0.06 |
|   Register as Flip Flop |   27 |     0 |          0 |     41600 |  0.06 |
| F7 Muxes                |    0 |     0 |          0 |     16300 |  0.00 |
| Unique Control Sets     |    2 |       |          0 |      8150 |  0.02 |
+-------------------------+------+-------+------------+-----------+-------+
* Warning! LUT value is adjusted to account for LUT combining.


1.1 Summary of Registers by Type
--------------------------------

+-------+--------------+-------------+--------------+
| Total | Clock Enable | Synchronous | Asynchronous |
+-------+--------------+-------------+--------------+
| 0     |            _ |           - |            - |
+-------+--------------+-------------+--------------+


2. Slice Logic Distribution
---------------------------

+--------------------------------------------+------+-------+------------+-----------+-------+
|                  Site Type                 | Used | Fixed | Prohibited | Available | Util% |
+--------------------------------------------+------+-------+------------+-----------+-------+
| Slice                                      |    9 |     0 |          0 |      8150 |  0.11 |
|   SLICEL                                   |    6 |     0 |            |           |       |
| Slice LUTs                                 |    1 |     0 |          0 |     20800 | <0.01 |
+--------------------------------------------+------+-------+------------+-----------+-------+


4. IO and GT Specific
---------------------

+-----------------------------+------+-------+------------+-----------+-------+
|          Site Type          | Used | Fixed | Prohibited | Available | Util% |
+-----------------------------+------+-------+------------+-----------+-------+
| Bonded IOB                  |    6 |     6 |          0 |       106 |  5.66 |
| IBUFDS                      |    0 |     0 |          0 |       104 |  0.00 |
| ILOGIC                      |    1 |     1 |          0 |       106 |  0.94 |
+-----------------------------+------+-------+------------+-----------+-------+


5. Clocking
-----------

+------------+------+-------+------------+-----------+-------+
|  Site Type | Used | Fixed | Prohibited | Available | Util% |
+------------+------+-------+------------+-----------+-------+
| BUFGCTRL   |    1 |     0 |          0 |        32 |  3.13 |
| MMCME2_ADV |    0 |     0 |          0 |         5 |  0.00 |
+------------+------+-------+------------+-----------+-------+


8. Primitives
-------------

+----------+------+---------------------+
| Ref Name | Used | Functional Category |
+----------+------+---------------------+
| OBUF     |    5 |                  IO |
+----------+------+---------------------+
`;

test('report_utilization: every table\'s rows used of available, once a name, the sub-rows marked, the primitives (no Available) left out', () => {
  const u = R.parseUtilization(UTIL);
  assert.deepEqual(u.map(x => [x.name, x.used, x.total, x.percent, x.level, x.section]), [
    ['Slice LUTs', 1, 20800, 0.01, 0, 'Slice Logic'], ['LUT as Logic', 1, 20800, 0.01, 1, 'Slice Logic'], ['LUT as Memory', 0, 9600, 0, 1, 'Slice Logic'],
    ['Slice Registers', 27, 41600, 0.06, 0, 'Slice Logic'], ['Register as Flip Flop', 27, 41600, 0.06, 1, 'Slice Logic'], ['F7 Muxes', 0, 16300, 0, 0, 'Slice Logic'],
    ['Unique Control Sets', 2, 8150, 0.02, 0, 'Slice Logic'], ['Slice', 9, 8150, 0.11, 0, 'Slice Logic Distribution'],
    ['Bonded IOB', 6, 106, 5.66, 0, 'IO and GT Specific'], ['IBUFDS', 0, 104, 0, 0, 'IO and GT Specific'], ['ILOGIC', 1, 106, 0.94, 0, 'IO and GT Specific'],
    ['BUFGCTRL', 1, 32, 3.13, 0, 'Clocking'], ['MMCME2_ADV', 0, 5, 0, 0, 'Clocking']]);
  // the Design Summary's rows: the main ones, and the others used
  assert.deepEqual(R.summaryRows(u).map(x => x.name), ['Slice LUTs', 'Slice Registers', 'F7 Muxes', 'Unique Control Sets', 'Slice', 'Bonded IOB', 'ILOGIC', 'BUFGCTRL', 'MMCME2_ADV']);
  assert.deepEqual(R.utilizationSummary(u), { slices: { used: 9, total: 8150, percent: 0.11 }, luts: { used: 1, total: 20800, percent: 0.01 }, ffs: { used: 27, total: 41600, percent: 0.06 },
    iobs: { used: 6, total: 106, percent: 5.66 }, bram: null, dsp: null, bufg: { used: 1, total: 32, percent: 3.13 }, mmcm: { used: 0, total: 5, percent: 0 }, pll: null });
  // an older report with no Prohibited column; a percent left out: computed
  assert.deepEqual(R.parseUtilization('| Site Type | Used | Fixed | Available | Util% |\n| Slice LUTs | 85 | 0 | 20800 | 0.41 |\n| DSPs | 3 | 0 | 90 |  |\n').map(x => [x.name, x.used, x.total, x.percent]),
    [['Slice LUTs', 85, 20800, 0.41], ['DSPs', 3, 90, 3.33]]);
  assert.deepEqual(R.parseUtilization(''), []);
  assert.deepEqual(R.parseUtilization('| Slice LUTs | 85 | 0 | 0 | 20800 | 0.41 |\n'), []);   // (no header: no columns)
});

test('report_route_status: every routable net routed; unrouted nets; routing errors', () => {
  const rs = (routable, full, err) => `Design Route Status
                                               :      # nets :
   ------------------------------------------- : ----------- :
   # of logical nets.......................... :          11 :
       # of nets not needing routing.......... :           6 :
           # of internally routed nets........ :           6 :
       # of routable nets..................... :  ${String(routable).padStart(10)} :
           # of fully routed nets............. :  ${String(full).padStart(10)} :
       # of nets with routing errors.......... :  ${String(err).padStart(10)} :
   ------------------------------------------- : ----------- :
`;
  assert.deepEqual(R.parseRouteStatus(rs(5, 5, 0)), { nets: 11, routable: 5, fullyRouted: 5, routingErrors: 0, unrouted: null, unroutedSignals: 0, routed: true });
  assert.deepEqual(R.parseRouteStatus(rs('1,281', '1,279', 0)), { nets: 11, routable: 1281, fullyRouted: 1279, routingErrors: 0, unrouted: null, unroutedSignals: 2, routed: false });
  assert.equal(R.parseRouteStatus(rs(5, 5, 1)).routed, false);
  assert.equal(R.parseRouteStatus('').routed, false);
});

const DRC = (rows) => `Report DRC

1. REPORT SUMMARY
-----------------
            Netlist: gates
          Floorplan: design_1
      Design limits: <entire design considered>
           Ruledeck: default
             Max checks: <unlimited>
             Checks found: ${rows.reduce((s, r) => s + r[3], 0)}
+----------+----------+-----------------------------------------------------+--------+
| Rule     | Severity | Description                                         | Checks |
+----------+----------+-----------------------------------------------------+--------+
${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}
+----------+----------+-----------------------------------------------------+--------+

2. REPORT DETAILS
-----------------
`;

test('report_drc: no check found; its rules by severity (CFGBVS-1, the spike\'s, #2305)', () => {
  assert.deepEqual(R.parseDrc(DRC([])), { checks: 0, errors: 0, criticalWarnings: 0, warnings: 0, advisories: 0, rules: [] });
  assert.deepEqual(R.parseDrc(DRC([['CFGBVS-1', 'Warning', 'Missing CFGBVS and CONFIG_VOLTAGE Design Properties', 1], ['NSTD-1', 'Critical Warning', 'Unspecified I/O Standard', 1], ['UCIO-1', 'Error', 'Unconstrained Logical Port', 2], ['ZPS7-1', 'Advisory', 'PS7 block required', 1]])), {
    checks: 5, errors: 2, criticalWarnings: 1, warnings: 1, advisories: 1, rules: [
      { rule: 'CFGBVS-1', severity: 'Warning', description: 'Missing CFGBVS and CONFIG_VOLTAGE Design Properties', checks: 1 },
      { rule: 'NSTD-1', severity: 'Critical Warning', description: 'Unspecified I/O Standard', checks: 1 },
      { rule: 'UCIO-1', severity: 'Error', description: 'Unconstrained Logical Port', checks: 2 },
      { rule: 'ZPS7-1', severity: 'Advisory', description: 'PS7 block required', checks: 1 }] });
});

test('report_power: the on-chip power in mW, the junction temperature, the confidence', () => {
  const pw = `+--------------------------+--------------+
| Total On-Chip Power (W)  | 2.295        |
| Design Power Budget (W)  | Unspecified* |
| Dynamic (W)              | 2.218        |
| Device Static (W)        | 0.078        |
| Effective TJA (C/W)      | 5.0          |
| Junction Temperature (C) | 36.5         |
| Confidence Level         | Low          |
+--------------------------+--------------+
`;
  assert.deepEqual(R.parsePower(pw), { totalMw: 2295, dynamicMw: 2218, staticMw: 78, junctionC: 36.5, confidence: 'Low' });
  assert.deepEqual(R.parsePower(''), { totalMw: null, dynamicMw: null, staticMw: null, junctionC: null, confidence: null });
});

test('the log: Vivado\'s messages by severity and id; each command\'s own counts from the session\'s cumulative ones; a failed command', () => {
  const log = `INFO: [Synth 8-7079] Multithreading enabled for synth_design using a maximum of 2 processes.
15 Infos, 0 Warnings, 0 Critical Warnings and 0 Errors encountered.
synth_design completed successfully
WARNING: [Power 33-232] No user defined clocks were found in the design! Power estimation will be inaccurate until this is corrected.
68 Infos, 1 Warnings, 0 Critical Warnings and 0 Errors encountered.
report_power completed successfully
CRITICAL WARNING: [Common 17-55] 'set_property' expects at least one object.
ERROR: [Place 30-58] IO placement is infeasible.
70 Infos, 1 Warnings, 1 Critical Warnings and 1 Errors encountered.
place_design failed
`;
  assert.deepEqual(R.logMessages(log), [
    { severity: 'WARNING', id: 'Power 33-232', text: 'No user defined clocks were found in the design! Power estimation will be inaccurate until this is corrected.' },
    { severity: 'CRITICAL WARNING', id: 'Common 17-55', text: '\'set_property\' expects at least one object.' },
    { severity: 'ERROR', id: 'Place 30-58', text: 'IO placement is infeasible.' }]);
  assert.deepEqual(R.logCommands(log), [
    { command: 'synth_design', infos: 15, warnings: 0, criticalWarnings: 0, errors: 0, ok: true },
    { command: 'report_power', infos: 53, warnings: 1, criticalWarnings: 0, errors: 0, ok: true },
    { command: 'place_design', infos: 2, warnings: 0, criticalWarnings: 1, errors: 1, ok: false }]);
  assert.deepEqual(R.logMessages('ERROR: [Silinx] synth: oops\nINFO: x\n'), [{ severity: 'ERROR', id: 'Silinx', text: 'synth: oops' }]);
});

const TIMING = (wns, failing, clocks = ['sys_clk_pin']) => `------------------------------------------------------------------------------------------------
| Design Timing Summary
| ---------------------
------------------------------------------------------------------------------------------------

    WNS(ns)      TNS(ns)  TNS Failing Endpoints  TNS Total Endpoints      WHS(ns)      THS(ns)  THS Failing Endpoints  THS Total Endpoints     WPWS(ns)     TPWS(ns)  TPWS Failing Endpoints  TPWS Total Endpoints  
    -------      -------  ---------------------  -------------------      -------      -------  ---------------------  -------------------     --------     --------  ----------------------  --------------------  
      ${wns}        ${failing ? '-1.234' : '0.000'}                      ${failing}                   96        0.150        0.000                      0                   96        4.500        0.000                       0                    59  


${failing ? 'Timing constraints are not met.' : 'All user specified timing constraints are met.'}


------------------------------------------------------------------------------------------------
| Clock Summary
| -------------
------------------------------------------------------------------------------------------------

Clock        Waveform(ns)       Period(ns)      Frequency(MHz)
-----        ------------       ----------      --------------
${clocks.map((c, i) => `${c.padEnd(13)}{0.000 ${i ? '20.000' : '5.000'}}      ${i ? '40.000' : '10.000'}          ${i ? '25.000' : '100.000'}         `).join('\n')}


------------------------------------------------------------------------------------------------
| Intra Clock Table
| -----------------
------------------------------------------------------------------------------------------------

Clock             WNS(ns)      TNS(ns)  TNS Failing Endpoints  TNS Total Endpoints      WHS(ns)      THS(ns)  THS Failing Endpoints  THS Total Endpoints     WPWS(ns)     TPWS(ns)  TPWS Failing Endpoints  TPWS Total Endpoints  
-----             -------      -------  ---------------------  -------------------      -------      -------  ---------------------  -------------------     --------     --------  ----------------------  --------------------  
${clocks.map((c, i) => `${c.padEnd(18)}${i ? '30.500' : wns}        0.000                      ${i ? 0 : failing}                   96        0.185        0.000                      0                   96        4.500        0.000                       0                    59  `).join('\n')}


------------------------------------------------------------------------------------------------
| Inter Clock Table
| -----------------
------------------------------------------------------------------------------------------------
`;

test('report_timing_summary: met, the worst slack, each clock\'s minimum period (its period less its slack), the slowest one the design\'s; not met; no clock', () => {
  assert.deepEqual(R.parseTimingSummary(TIMING('3.857', 0)), { met: true, wnsNs: 3.857, tnsNs: 0, whsNs: 0.15, thsNs: 0, failingEndpoints: 0, holdFailingEndpoints: 0, endpoints: 96,
    minPeriodNs: 6.143, maxFreqMHz: 162.787, timingErrors: 0, noConstraints: false, unclocked: 0,
    constraints: [{ name: 'sys_clk_pin', constraint: 'create_clock sys_clk_pin period 10 ns', periodNs: 10, wnsNs: 3.857, timingErrors: 0, minPeriodNs: 6.143, maxFreqMHz: 162.787 }] });
  const bad = R.parseTimingSummary(TIMING('-0.620', 3));
  assert.deepEqual([bad.met, bad.wnsNs, bad.timingErrors, bad.minPeriodNs, bad.maxFreqMHz, bad.constraints[0].timingErrors], [false, -0.62, 3, 10.62, 94.162, 3]);
  // two clocks: the design's minimum period the one of the lowest frequency it reaches
  const two = R.parseTimingSummary(TIMING('3.857', 0, ['sys_clk_pin', 'clk_25']));
  assert.deepEqual(two.constraints.map(c => [c.name, c.periodNs, c.minPeriodNs]), [['sys_clk_pin', 10, 6.143], ['clk_25', 40, 9.5]]);
  assert.deepEqual([two.minPeriodNs, two.maxFreqMHz], [9.5, 105.263]);
  // a design with no clock (gates): no user constraint, no period
  const none = R.parseTimingSummary(`| Design Timing Summary
| ---------------------
------------------------------------------------------------------------------------------------

    WNS(ns)      TNS(ns)  TNS Failing Endpoints  TNS Total Endpoints      WHS(ns)      THS(ns)  THS Failing Endpoints  THS Total Endpoints     WPWS(ns)     TPWS(ns)  TPWS Failing Endpoints  TPWS Total Endpoints  
    -------      -------  ---------------------  -------------------      -------      -------  ---------------------  -------------------     --------     --------  ----------------------  --------------------  
        inf        0.000                      0                    2          inf        0.000                      0                    2           NA           NA                      NA                   NA  


There are no user specified timing constraints.
`);
  assert.deepEqual([none.met, none.noConstraints, none.wnsNs, none.endpoints, none.minPeriodNs, none.constraints], [null, true, null, 2, null, []]);
  assert.equal(R.parseTimingSummary('There are 4 register/latch pins with no clock driven by root clock pin: x').unclocked, 4);
});
