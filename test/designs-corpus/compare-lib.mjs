// Helpers of compare-ise.mjs (the Silinx toolchain against ISE on the design corpus), without its
// side effects, for the tests (test/quality-page.test.js).

// the first specific error (ERROR:Silinx - …, ERROR:Pack:…), not the run's summary line (ERROR: …);
// without one, the run's last lines before its summary (an exception, a crash: what happened)
export function lastError(job) {
  const lines = job.lines || [];
  const specific = lines.find(l => /^ERROR:\S/.test(l));
  if (specific) return specific.replace(/\s+/g, ' ').slice(0, 160);
  const k = lines.findIndex(l => /^ERROR: /.test(l));
  const before = (k >= 0 ? lines.slice(0, k) : lines).filter(l => l.trim() && !/^(===|INFO:)/.test(l)).slice(-2).join(' / ');
  const summary = (k >= 0 ? lines[k] : job.error) || '';
  return (before ? `${summary} (${before})` : summary || 'failed').replace(/\s+/g, ' ').slice(0, 240);
}

// Silinx's two builds in the results (#2941): `silinx` and `silinxHigh`, at the Optimizations the results' `optimizations`
// names (the Process Properties' Optimization of #2470: Area, a new project's default, and Speed); results without it
// (before #2941) are of the Optimization Efforts Normal and High
export const OPTIMIZATIONS = ['area', 'speed'];
const OPTIMIZATION_NAMES = { area: 'Area', speed: 'Speed', fast: 'Fast', normal: 'Normal', high: 'High' };
/** The names of the results' two Silinx builds: { main, second } ('Area', 'Speed'; 'Normal', 'High' before #2941). */
export function silinxSides(res) {
  const [main, second] = res?.optimizations || [];
  return main ? { main: OPTIMIZATION_NAMES[main], second: OPTIMIZATION_NAMES[second] } : { main: 'Normal', second: 'High' };
}
// Since #3070 each design is built at each of the results' `goals` (Silinx's Optimizations Area, Speed and Fast) by both
// flows, ISE at the same goal (its XST properties of GOAL_IMPL: opt_mode and opt_level): a design's `goals` hold
// { [goal]: { silinx, ise } }
export const GOALS = ['area', 'speed', 'fast'];
export const goalName = g => OPTIMIZATION_NAMES[g] || g;
/** A design's builds by goal ({ [goal]: { silinx, ise } }), also of the results before #3070 (`silinx`, `silinxHigh`, one `ise`). */
export function buildsOf(d, res) {
  if (d.goals) return d.goals;
  const [main, second] = res?.optimizations || ['normal', 'high'];
  return { [main]: { silinx: d.silinx, ise: d.ise }, ...(d.silinxHigh ? { [second]: { silinx: d.silinxHigh, ise: d.ise } } : {}) };
}
/** Whether a run's results (a --filter run's) can be merged into the earlier ones: both of the same Optimizations (goals). */
export const mergeable = (old, now) => String(old?.goals || '') === String(now?.goals || '') && String(old?.optimizations || '') === String(now?.optimizations || '');

/** The designs built before (no error on a side) that fail now on that side: ['name (Silinx): error', …]; a build not made
 *  (left out) or timed out is not one. */
export function newFailures(before, now) {
  const old = new Map((before?.designs || []).map(d => [d.name, d]));
  const out = [];
  const opt = now.optimizations && silinxSides(now);
  for (const d of now.designs || []) {
    const o = old.get(d.name);
    if (!o) continue;
    if (now.goals) {
      const was = buildsOf(o, before), is = buildsOf(d, now);
      for (const g of now.goals) {
        for (const [side, label] of [['silinx', 'Silinx'], ['ise', 'ISE']]) {
          // (a build stopped at its time limit is a gap of this run's, as one not made, #3292: not a failure)
          if (was[g]?.[side] && !was[g][side].error && is[g]?.[side]?.error && !is[g][side].timedOut) out.push(`${d.name} (${label}, ${goalName(g)}): ${is[g][side].error}`);
        }
      }
      continue;
    }
    for (const [side, label] of [['silinx', opt ? `Silinx, ${opt.main}` : 'Silinx'], ['silinxHigh', opt ? `Silinx, ${opt.second}` : 'Silinx, effort High'], ['ise', 'ISE']]) {
      if (o[side] && !o[side].error && d[side]?.error) out.push(`${d.name} (${label}): ${d[side].error}`);
    }
  }
  return out;
}

/** The clocks' periods of ise-open-check.sh's "clocks:" line ('$iopadmap$clk=7.352 …'): { net: ns }. */
export function parseClocks(text) {
  const out = {};
  for (const m of String(text).matchAll(/(\S+)=([\d.]+)/g)) out[m[1]] = +m[2];
  return out;
}

