// Silinx toolchain - the Spartan-6's bit databases (#732), from their files' contents: the object fpga/s6/bitgen.js
// predictDesign reads, made the same way in Node (bitdb-node.js reads bitdb/s6/*.json from the disk) and in the browser
// (fetchBitDbS6: fetched from the site's assets, #2103). The files are listed in bitdb-node.js.
//
// Isomorphic ES module (browser + Node), no DOM.

/** The device of a part ('xc6slx16csg324-3' -> 'xc6slx16'). */
const deviceOf = part => part.match(/^xc6slx\d+/)[0];

/** The names (without .json) of the files a part's databases read, the shared ones and its device's. */
export function s6DbNames(part) {
  const device = deviceOf(part);
  return [
    ...['lut', 'pips-cmt', 'iob', 'hard', 'cmt-settings', 'cmt-input'].map(n => `${device}-${n}`),
    ...['slice-full', 'slice-nets', 'slice', 'slice-full-clexl13', 'slice-full-clexm', 'int', 'int-cover', 'int-own'].map(n => `xc6slx16-${n}`),
    ...['pips-other', 'pips-io', 'pips-clock', 'pips-probe', 'pips-flow', 'clocks', 'hard-base', 'ologic'].map(n => `s6-${n}`),
  ].filter((n, i, all) => all.indexOf(n) === i);
}

/**
 * A part's databases ('xc6slx16csg324-3') from read(name): a file's object, or null for a file the part has not;
 * cmtInput: false leaves the CMTs' input bits out. { part, slices: { lut, rounds, sliceX }, int, other: { pips }, iob,
 * clocks, hard, hardBase, cmtSettings, cmtInput, ologic }.
 */
export function bitDbS6(read, part, { cmtInput = true } = {}) {
  const dev = n => read(`${deviceOf(part)}-${n}`);
  const pips = n => read(n)?.pips ?? {};
  return {
    part,
    slices: {
      lut: dev('lut'), rounds: { full: read('xc6slx16-slice-full'), nets: read('xc6slx16-slice-nets'), slice: read('xc6slx16-slice') },
      // a SLICEX's settings in the frames before its tile's (minor 20 of the column) by its tile's type
      sliceX: { CLEXL: read('xc6slx16-slice-full-clexl13'), CLEXM: read('xc6slx16-slice-full-clexm') },
    },
    int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips },
    // the other tiles' PIPs (the PIP drop), the I/O path's, the clocks', the probed ones, the CMT paths' and the open
    // flow's (#732) one at a time
    other: { pips: { ...pips('s6-pips-other'), ...pips('s6-pips-io'), ...pips('s6-pips-clock'), ...pips('s6-pips-probe'), ...(dev('pips-cmt')?.pips ?? {}), ...pips('s6-pips-flow') } },
    iob: dev('iob'), clocks: read('s6-clocks'), hard: dev('hard'), hardBase: read('s6-hard-base'),
    cmtSettings: dev('cmt-settings'), cmtInput: cmtInput ? dev('cmt-input') : null, ologic: read('s6-ologic'),
  };
}

/**
 * The browser's loadBitDbS6 (#2103): a part's databases fetched, file by file, as fetchJson(name + '.json') gives them
 * (an object, or null for a file the site has not); the same object as bitdb-node.js loadBitDbS6.
 */
export async function fetchBitDbS6(part, fetchJson, opts = {}) {
  const names = s6DbNames(part).filter(n => opts.cmtInput !== false || !n.endsWith('-cmt-input'));
  const json = Object.fromEntries(await Promise.all(names.map(async n => [n, (await fetchJson(`${n}.json`)) ?? null])));
  return bitDbS6(n => json[n] ?? null, part, opts);
}
