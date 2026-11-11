// Silinx toolchain - the 7-series' bit database (#3144): Project X-Ray's database (prjxray-db, CC0 1.0) for one part,
// as research/xc7/build-db.mjs keeps it (bitdb/xc7/<part>.json.gz), and the bits of a tile's feature looked up in it as
// Project X-Ray's fasm2frames looks them up (prjxray/tile_segbits.py, tile_segbits_alias.py).
//
// A tile's bits are in one or two blocks (CLB_IO_CLK: the logic and routing; BLOCK_RAM: a block RAM's contents): from
// its base frame address, `frames` frames, `words` words from word `offset` of each. A segment bit "!12_23" is the frame
// 12 from the base, the bit 23 from the tile's first (its offset's) word, cleared ("!") or set. A tile with an alias
// takes another type's bits (its sites renamed, its offset moved back by the alias's start). A pseudo-PIP (ppips_*.db)
// has no bits: setting it sets nothing. A feature the database does not have is an error.

export const BLOCK_TYPES = ['CLB_IO_CLK', 'BLOCK_RAM', 'CFG_CLB'];

/** A feature the database has no bits for (Project X-Ray's FasmLookupError). */
export class FeatureLookupError extends Error {
  constructor(message) { super(message); this.name = 'FeatureLookupError'; }
}

// a segment bit: [frame from the base, bit from the tile's first word, set]
function parseBit(s) {
  const set = s[0] !== '!', [c, b] = (set ? s : s.slice(1)).split('_');
  if (b === undefined) throw new Error(`not a segment bit: ${s}`);
  return [Number(c), Number(b), set];
}

// a type's segment bits of one block: { bits: Map(feature → bits), addresses: Map(base name → Map(address → feature)) }
function segbitsOf(text) {
  const bits = new Map(), addresses = new Map();
  for (const line of text ? text.split('\n') : []) {
    const [name, ...rest] = line.split(' ');
    if (name.endsWith('[]')) {   // a run of one bit per address, 0 … n - 1 (build-db.mjs packRuns)
      const base = name.slice(0, -2);
      rest.forEach((b, a) => bits.set(`${base}[${a}]`, [parseBit(b)]));
      continue;
    }
    bits.set(name, rest.map(parseBit));
  }
  for (const name of bits.keys()) {
    const s = name.lastIndexOf('[');
    if (s < 0) continue;
    const base = name.slice(0, s);
    if (!addresses.has(base)) addresses.set(base, new Map());
    addresses.get(base).set(Number(name.slice(s + 1, name.lastIndexOf(']'))), name);
  }
  return { bits, addresses };
}

/**
 * The database of a part from its file's object (bitdb-node.js loadBitDbXc7 reads it in Node): { part, device, fabric,
 * idcode, regions, banks, tileBank, pudcB, requiredFeatures, iobSites, tile(name), tiles(), featureBits(tile, feature,
 * address) }.
 */
export function bitDbXc7(raw) {
  if (raw?.format !== 1) throw new Error('not a 7-series bit database (format 1)');
  const types = new Map();
  // a type's segment bits per block and its pseudo-PIPs, read on its first use
  const typeOf = name => {
    if (types.has(name)) return types.get(name);
    const e = raw.types[name];
    if (!e) throw new FeatureLookupError(`the tile type ${name} has no bits in the database`);
    const text = k => (e[k]?.[0] === '=' ? raw.types[e[k].slice(1)][k] : e[k]);
    const t = { segbits: new Map(), ppips: new Set(e.ppips ? e.ppips.split('\n') : []) };
    if (e.segbits !== undefined) t.segbits.set(0, segbitsOf(text('segbits')));
    if (e.ramSegbits !== undefined) t.segbits.set(1, segbitsOf(text('ramSegbits')));
    types.set(name, t);
    return t;
  };
  const tileCache = new Map();
  const tile = name => {
    if (tileCache.has(name)) return tileCache.get(name);
    const x = Object.hasOwn(raw.tiles, name) ? raw.tiles[name] : null;
    if (!x) return null;
    const blocks = new Map(x[1].map(([bt, base, frames, offset, words, alias]) =>
      [bt, { base, frames, offset, words, alias: alias ? { type: alias[0], start: alias[1], sites: alias[2] } : null }]));
    const t = { name, type: x[0], blocks };
    tileCache.set(name, t);
    return t;
  };
  const tileBank = new Map();
  for (const [bank, tiles] of Object.entries(raw.banks)) for (const t of tiles) tileBank.set(t, bank);

  // the bits of a feature of a type (its name without the type) in the given blocks: [[frame, bit of the frame, set]]
  // (none for a pseudo-PIP); TileSegbits.feature_to_bits
  const typeBits = (typeName, blocks, feature, address, line) => {
    const t = typeOf(typeName);
    if (t.ppips.has(feature)) return [];
    const where = `Segment DB ${typeName}, key ${typeName}.${feature}${address ? `[${address}]` : ''}`;
    const at = (bt, list) => {
      const b = blocks.get(bt);
      if (!b) throw new FeatureLookupError(`${where}: the tile has no ${BLOCK_TYPES[bt]} bits`);
      return list.map(([c, w, set]) => [b.base + c, b.offset * 32 + w, set]);
    };
    if (address === 0) for (const [bt, s] of t.segbits) if (s.bits.has(feature)) return at(bt, s.bits.get(feature));
    let found = null;
    for (const [bt, s] of t.segbits) { const n = s.addresses.get(feature)?.get(address); if (n !== undefined) found = [bt, s.bits.get(n)]; }
    if (!found) throw new FeatureLookupError(`${where} not found${line ? ` from line '${line}'` : ''}`);
    return at(...found);
  };

  /**
   * The bits a feature of a tile sets or clears: [[frame address, bit of the frame, set]] ([] for a pseudo-PIP). The
   * feature without the tile's name ('SLICEL_X0.ALUT.INIT'), its address (0 without one). Throws FeatureLookupError
   * for a tile or a feature the database does not have (line: the FASM line, for the message).
   */
  const featureBits = (tileName, feature, address = 0, line = '') => {
    const t = tile(tileName);
    if (!t) throw new FeatureLookupError(`the tile ${tileName} is not in the ${raw.fabric}${line ? ` (line '${line}')` : ''}`);
    const aliases = [...t.blocks.values()].filter(b => b.alias);
    if (!aliases.length) return typeBits(t.type, t.blocks, feature, address, line);
    // an alias (TileSegbitsAlias): the tile's own pseudo-PIPs, then the other type's bits, its sites renamed
    if (typeOf(t.type).ppips.has(feature)) return [];
    if (aliases.length < t.blocks.size || new Set(aliases.map(b => b.alias.type)).size > 1) throw new Error(`${tileName}: an alias of some blocks or to several types`);
    const parts = feature.split('.');
    for (const b of aliases) if (Object.hasOwn(b.alias.sites, parts[0])) parts[0] = b.alias.sites[parts[0]];
    const blocks = new Map([...t.blocks].map(([bt, b]) => [bt, { ...b, offset: b.offset - b.alias.start }]));
    return typeBits(aliases[0].alias.type, blocks, parts.join('.'), address, line);
  };

  return { part: raw.part, device: raw.device, fabric: raw.fabric, idcode: raw.idcode, regions: raw.regions, banks: raw.banks,
    tileBank, pudcB: raw.pudcB, requiredFeatures: raw.requiredFeatures, iobSites: raw.iobSites, tile, tiles: () => Object.keys(raw.tiles),
    featureBits };
}
