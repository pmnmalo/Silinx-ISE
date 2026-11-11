// Silinx toolchain - io.nextpnr.gowin of the Gowin's back end (#2303, open-flow-gowin.js) from YoWASP's WebAssembly package of
// nextpnr-himbaechel with Apicula's chip databases (@yowasp/nextpnr-himbaechel-gowin): nextpnr's run as the other
// micro-architectures' (nextpnr-io.js). Its gowin_pack (Python, through Pyodide) is not used (#2303). In Node
// (nextpnr-gowin-node.js) and in the browser's flow worker, each loading the package its own way.
import { nextpnrIo } from './nextpnr-io.js';

/** io.nextpnr.gowin: { run(args, files, onLine) -> files }; load() resolves the package's module. */
export function gowinIo(load) {
  let pkg = null;
  const { run } = nextpnrIo(async () => (pkg ||= await load()), 'runNextpnrHimbaechelGowin');
  return { run };
}
