// Silinx toolchain - nextpnr in Node (#2136): io.nextpnr for the flow's nextpnr engine (open-flow-nextpnr.js), from the
// WebAssembly package of nextpnr-himbaechel with the spartan3e micro-architecture (the fork pmnmalo/nextpnr-spartan's
// release, @silinx/nextpnr-himbaechel-spartan3e), loaded on its first use.

/** io.nextpnr in this process: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array }. */
export function nextpnrNode() {
  let pkg = null;
  const load = async () => (pkg ||= await import('@silinx/nextpnr-himbaechel-spartan3e'));
  return {
    async run(args, files, onLine = () => {}) {
      const { runNextpnrHimbaechelSpartan3e, Exit } = await load();
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
    chipdb: async part => (await load()).chipdb(part),
  };
}
