// Silinx toolchain - nextpnr-himbaechel-gowin in Node (#2303): io.nextpnr.gowin for the Gowin's back end, from YoWASP's package
// (@yowasp/nextpnr-himbaechel-gowin, an optional dependency: about 160 MB, every Gowin's chip database), loaded on its first use.
import { gowinIo } from './nextpnr-gowin-io.js';

/** io.nextpnr.gowin in this process: { run(args, files, onLine) -> files }. */
export const nextpnrGowinNode = () => gowinIo(async () => {
  try {
    return await import('@yowasp/nextpnr-himbaechel-gowin');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    throw new Error('nextpnr-himbaechel-gowin is not installed: npm install @yowasp/nextpnr-himbaechel-gowin');
  }
});
