// Silinx toolchain - nextpnr-himbaechel-gowin and gowin_pack (Silinx's port) in Node (#2303): io.nextpnr.gowin for the Gowin's back
// end, from YoWASP's package (@yowasp/nextpnr-himbaechel-gowin, an optional dependency: about 160 MB, every Gowin's chip database),
// loaded on its first use; its files read from where it is installed.
import fs from 'node:fs/promises';
import { gowinIo } from './nextpnr-gowin-io.js';

const NAME = '@yowasp/nextpnr-himbaechel-gowin';

/** A file of a package installed in this process's node_modules (its path from the package's folder), or null. */
export async function installedPackageFile(name, file) {
  let main;
  try { main = import.meta.resolve(name); } catch { return null; }
  try { return new Uint8Array(await fs.readFile(new URL(`../${file}`, main))); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

/** io.nextpnr.gowin in this process: { run(args, files, onLine) -> files, pack(routedJson, family) -> the .fs text }. */
export const nextpnrGowinNode = () => gowinIo(async () => {
  try {
    return await import('@yowasp/nextpnr-himbaechel-gowin');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    throw new Error('nextpnr-himbaechel-gowin is not installed: npm install @yowasp/nextpnr-himbaechel-gowin');
  }
}, file => installedPackageFile(NAME, file));
