// Silinx toolchain - io.nextpnr of the flow's nextpnr engine (#2136) from the WebAssembly package of nextpnr-himbaechel with
// the spartan3e micro-architecture (@silinx/nextpnr-himbaechel-spartan3e): in Node (nextpnr-node.js) and in the browser's
// flow worker (web/js/open-flow-worker.js), each loading the package its own way.

/** io.nextpnr: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array }; load() resolves the package's module. */
export function nextpnrIo(load) {
  let pkg = null;
  const mod = async () => (pkg ||= await load());
  return {
    async run(args, files, onLine = () => {}) {
      const { runNextpnrHimbaechelSpartan3e, Exit } = await mod();
      let rest = '';
      const out = bytes => {
        if (bytes === null) { if (rest) onLine(rest); rest = ''; return; }
        const lines = (rest + new TextDecoder().decode(bytes)).split('\n');
        rest = lines.pop();
        for (const l of lines) onLine(l);
      };
      try {
        return await runNextpnrHimbaechelSpartan3e(args, files, { stdout: out, stderr: out, decodeASCII: false, fetchProgress: () => {} });
      } catch (e) {
        throw e instanceof Exit ? new Error(`nextpnr exited with code ${e.code}`) : e;
      } finally {
        if (rest) onLine(rest);   // (the last line, without its newline)
      }
    },
    chipdb: async part => (await mod()).chipdb(part),
  };
}