/**
 * The period of Silinx's routing to set against ISE's (#53): ISE's flow times the clocks the UCF's
 * PERIOD constrains (only them: an unconstrained clock is not analysed), so the period of such a clock
 * in trce -a's analysis of Silinx's routing (its net named after the port: '$iopadmap$<port>' or
 * '<port>'), else `worst` (trce's 'Minimum period': the worst clock). ucf: the project's UCF text.
 */
export function constrainedPeriod(clocks, ucf, worst) {
  const text = String(ucf || '');
  const periods = new Set([...text.matchAll(/PERIOD\s+"?([^"\s;]+)"?/gi)].map(m => m[1].toLowerCase()));
  const nets = [...text.matchAll(/^\s*NET\s+"([^"]+)"\s+TNM_NET\s*=\s*"?([^";\s]+)"?\s*;/gim)]
    .filter(m => periods.has(m[2].toLowerCase())).map(m => m[1].toLowerCase());
  const found = Object.entries(clocks || {}).filter(([net]) => nets.includes(net.replace(/^\$iopadmap\$/, '').toLowerCase())).map(([, ns]) => ns);
  return found.length ? Math.max(...found) : worst;
}

// the delay types of trce's paths on the Spartan-3E (#646): the carry chain (Topcyf, Tbyp, Tcinxb, Tcinck,
// Tbxcy…), a LUT (Tilo, with its F5 / F6 multiplexers, Tif5x / Tif6y, and into a flip-flop, Tfck / Tgck), a
// flip-flop's clock to out and its setup (Tcko, Tdick, Tceck, Tsrck…); else other (IOBs, block RAMs,
// multipliers)
const delayKind = t => (/cy|cin|byp/i.test(t) ? 'carry' : /^T(ilo|if|f5|f6|fck|gck)/i.test(t) ? 'lut'
  : /^T(cko|dick|dxck|dyck|ceck|srck|rpo|cklo)/i.test(t) ? 'ff' : 'other');
const ns3 = x => +x.toFixed(3);

/**
 * The worst path of each analysis of a trce report (.twr, -v 3 or more): [{ name, ns, path }], the
 * analysis's name (a constraint, 'Default period analysis for net "clk"'), its minimum period or maximum
 * delay, and its first path's breakdown { levels, lut, carry, ff, other, logic, route } (ns), null when the
 * report details no path.
 */
export function trcePaths(text) {
  const out = [];
  const parts = String(text).replace(/\r/g, '').split(/^Timing constraint:\s*/m).slice(1);
  for (const part of parts) {
    const name = part.slice(0, part.indexOf('\n')).trim().replace(/;$/, '');
    const per = /(?:Minimum period|Maximum delay) is\s+([\d.]+)ns/.exec(part);
    if (!per) continue;
    let path = null;
    const lv = /Levels of Logic = (\d+)/.exec(part);
    const end = lv && part.indexOf('Total', lv.index);
    if (lv && end > 0) {
      const tot = /^Total\s+([\d.]+)ns \(([\d.]+)ns logic, ([\d.]+)ns route\)/.exec(part.slice(end));
      const sum = { lut: 0, carry: 0, ff: 0, other: 0 };
      for (const m of part.slice(lv.index, end).matchAll(/^\s+\S+\s+(net \(fanout=\d+\)|T\w+)\s+(?:e\s+)?([\d.]+)\s/gm)) {
        if (!m[1].startsWith('net')) sum[delayKind(m[1])] += +m[2];
      }
      if (tot) path = { levels: +lv[1], lut: ns3(sum.lut), carry: ns3(sum.carry), ff: ns3(sum.ff), other: ns3(sum.other), logic: +tot[2], route: +tot[3] };
    }
    out.push({ name, ns: +per[1], path });
  }
  return out;
}

/**
 * The breakdown of the critical path of a trce report (#646): the worst path of the analysis whose period
 * (or delay) is the nearest to periodNs, the one the comparison reports (a design's constrained clock, #53);
 * without periodNs, of the slowest analysis. null when the report details none.
 */
export function criticalPath(text, periodNs) {
  const all = trcePaths(text).filter(a => a.path);
  if (!all.length) return null;
  const key = a => (periodNs == null ? -a.ns : Math.abs(a.ns - periodNs));
  return all.reduce((b, a) => (key(a) < key(b) ? a : b)).path;
}

/** The folder on the ISE host for a run's trce of Silinx's routings (#1774): `base` (server/toolchain.js iseWorkBase:
 *  SILINX_ISE_REMOTE_DIR, else the ssh config's remoteDir, e.g. /Users/Shared/silinx-ise/build, a folder Docker Desktop
 *  shares, #482; else a folder in the remote home) and the run's own: { remote, mount } (the path for ssh and rsync, and
 *  the one docker run mounts: an absolute path as it is, else under $HOME). */
export function remoteWork(base, run) {
  const remote = `${base}/${run}`;
  return { remote, mount: remote.startsWith('/') ? remote : `$HOME/${remote}` };
}
