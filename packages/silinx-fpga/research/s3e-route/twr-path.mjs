// The critical path of a trce report (ISE's flow or Silinx's routing, trce -v), net by net (#651): its
// fanout, delay, from site.pin -> to site.pin and the distance in CLBs (columns, rows); and a summary (the
// nets, the routing per net, the nets inside one CLB, the mean distance, the fanouts).
//   node research/s3e-route/twr-path.mjs <file.twr> [period ns: the path nearest it; default the slowest] [--quiet]
import fs from 'node:fs';
const [file, per] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const quiet = process.argv.includes('--quiet');
const text = fs.readFileSync(file, 'latin1').replace(/\r/g, '');
// every detailed path: "Slack ... Source: ... Destination: ... Data Path Delay: Xns" .. "Total" block
const paths = [];
for (const m of text.matchAll(/^(?:Slack|Delay:)[^\n]*\n([\s\S]*?)^\s*Total\s+([\d.]+)ns \(([\d.]+)ns logic, ([\d.]+)ns route\)/gm)) {
  const body = m[1];
  const steps = [...body.matchAll(/^\s+(\S+)\s+(net \(fanout=(\d+)\)|T\w+)\s+(?:e\s+)?([\d.]+)\s+(\S+)/gm)].map(x => ({ loc: x[1], what: x[2], fanout: x[3] ? +x[3] : null, ns: +x[4], name: x[5] }));
  const req = /Requirement:\s+([\d.]+)ns/.exec(body), dpd = /Data Path Delay:\s+([\d.]+)ns/.exec(body), skew = /Clock Path Skew:\s+(-?[\d.]+)ns/.exec(body);
  paths.push({ total: +m[2], logic: +m[3], route: +m[4], steps, dpd: dpd ? +dpd[1] : null });
}
if (!paths.length) { console.log('no detailed path'); process.exit(1); }
const p = per ? paths.reduce((b, a) => (Math.abs(a.total - per) < Math.abs(b.total - per) ? a : b)) : paths.reduce((b, a) => (a.total > b.total ? a : b));
const rc = loc => { const m = /^(?:SLICE|RAMB16|MULT18X18)_X(\d+)Y(\d+)/.exec(loc); if (!m) return null; return /^SLICE/.test(loc) ? [Math.floor(+m[1] / 2), Math.floor(+m[2] / 2)] : [+m[1], +m[2]]; };
let prev = null;
const nets = [];
for (const s of p.steps) {
  if (s.what.startsWith('net')) {
    const a = prev && rc(prev.loc), b = rc(s.loc);
    const d = a && b && /^SLICE/.test(prev.loc) && /^SLICE/.test(s.loc) ? [b[0] - a[0], b[1] - a[1]] : null;
    nets.push({ ...s, from: prev?.loc, d });
    if (!quiet) console.log(`  net ${s.ns.toFixed(3)} fo=${s.fanout} ${prev?.loc} -> ${s.loc} ${d ? `d=(${d})` : ''}`);
  } else if (!quiet) console.log(`${s.what.padEnd(8)} ${s.ns.toFixed(3)} ${s.loc}`);
  prev = s;
}
const routed = nets.filter(n => n.ns > 0);
const sameClb = nets.filter(n => n.d && !n.d[0] && !n.d[1]).length;
const dist = nets.filter(n => n.d).map(n => Math.abs(n.d[0]) + Math.abs(n.d[1]));
console.log('SUMMARY', JSON.stringify({ total: p.total, logic: p.logic, route: p.route, nets: nets.length, routedNets: routed.length, perNet: +(p.route / Math.max(1, routed.length)).toFixed(3), sameClb, meanDist: +(dist.reduce((a, b) => a + b, 0) / Math.max(1, dist.length)).toFixed(2), fanouts: nets.map(n => n.fanout).join(',') }));
