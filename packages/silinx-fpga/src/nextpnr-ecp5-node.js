// Silinx toolchain - nextpnr-ecp5 and ecppack in Node (#2302): io.nextpnr.ecp5 for the ECP5's back end, from YoWASP's package
// (@yowasp/nextpnr-ecp5, an optional dependency: about 175 MB, every ECP5's chip database), loaded on its first use.
import { ecp5Io } from './nextpnr-ecp5-io.js';

/** io.nextpnr.ecp5 in this process: { run(args, files, onLine) -> files, pack(config) -> Uint8Array }. */
export const nextpnrEcp5Node = () => ecp5Io(async () => {
  try {
    return await import('@yowasp/nextpnr-ecp5');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    throw new Error('nextpnr-ecp5 is not installed: npm install @yowasp/nextpnr-ecp5');
  }
});
