// Silinx toolchain - nextpnr-ice40 and icepack in Node (#2295): io.nextpnr.ice40 for the iCE40's back end, from YoWASP's package
// (@yowasp/nextpnr-ice40, an optional dependency: about 80 MB, every iCE40's chip database), loaded on its first use.
import { ice40Io } from './nextpnr-ice40-io.js';

/** io.nextpnr.ice40 in this process: { run(args, files, onLine) -> files, pack(asc) -> Uint8Array }. */
export const nextpnrIce40Node = () => ice40Io(async () => {
  try {
    return await import('@yowasp/nextpnr-ice40');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    throw new Error('nextpnr-ice40 is not installed: npm install @yowasp/nextpnr-ice40');
  }
});
