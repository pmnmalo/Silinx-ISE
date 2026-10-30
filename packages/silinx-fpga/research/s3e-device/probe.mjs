// Silinx - device measurements: xdl -xdl2ncd as an oracle of what exists (research/s3e-device/README.md).
//
// xdl -xdl2ncd checks every PIP and every placement of a design before it converts it, and says
// which ones the device does not have:
//   ERROR:XDL:198 - Could not find arc in tile CLB_X5Y5 with connecting wires F1_B0 and X0 around line 121 of file a.xdl.
//   ERROR:XDL:190 - Placement site SLICE_X99Y99 for instance s1 of type SLICEL around line 111 of file a.xdl is invalid for device.
// It stops after 20 such errors ("XDL file processing stopped after 20 errors were found"). So a
// design holding many candidates (PIPs, tiles, sites) answers for all of them up to the 20th
// error: the ones before it without an error exist, the ones with an error do not, the ones after
// it are asked again (probeRounds).
//
// The designs are written here from scratch (no ISE output): one slice, one net from its X output
// to its F1 input that holds the candidate PIPs, one instance per candidate site.

/** The XDL text of a probe design: PIPs [{ tile, from, to, dir? }] and sites [{ site, type }].
 *  sentinel: after the PIPs one that does not exist (`PROBE_END -> PROBE_END` in the first PIP's
 *  tile, at line probeFirstLine + pips.length): its error shows that xdl checked every PIP before. */
export function probeXdl(part, { pips = [], sites = [], sentinel = false }) {
  const lines = [`design "probe" ${part} v3.2 ;`];
  // a slice uses LUT F (so that the probe net has a sink); other sites are placed with no settings
  const slice = (name, type, site) => {
    lines.push(`inst "${name}" "${type}", placed TILE ${site} ,`, /^SLICE/.test(type) ? `  cfg " F:${name}_f:#LUT:D=A1 FXMUX::F XUSED::0 " ;` : '  cfg " " ;');
  };
  slice('host', 'SLICEL', 'SLICE_X1Y0');
  sites.forEach((s, i) => slice(`p${i}`, s.type, s.site));
  lines.push('net "probe" ,', '  outpin "host" X ,', '  inpin "host" F1 ,');
  for (const p of pips) lines.push(`  pip ${p.tile} ${p.from} ${p.dir || '->'} ${p.to} ,`);
  if (sentinel && pips.length) lines.push(`  pip ${pips[0].tile} PROBE_END -> PROBE_END ,`);
  lines.push('  ;');
  return lines.join('\n') + '\n';
}

/** The line of the first candidate in probeXdl's text (1-based): PIPs start after the sites. */
export function probeFirstLine({ sites = [] }) {
  return 1 + 2 * (1 + sites.length) + 3 + 1;
}

/**
 * What xdl -xdl2ncd said about a probe design: { badArcs: Set 'TILE FROM TO', badSites: Set site,
 * stoppedAtLine: the line of the last error when it stopped after 20 errors (null when it read the
 * whole file), lines: Set of the line numbers with an error, fatal }.
 * xdl may also stop on a fatal error of its own (a probe net of thousands of PIPs: "UNEXPECTED RUG
 * CREATION PROBLEM FOR NETWORK"): then only what comes before its last error is answered, or, with
 * the sentinel's line (probeXdl sentinel), everything when the sentinel's error is there.
 */
export function parseProbeLog(log, { sentinelLine = null } = {}) {
  const badArcs = new Set(), badSites = new Set(), lines = new Set();
  let last = 0;
  for (const m of log.matchAll(/Could not find arc in tile (\S+) with connecting wires (\S+) and (\S+) around line (\d+)/g)) {
    badArcs.add(`${m[1]} ${m[2]} ${m[3]}`); lines.add(+m[4]); last = Math.max(last, +m[4]);
  }
  for (const m of log.matchAll(/Placement site (\S+) for instance \S+ of type \S+ around line (\d+)[^\n]*is invalid for device/g)) {
    badSites.add(m[1]); lines.add(+m[2]); last = Math.max(last, +m[2]);
  }
  const stopped = /processing stopped after \d+ errors/.test(log);
  const fatal = /FATAL_ERROR/.test(log);
  const all = sentinelLine !== null && lines.has(sentinelLine);
  return { badArcs, badSites, lines, stoppedAtLine: stopped || (fatal && !all) ? last : null, fatal };
}

/**
 * Sorts the candidate PIPs of one probe design by the log: { yes: [...], no: [...], again: [...] }.
 * pips: the design's PIPs in order (first at line `first`).
 */
export function sortPips(pips, first, parsed) {
  const yes = [], no = [], again = [];
  pips.forEach((p, i) => {
    const line = first + i;
    if (parsed.lines.has(line)) no.push(p);
    else if (parsed.stoppedAtLine !== null && line > parsed.stoppedAtLine) again.push(p);
    else yes.push(p);
  });
  return { yes, no, again };
}

/** The same for the candidate sites (line of site i: 2 + 2 * (i + 1)). */
export function sortSites(sites, parsed) {
  const yes = [], no = [], again = [];
  sites.forEach((s, i) => {
    const line = 2 + 2 * (i + 1);
    if (parsed.lines.has(line)) no.push(s);
    else if (parsed.stoppedAtLine !== null && line > parsed.stoppedAtLine) again.push(s);
    else yes.push(s);
  });
  return { yes, no, again };
}
