// Asks xdl -xdl2ncd which candidate PIPs / sites exist, in rounds of probe designs (probe.mjs) run by
// ise-remote.sh (SILINX_ISE_HOST=user@host in the environment).
//   node research/s3e-device/probe-run.mjs candidates.json result.json [work-dir]
// candidates.json: { part, pips: [{ tile, from, to }], sites: [{ site, type }] }
// result.json: { part, pips: { yes, no }, sites: { yes, no }, rounds, runs, crashed (designs xdl stopped
// on with a fatal error before it had checked them all: asked again in smaller designs) }
// Every design ends with a PIP that does not exist (probeXdl sentinel): its error shows that xdl
// checked all the candidates before it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeXdl, probeFirstLine, parseProbeLog, sortPips, sortSites } from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [inFile, outFile, work = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'probe-'))] = process.argv.slice(2);
const cand = JSON.parse(fs.readFileSync(inFile, 'utf8'));
let PER = +(process.env.PROBE_PER || 400);        // candidates per design
const DESIGNS = +(process.env.PROBE_DESIGNS || 8);  // designs per round
let pips = cand.pips || [], sites = cand.sites || [];
const res = { part: cand.part, pips: { yes: [], no: [] }, sites: { yes: [], no: [] }, rounds: 0, runs: 0 };
while (pips.length || sites.length) {
  const dir = path.join(work, `r${res.rounds}`);
  fs.mkdirSync(dir, { recursive: true });
  const jobs = [];
  // spread what is left over all the designs of the round (each stops at its 20th error)
  const per = Math.max(1, Math.min(PER, Math.ceil((pips.length + sites.length) / DESIGNS)));
  for (let d = 0; d < DESIGNS && (pips.length || sites.length); d++) {
    const s = sites.splice(0, Math.min(sites.length, per));
    const p = pips.splice(0, per - s.length);
    const name = `p${d}`;
    fs.writeFileSync(path.join(dir, `${name}.xdl`), probeXdl(cand.part, { pips: p, sites: s, sentinel: true }));
    jobs.push({ name, p, s });
  }
  execFileSync(path.join(HERE, 'ise-remote.sh'), ['-P', '2', dir], { stdio: 'inherit' });
  res.rounds++; res.runs += jobs.length;
  for (const j of jobs) {
    const log = ['x.log', 'xf.log'].map(e => path.join(dir, `${j.name}.${e}`)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8'))[0] || '';
    if (!log) throw new Error(`no log for ${dir}/${j.name}`);
    const first = probeFirstLine({ sites: j.s });
    // (a fatal error of xdl before the sentinel: the candidates after its last error are asked again,
    // in smaller designs)
    const parsed = parseProbeLog(log, { sentinelLine: j.p.length ? first + j.p.length : null });
    if (parsed.fatal && parsed.stoppedAtLine !== null) { PER = Math.max(1, Math.floor(per / 2)); res.crashed = (res.crashed || 0) + 1; }
    const sp = sortPips(j.p, first, parsed), ss = sortSites(j.s, parsed);
    res.pips.yes.push(...sp.yes); res.pips.no.push(...sp.no); pips.push(...sp.again);
    res.sites.yes.push(...ss.yes); res.sites.no.push(...ss.no); sites.push(...ss.again);
  }
  console.log(`round ${res.rounds}: ${res.pips.yes.length} / ${res.pips.no.length} PIPs, ${res.sites.yes.length} / ${res.sites.no.length} sites (exist / not), ${pips.length + sites.length} left`);
}
fs.writeFileSync(outFile, JSON.stringify(res));
