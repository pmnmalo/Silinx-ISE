// The reports of AMD Vivado's batch flow (server/vivado.js, #1649) parsed into the shape of ISE's (server/ise.js
// collectReports: synthesis, map, par, timing, power, bit, summary), with source 'vivado':
//   report_utilization     -> synthesis.utilization (after synth_design), map.utilization (after route_design)
//   report_route_status    -> par
//   report_timing_summary  -> timing
//   report_drc             -> drc
//   report_power           -> power
//   vivado.log             -> each command's counts of messages ("N Infos, N Warnings, …") and its messages
// The parsers take the reports' text only: none of Vivado's files is part of Silinx (CLAUDE.md).

const num = s => {
  if (s === undefined || s === null) return null;
  const t = String(s).replace(/[,<]/g, '').trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

// a table's cells: "| a | b |" -> ['a', 'b'] (the name's leading spaces kept: they say it is a sub-row)
const cells = line => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c, i) => (i ? c.trim() : c.replace(/\s+$/, '')));

/**
 * report_utilization: every row of its tables with a count used and available, in order, once a name (a sub-row,
 * indented in the report, has level 1): [{ name, used, total, percent, level, section }]. The report's columns are
 * found by their header (Site Type | Used | Fixed | Prohibited | Available | Util%; older versions have no Prohibited).
 */
