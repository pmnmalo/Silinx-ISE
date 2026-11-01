// Silinx toolchain - io.nextpnr.ice40 of the iCE40's back end (#2295, open-flow-ice40.js) from YoWASP's WebAssembly package of
// nextpnr-ice40 and the IceStorm tools (@yowasp/nextpnr-ice40): nextpnr's run as the other micro-architectures' (nextpnr-io.js),
// and icepack's. In Node (nextpnr-ice40-node.js) and in the browser's flow worker, each loading the package its own way.
import { nextpnrIo } from './nextpnr-io.js';

/** io.nextpnr.ice40: { run(args, files, onLine) -> files, pack(asc) -> Uint8Array }; load() resolves the package's module. */
export function ice40Io(load) {
  let pkg = null;
  const mod = async () => (pkg ||= await load());
  const { run } = nextpnrIo(mod, 'runNextpnrIce40');
  return {
    run,
    async pack(asc) {
      const { runIcepack, Exit } = await mod();
      const lines = [];
      const out = bytes => { if (bytes) lines.push(new TextDecoder().decode(bytes)); };
      try {
        const files = await runIcepack(['routed.asc', 'design.bin'], { 'routed.asc': asc }, { stdout: out, stderr: out, decodeASCII: false, fetchProgress: () => {} });
        return files['design.bin'];
      } catch (e) {
        throw e instanceof Exit ? new Error(`icepack exited with code ${e.code}: ${lines.join('').trim()}`) : e;
      }
    },
  };
}
