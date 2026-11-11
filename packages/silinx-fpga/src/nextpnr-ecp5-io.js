// Silinx toolchain - io.nextpnr.ecp5 of the ECP5's back end (#2302, open-flow-ecp5.js) from YoWASP's WebAssembly package of
// nextpnr-ecp5 and Project Trellis's tools (@yowasp/nextpnr-ecp5): nextpnr's run as the other micro-architectures'
// (nextpnr-io.js), and ecppack's. In Node (nextpnr-ecp5-node.js) and in the browser's flow worker, each loading the package
// its own way.
import { nextpnrIo } from './nextpnr-io.js';

/** io.nextpnr.ecp5: { run(args, files, onLine) -> files, pack(config) -> Uint8Array }; load() resolves the package's module. */
export function ecp5Io(load) {
  let pkg = null;
  const mod = async () => (pkg ||= await load());
  const { run } = nextpnrIo(mod, 'runNextpnrEcp5');
  return {
    run,
    async pack(config) {
      const { runEcppack, Exit } = await mod();
      const lines = [];
      const out = bytes => { if (bytes) lines.push(new TextDecoder().decode(bytes)); };
      try {
        const files = await runEcppack(['routed.config', 'design.bit'], { 'routed.config': config }, { stdout: out, stderr: out, decodeASCII: false, fetchProgress: () => {} });
        return files['design.bit'];
      } catch (e) {
        throw e instanceof Exit ? new Error(`ecppack exited with code ${e.code}: ${lines.join('').trim()}`) : e;
      }
    },
  };
}
