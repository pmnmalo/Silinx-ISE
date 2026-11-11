// Silinx toolchain - io.nextpnr.gowin of the Gowin's back end (#2303, open-flow-gowin.js) from YoWASP's WebAssembly package of
// nextpnr-himbaechel with Apicula's chip databases (@yowasp/nextpnr-himbaechel-gowin): nextpnr's run as the other
// micro-architectures' (nextpnr-io.js), and gowin_pack's, Silinx's JavaScript port (fpga/gowin/pack.js; the package's own runs
// in Python), on the device's database read from the package's resources. In Node (nextpnr-gowin-node.js) and in the browser's
// flow worker, each loading the package and reading its files its own way.
import { nextpnrIo } from './nextpnr-io.js';
import { apyculaDatabase } from './fpga/gowin/gowin-files.js';
import { loadChipdb } from './fpga/gowin/chipdb.js';
import { gowinPack } from './fpga/gowin/pack.js';

/** The package's resource parts' names: gen/<name>-resources.<n>.tar. */
export const gowinResourcePart = i => `gen/nextpnr-himbaechel-gowin-resources.${i}.tar`;

/** io.nextpnr.gowin: { run(args, files, onLine) -> files, pack(routedJson, family) -> the .fs text }; load() resolves the package's
 *  module, readFile(path) the bytes of one of its files (a resource part), or null. */
export function gowinIo(load, readFile) {
  let pkg = null;
  const mod = async () => (pkg ||= await load());
  const { run } = nextpnrIo(mod, 'runNextpnrHimbaechelGowin');
  const databases = new Map();   // (each family's .msgpack.xz, read once; its Device decoded for each run: gowin_pack changes it)
  return {
    run,
    async pack(routed, family) {
      await mod();   // (the package there first: downloaded on its first use)
      if (!databases.has(family)) databases.set(family, apyculaDatabase(i => readFile(gowinResourcePart(i)), family).catch(e => { databases.delete(family); throw e; }));
      const xz = await databases.get(family);
      return gowinPack(typeof routed === 'string' ? JSON.parse(routed) : routed, loadChipdb(xz));
    },
  };
}
