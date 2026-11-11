// Silinx toolchain - the 7-series' bit database for Node (#3144): bitdb/xc7/<part>.json.gz (research/xc7/build-db.mjs,
// from Project X-Ray's database) into the object bitdb.js bitDbXc7 makes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { bitDbXc7 } from './bitdb.js';

/** The folder of the 7-series' bit databases: packages/silinx-fpga/bitdb/xc7. */
export const XC7_DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bitdb', 'xc7');

/** The parts with a bit database ('xc7a35tcpg236-1'). */
export function xc7Parts(dir = XC7_DB_DIR) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).map(f => f.slice(0, -8)).sort() : [];
}

/** A part's database ('xc7a35tcpg236-1'); an error naming the parts there are for another. */
export function loadBitDbXc7(part, { dir = XC7_DB_DIR } = {}) {
  const f = path.join(dir, `${part}.json.gz`);
  if (!fs.existsSync(f)) throw new Error(`no 7-series bit database for ${part} (there is one for ${xc7Parts(dir).join(', ') || 'none'})`);
  return bitDbXc7(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')));
}
