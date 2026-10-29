// Xilinx device families known to ISE 14.7 (isomorphic: used by the server and the browser).
// Detection works from the part name alone, so it also covers parts missing from the device DB.

export const FAMILY_INFO = {
  spartan3:     { name: 'Spartan-3',          xise: 'Spartan3',                 pm: 'spartan3' },
  spartan3e:    { name: 'Spartan-3E',         xise: 'Spartan3E',                pm: 'spartan3e' },
  spartan3a:    { name: 'Spartan-3A / 3AN',   xise: 'Spartan3A and Spartan3AN', pm: 'spartan3a' },
  spartan3adsp: { name: 'Spartan-3A DSP',     xise: 'Spartan3A DSP',            pm: 'spartan3adsp' },
  spartan6:     { name: 'Spartan-6',          xise: 'Spartan6',                 pm: 'spartan6' },
  virtex4:      { name: 'Virtex-4',           xise: 'Virtex4',                  pm: 'virtex4' },
  virtex5:      { name: 'Virtex-5',           xise: 'Virtex5',                  pm: 'virtex5' },
  virtex6:      { name: 'Virtex-6',           xise: 'Virtex6',                  pm: 'virtex6' },
  artix7:       { name: 'Artix-7',            xise: 'Artix7',                   pm: 'artix7' },
  kintex7:      { name: 'Kintex-7',           xise: 'Kintex7',                  pm: 'kintex7' },
  virtex7:      { name: 'Virtex-7',           xise: 'Virtex7',                  pm: 'virtex7' },
  zynq:         { name: 'Zynq-7000',          xise: 'Zynq',                     pm: 'zynq' },
};

/** Family id of a part name such as xc3s250e, xc6slx9, xc3s700an, xc7a100t. */
export function familyOfPart(part) {
  const p = String(part || '').toLowerCase().replace(/^x[aq](?=\d)/, 'xc'); // XA (automotive) / XQ (defense) parts
  if (/^xc3sd\d+a/.test(p)) return 'spartan3adsp';
  if (/^xc3s\d+e$/.test(p)) return 'spartan3e';
  if (/^xc3s\d+an?$/.test(p)) return 'spartan3a';
  if (/^xc3s\d+l?$/.test(p)) return 'spartan3';
  if (/^xc6s/.test(p)) return 'spartan6';
  if (/^xc4v/.test(p)) return 'virtex4';
  if (/^xc5v/.test(p)) return 'virtex5';
  if (/^xc6v/.test(p)) return 'virtex6';
  if (/^xc7a/.test(p)) return 'artix7';
  if (/^xc7k/.test(p)) return 'kintex7';
  if (/^xc7v/.test(p)) return 'virtex7';
  if (/^xc7z/.test(p)) return 'zynq';
  return null;
}

/** Family of a project device ({ family?, part }), trusting the part name over a stale family field. */
export function deviceFamily(device) {
  return familyOfPart(device?.part) || String(device?.family || '').toLowerCase() || null;
}

export const familyName = f => FAMILY_INFO[f]?.name || f || 'unknown family';
export const isSpartan3Like = f => /^spartan3/.test(f || '');
export const familyFromXise = text => {
  const t = String(text || '').toLowerCase().replace(/[\s-]/g, '');
  for (const [id, fi] of Object.entries(FAMILY_INFO)) if (fi.xise.toLowerCase().replace(/[\s-]/g, '') === t || fi.pm === t) return id;
  if (/spartan3a/.test(t)) return 'spartan3a';
  return null;
};

/** Split a bitstream header part such as "3s250ecp132" or "6slx9csg324" into { part, package }. */
export function splitBitPart(p) {
  const m = /^(?:xc)?(\d[a-z]+\d+[a-z]*?)((?:cpg|cp|csg|cs|tqg|tq|vqg|vq|pqg|pq|ftg|ft|fgg|fg|ffg|ff|fbg|fb|sbg|sb|rfg|rf|rbg|rb|clg|cl|cg|sf)\d+)$/i.exec(String(p || ''));
  return m ? { part: `xc${m[1].toLowerCase()}`, package: m[2].toLowerCase() } : null;
}
