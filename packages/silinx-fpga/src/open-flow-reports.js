// Silinx toolchain - the open flow's timing, bitstream and reports (#405: out of runOpenFlow in
// core/open-flow-core.js): the static timing and its report, the bitstream written, the pins back-annotated
// (pin2ucf) and the power estimate (#123).
import { ESTIMATE_ERROR_PERCENT, estimatePower, powerReport } from './power.js';
import { analyzeTiming, checkCross, checkOffsets, checkPeriods, checkSwitching, clockPort, parseOffsets, switchingLine, timingReport } from './fpga/timing.js';
import { bitgen } from './fpga/bitgen.js';
import { parseUcf, pinsUcf } from './ucf.js';
import { parseXdl, placedPins } from './xdl.js';
import { StepError } from './open-flow-core.js';

/** { bitfile, runPins, runPower, runTiming } of runOpenFlow (routedText(): its current values). */
export function mountFlowReports(ctx) {
  const {
    io, spec, log, report, routedOrEarlier, routedText, top, ucfText
  } = ctx;

  function runTiming() {
    const design = parseXdl(routedText());
    const pu = ucfText ? parseUcf(ucfText) : { clocks: [], other: [] };
    const constraints = pu.clocks || [];
    // (the PERIOD constraints: a DCM's clocks' phases at the pads, #601)
    const sta = analyzeTiming(design, io.device(), { clocks: constraints });
    // the PERIOD constraints, then the OFFSET ones (#26)
    const offsets = checkOffsets(sta, design, parseOffsets(pu.other || []), constraints);
    // (#601: a DCM's clocks with their derived PERIOD; the paths between two related clocks)
    const periods = checkPeriods(sta, design, constraints), cross = checkCross(sta, design, constraints);
    // (#661: the DCMs' pins against their switching limits, as trce's Component Switching Limit checks)
    const switching = checkSwitching(design, constraints);
    const checks = [...periods, ...switching, ...cross, ...offsets];
    const lines = timingReport(sta, checks);
    report.files.timing = io.write('open/timing.txt', `Static timing analysis of ${top} (Silinx toolchain, delay model of core/fpga/timing.js)\n\n${lines.join('\n')}\n`);
    const failed = periods.filter(c => !c.missing && !c.met), offFailed = offsets.filter(c => !c.missing && !c.unsupported && !c.met);
    const crossFailed = cross.filter(c => c.related && !c.met);
    const swFailed = switching.filter(c => !c.met);
    for (const l of lines) if (/^(clock|constraint)/.test(l) || (/^paths from/.test(l) && !/not timed/.test(l))) log(l);
    for (const c of failed) {
      log(c.via ? `WARNING:Timing - constraint PERIOD ${c.constraint} ns on ${c.port}, ${c.via} (${+c.required.toFixed(3)} ns) not met: the clock needs ${c.period.toFixed(3)} ns`
        : `WARNING:Timing - constraint PERIOD ${c.required} ns on ${c.port} not met: the clock needs ${c.period.toFixed(3)} ns`);
    }
    for (const c of periods.filter(c => c.missing)) log(`WARNING:Timing - constraint PERIOD ${c.required} ns on ${c.port}: no clock of the design comes from this port`);
    for (const c of swFailed) log(`WARNING:Timing - component switching limit not met: ${switchingLine(c).replace(/^switching limit of /, '').replace(/: NOT MET,/, ':')}`);
    for (const c of crossFailed) log(`WARNING:Timing - the paths from clock ${c.from} to clock ${c.to} not met: they need ${c.delay.toFixed(3)} ns, ${c.required.toFixed(3)} ns between the clocks' edges`);
    // (a pad bounded on several clocks, a DCM's: its clock named, #601)
    const onClocks = c => offsets.filter(o => o.text === c.text && o.port === c.port && o.clock).length;
    for (const c of offFailed) log(`WARNING:Timing - constraint ${c.text} not met on ${c.port}${onClocks(c) > 1 ? `, clock ${c.clock}` : ''}: ${c.dir === 'in' ? 'pad to setup' : 'clock to pad'} ${c.value.toFixed(3)} ns`);
    for (const c of offsets.filter(c => c.missing)) log(`WARNING:Timing - constraint ${c.text}: no pad of the design is bounded by it`);
    for (const c of offsets.filter(c => c.unsupported)) log(`WARNING:Timing - constraint ${c.text}: not analyzed (the Silinx toolchain reads OFFSET on a NET or on all pads)`);
    const worst = sta.clocks.reduce((a, c) => Math.max(a, c.period), 0);
    const nErr = failed.length + offFailed.length + crossFailed.length + swFailed.length;
    report.timing = {
      met: nErr === 0, timingErrors: nErr, score: null,
      minPeriodNs: worst ? +worst.toFixed(3) : null, maxFreqMHz: worst ? +(1000 / worst).toFixed(3) : null,
      clocks: sta.clocks.map(c => ({ clock: c.clock, port: clockPort(design, c.clock), minPeriodNs: +c.period.toFixed(3), maxFreqMHz: +(1000 / c.period).toFixed(3) })),
      constraints: [...periods.filter(c => !c.missing).map(c => ({ name: `PERIOD ${c.port}${c.via ? ` ${c.via}` : ''}`, constraint: `PERIOD ${c.constraint ?? c.required} ns on ${c.port}${c.via ? `, ${c.via}` : ''}`, required: c.required,
        // (no path between two flip-flops of its clock, #1103: no period to give)
        minPeriodNs: c.noPaths ? null : +c.period.toFixed(3), maxFreqMHz: c.noPaths ? null : +(1000 / c.period).toFixed(3), timingErrors: c.met ? 0 : 1, slackNs: +c.slack.toFixed(3) })),
      // (a switching limit not met, #661: the pin's period as the value, as trce counts it under its PERIOD)
      ...swFailed.map(c => ({ name: `Component Switching Limit ${c.resource}`, constraint: `${c.limit}: ${c.bound} period limit ${c.bound === 'max' ? c.max : c.min} ns`,
        required: c.bound === 'max' ? c.max : c.min, minPeriodNs: c.period, timingErrors: 1, slackNs: +c.slack.toFixed(3) })),
      // (an OFFSET's: its pad to setup or clock to pad as the value, #26)
      ...offsets.filter(c => !c.missing && !c.unsupported).map(c => ({ name: `OFFSET ${c.dir.toUpperCase()} ${c.port}${onClocks(c) > 1 ? ` ${c.clock}` : ''}`, constraint: c.text, required: c.required,
        minPeriodNs: +c.value.toFixed(3), timingErrors: c.met ? 0 : 1, slackNs: +c.slack.toFixed(3) }))],
    };
    report.par.constraintsMet = report.timing.met;
    const nFailed = nErr;
    log(nFailed ? `${nFailed} constraint(s) not met.` : constraints.length || offsets.length ? 'All constraints were met.' : 'No timing constraints (PERIOD) in the UCF.');
  }

  function bitfile(name, startupClk) {
    const sc = /^cclk$/i.test(startupClk) ? 'Cclk' : /^userclk$/i.test(startupClk) ? 'UserClk' : 'JtagClk';
    const { bytes, unknown } = bitgen(routedText(), io.bitDb(), { name: `${top}.ncd`, crc: true, startupClk: sc, part: `${spec.device.replace(/^xc/, '')}${spec.pkg}` });
    if (unknown.length) {
      throw new StepError(`${unknown.length} feature(s) of the design are not in the bit database: no bitstream`, unknown.slice(0, 50).map(u => `${u.tile} ${u.feature}`));
    }
    return { path: io.write(name, bytes), size: bytes.length };
  }
  // Back-annotate Pin Locations: the pads of the ports in the placed design, as Xilinx pin2ucf
  // writes them (build/<top>_pins.ucf); the application adds them to the project's UCF
  function runPins() {
    const text = routedText() ?? io.read('open/routed.xdl') ?? io.read('open/placed.xdl');
    if (text == null) throw new StepError('no placed design: run Place & Route first', [], '');
    const pins = placedPins(parseXdl(text));
    let locs = {};
    try { if (ucfText) locs = parseUcf(ucfText).assignments; } catch { /* checked by translate */ }
    const given = new Set(Object.keys(locs).filter(k => locs[k].loc).map(k => k.toLowerCase()));
    const chosen = pins.filter(p => !given.has(p.net.toLowerCase())).length;
    io.write(`${top}_pins.ucf`, pinsUcf(pins, { header: `Pin locations of '${top}' on ${spec.part}: the pads of the placed design (Silinx toolchain), as Xilinx pin2ucf writes them` }));
    report.pinsUcf = { path: `build/${top}_pins.ucf` };
    log(`Pin locations of ${pins.length} port bit(s), ${chosen} of them chosen by the placer (no LOC in the constraints): build/${top}_pins.ucf`);
  }
  // Generate Text Power Report (#123): an estimate (core/power.js), laid out as XPower's text report
  // (build/<top>.pwr); its summary in the Design Summary as XPower's
  function runPower() {
    routedOrEarlier();
    let periods = [];
    try { if (ucfText) periods = parseUcf(ucfText).clocks || []; } catch { /* checked by translate */ }
    const est = estimatePower(parseXdl(routedText()), { device: spec.device, periods });
    io.write(`${top}.pwr`, powerReport(est, { top, part: spec.part, errorPercent: ESTIMATE_ERROR_PERCENT }));
    report.power = { totalMw: est.totalMw, dynamicMw: est.dynamicMw, staticMw: est.staticMw, junctionC: est.junctionC, estimate: true };
    for (const w of est.warnings) log(`WARNING:Power - ${w}`);
    log(`Estimated power: ${est.totalMw.toFixed(2)} mW (dynamic ${est.dynamicMw.toFixed(2)} mW, static ${est.staticMw.toFixed(2)} mW), junction ${est.junctionC.toFixed(1)} C: build/${top}.pwr (an estimate, not Xilinx XPower)`);
  }

  return { bitfile, runPins, runPower, runTiming };
}