export function parseUtilization(text) {
  const items = [], seen = new Set();
  let cols = null, section = null;
  for (const line of String(text).split(/\r?\n/)) {
    const sec = /^(\d+(?:\.\d+)*)\.\s+(.+?)\s*$/.exec(line);
    if (sec && !/\|/.test(line)) { section = sec[2]; cols = null; continue; }
    if (!/^\s*\|/.test(line)) continue;
    const c = cells(line);
    if (/^\s*Site Type\s*$/.test(c[0]) || /^\s*Ref Name\s*$/.test(c[0])) {
      cols = { used: c.indexOf('Used'), avail: c.indexOf('Available'), util: c.findIndex(x => /^Util%$/.test(x)) };
      if (cols.used < 0) cols = null;
      continue;
    }
    if (!cols || cols.avail < 0) continue;
    const used = num(c[cols.used]), total = num(c[cols.avail]);
    if (used === null || total === null) continue;
    const name = c[0].trim().replace(/\*+$/, '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const pct = cols.util >= 0 ? num(c[cols.util]) : null;
    items.push({ name, used, total, percent: pct ?? (total ? +(100 * used / total).toFixed(2) : null), level: /^\s{2,}/.test(c[0]) ? 1 : 0, section });
  }
  return items;
}

const pick = (items, re) => { const it = items.find(i => re.test(i.name)); return it ? { used: it.used, total: it.total, percent: it.percent } : null; };

// the rows the Design Summary always shows (the others when used): the 7-series' logic, memory, I/O and clocks
export const MAIN_ROWS = ['Slice LUTs', 'Slice Registers', 'Slice', 'F7 Muxes', 'Block RAM Tile', 'DSPs', 'Bonded IOB', 'BUFGCTRL', 'MMCME2_ADV', 'PLLE2_ADV'];
/** The top-level rows of report_utilization the Design Summary shows: the main ones, and every other one used. */
export const summaryRows = items => items.filter(u => !u.level && (MAIN_ROWS.includes(u.name) || u.used > 0));

/** The headline counts of report_utilization's rows, as ISE's map summary names them. */
export function utilizationSummary(items) {
  return {
    slices: pick(items, /^Slice$/),
    luts: pick(items, /^Slice LUTs$/) || pick(items, /^CLB LUTs$/),
    ffs: pick(items, /^Slice Registers$/) || pick(items, /^CLB Registers$/),
    iobs: pick(items, /^Bonded IOB$/),
    bram: pick(items, /^Block RAM Tile$/),
    dsp: pick(items, /^DSPs$/),
    bufg: pick(items, /^BUFGCTRL$/),
    mmcm: pick(items, /^MMCME2_ADV$/),
    pll: pick(items, /^PLLE2_ADV$/),
  };
}

/** report_route_status: { routed, unroutedSignals, nets, routable, fullyRouted, routingErrors }. */
export function parseRouteStatus(text) {
  const n = re => { const m = re.exec(text); return m ? num(m[1]) : null; };
  const out = {
    nets: n(/# of logical nets\.*\s*:\s*([\d,]+)/),
    routable: n(/# of routable nets\.*\s*:\s*([\d,]+)/),
    fullyRouted: n(/# of fully routed nets\.*\s*:\s*([\d,]+)/),
    routingErrors: n(/# of nets with routing errors\.*\s*:\s*([\d,]+)/),
    unrouted: n(/# of unrouted nets\.*\s*:\s*([\d,]+)/),
  };
  const missing = out.routable !== null && out.fullyRouted !== null ? out.routable - out.fullyRouted : null;
  out.unroutedSignals = missing ?? out.unrouted ?? null;
  out.routed = out.routable !== null && out.unroutedSignals === 0 && !out.routingErrors;
  return out;
}

// the lines of a section of report_timing_summary: from its "| Title" to the next section
function section(text, title) {
  const i = text.search(new RegExp(`^\\|\\s*${title}\\s*$`, 'm'));
  if (i < 0) return '';
  const rest = text.slice(i);
  const next = rest.slice(1).search(/^-{20,}\r?\n\|\s*\S/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

// a table of whitespace-separated columns under a header line and its dashes: its rows as arrays
function columns(chunk) {
  const lines = chunk.split(/\r?\n/);
  const d = lines.findIndex(l => /^\s*-{3,}(\s+-{3,})+\s*$/.test(l));
  if (d < 0) return [];
  const rows = [];
  for (const l of lines.slice(d + 1)) { if (!l.trim()) { if (rows.length) break; continue; } rows.push(l.trim().split(/\s+/)); }
  return rows;
}

/**
 * report_timing_summary: { met, wnsNs, tnsNs, whsNs, thsNs, failingEndpoints, holdFailingEndpoints, endpoints,
 * minPeriodNs, maxFreqMHz, timingErrors, constraints: [{ name, constraint, periodNs, wnsNs, timingErrors,
 * minPeriodNs, maxFreqMHz }], noConstraints, unclocked }. The minimum period of a clock is its period less its
 * worst setup slack (the slowest clock's, for the design's).
 */
export function parseTimingSummary(text) {
  text = String(text);
  const out = { met: null, wnsNs: null, tnsNs: null, whsNs: null, thsNs: null, failingEndpoints: null, holdFailingEndpoints: null, endpoints: null, minPeriodNs: null, maxFreqMHz: null, timingErrors: null, constraints: [], noConstraints: false, unclocked: null };
  const d = columns(section(text, 'Design Timing Summary'))[0];
  if (d && d.length >= 8) {
    [out.wnsNs, out.tnsNs, out.failingEndpoints, out.endpoints, out.whsNs, out.thsNs, out.holdFailingEndpoints] = d.slice(0, 7).map(num);
  }
  if (/All user specified timing constraints are met\./.test(text)) out.met = true;
  else if (/Timing constraints are not met\./.test(text)) out.met = false;
  if (/There are no user specified timing constraints\./.test(text)) out.noConstraints = true;
  const uc = /There (?:is|are) (\d+) register\/latch pins? with no clock/.exec(text);
  out.unclocked = uc ? +uc[1] : 0;
  const periods = {};
  for (const r of columns(section(text, 'Clock Summary'))) {
    // Clock  Waveform(ns)  Period(ns)  Frequency(MHz): the waveform is "{0.000 5.000}"
    const m = /^(\S+)\s+\{[^}]*\}\s+([\d.]+)\s+([\d.]+)/.exec(r.join('  '));
    if (m) periods[m[1].replace(/^\s+/, '')] = num(m[2]);
  }
  for (const r of columns(section(text, 'Intra Clock Table'))) {
    const [name, wns, , failing] = r;
    if (!(name in periods)) continue;
    const c = { name, constraint: `create_clock ${name} period ${periods[name]} ns`, periodNs: periods[name], wnsNs: num(wns), timingErrors: num(failing) ?? 0 };
    if (c.wnsNs !== null) { c.minPeriodNs = +(c.periodNs - c.wnsNs).toFixed(3); c.maxFreqMHz = +(1000 / c.minPeriodNs).toFixed(3); }
    else { c.minPeriodNs = null; c.maxFreqMHz = null; }
    out.constraints.push(c);
  }
  const timed = out.constraints.filter(c => c.minPeriodNs !== null);
  if (timed.length) {
    const worst = timed.reduce((a, b) => (b.maxFreqMHz < a.maxFreqMHz ? b : a));
    out.minPeriodNs = worst.minPeriodNs; out.maxFreqMHz = worst.maxFreqMHz;
  }
  if (out.failingEndpoints !== null) out.timingErrors = out.failingEndpoints + (out.holdFailingEndpoints || 0);
  if (out.met === null && out.timingErrors !== null && !out.noConstraints) out.met = out.timingErrors === 0;
  return out;
}

/** report_drc: { checks, errors, warnings, advisories, rules: [{ rule, severity, description, checks }] }. */
export function parseDrc(text) {
  const out = { checks: null, errors: 0, criticalWarnings: 0, warnings: 0, advisories: 0, rules: [] };
  const cf = /Checks found:\s*(\d+)/.exec(text); if (cf) out.checks = +cf[1];
  for (const line of String(text).split(/\r?\n/)) {
    if (!/^\|/.test(line)) continue;
    const [rule, severity, description, checks] = cells(line).map(s => s.trim());
    if (!rule || rule === 'Rule' || !/^\d+$/.test(checks || '')) continue;
    out.rules.push({ rule, severity, description, checks: +checks });
    if (/^Error$/i.test(severity)) out.errors += +checks;
    else if (/^Critical Warning$/i.test(severity)) out.criticalWarnings += +checks;
    else if (/^Warning$/i.test(severity)) out.warnings += +checks;
    else out.advisories += +checks;
  }
  if (out.checks === null) out.checks = out.rules.reduce((s, r) => s + r.checks, 0);
  return out;
}

/** report_power: { totalMw, dynamicMw, staticMw, junctionC, confidence }. */
export function parsePower(text) {
  const w = re => { const m = re.exec(text); return m ? +(parseFloat(m[1]) * 1000).toFixed(1) : null; };
  const j = /\|\s*Junction Temperature \(C\)\s*\|\s*([\d.]+)/.exec(text);
  const c = /\|\s*Confidence Level\s*\|\s*(\w+)/.exec(text);
  return {
    totalMw: w(/\|\s*Total On-Chip Power \(W\)\s*\|\s*([\d.]+)/),
    dynamicMw: w(/\|\s*Dynamic \(W\)\s*\|\s*([\d.]+)/),
    staticMw: w(/\|\s*Device Static \(W\)\s*\|\s*([\d.]+)/),
    junctionC: j ? parseFloat(j[1]) : null,
    confidence: c ? c[1] : null,
  };
}

/** Vivado's messages in a log: [{ severity: 'ERROR' | 'CRITICAL WARNING' | 'WARNING', id, text }] (id: "Synth 8-7129"). */
export function logMessages(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(ERROR|CRITICAL WARNING|WARNING):\s*(?:\[([^\]]+)\]\s*)?(.*)$/.exec(line);
    if (m) out.push({ severity: m[1], id: m[2] || null, text: m[3].trim() });
  }
  return out;
}

/** The commands' outcomes in a log: [{ command, infos, warnings, criticalWarnings, errors, ok }], in order, each its own
 *  messages (Vivado's counts are the session's so far: each command's, the difference from the one before). */
export function logCommands(text) {
  const out = [];
  const re = /^(\d+) Infos?, (\d+) Warnings?, (\d+) Critical Warnings? and (\d+) Errors? encountered\.\r?\n(\w+) (completed successfully|failed)/gm;
  let m, last = [0, 0, 0, 0];
  while ((m = re.exec(text))) {
    const n = [+m[1], +m[2], +m[3], +m[4]], d = n.map((v, i) => v - last[i]);
    last = n;
    out.push({ command: m[5], infos: d[0], warnings: d[1], criticalWarnings: d[2], errors: d[3], ok: m[6] !== 'failed' });
  }
  return out;
}
