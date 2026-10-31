// Silinx toolchain - nextpnr for the Spartan-6 in Node (#2138): io.nextpnrS6 of the flow's nextpnr engine
// (open-flow-nextpnr-s6.js), from the WebAssembly package of nextpnr-himbaechel with the spartan6 micro-architecture (the
// fork pmnmalo/nextpnr-spartan's release, @silinx/nextpnr-himbaechel-spartan6), loaded on its first use.

/** io.nextpnrS6 in this process: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array }. */
export function nextpnrS6Node() {
  let pkg = null;
  const load = async () => (pkg ||= await import('@silinx/nextpnr-himbaechel-spartan6'));
  return {
    async run(args, files, onLine = () => {}) {
      const { runNextpnrHimbaechelSpartan6, Exit } = await load();
      let rest = '';
      const out = bytes => {
        if (bytes === null) { if (rest) onLine(rest); rest = ''; return; }
        const lines = (rest + new TextDecoder().decode(bytes)).split('\n');
        rest = lines.pop();
        for (const l of lines) onLine(l);
      };
      try {
        return await runNextpnrHimbaechelSpartan6(args, files, { stdout: out, stderr: out, decodeASCII: false, fetchProgress: () => {} });
      } catch (e) {
        throw e instanceof Exit ? new Error(`nextpnr exited with code ${e.code}`) : e;
      } finally {
        if (rest) onLine(rest);   // (the last line, without its newline)
      }
    },
    chipdb: async part => (await load()).chipdb(part),
  };
}
