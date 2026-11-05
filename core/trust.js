// Trust for outside projects (#2830), the third layer of SECURITY.md's "Files and projects from outside": a project that
// came from outside (a zip, an ISE project, a design link, the MCP's import_project) is marked `trusted: false` in its
// silinx.json by the import. It opens, is edited, checked, simulated and implemented with the Silinx toolchain, in the
// browser's sandbox; what runs outside it (Xilinx ISE over Docker or ssh, programming a board or a PROM) waits until the
// user trusts it: the console's line with its Trust Project button, said when the project opens. A project the user
// made is trusted from the start (no `trusted` field). Only the user trusts a project, in the interface: the MCP server
// has no tool for it, so that an assistant led astray by what it read cannot. Isomorphic (browser and server).

/** Whether a project's description lets it run what is outside the browser's sandbox. */
export const isTrusted = pj => pj?.trusted !== false;

/** The refusal of `what` (Xilinx ISE, programming the board…) for an untrusted project. */
export const untrustedMessage = (name, what) => `project '${name}' came from outside (imported): ${what} runs only once you trust it (Trust Project, in the console when the project opens)`;

/** The console's line of an untrusted project opened. */
export const untrustedNotice = name => `Project "${name}" came from outside (imported): it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.`;

/** A project description marked as from outside (the import's last step). */
export const markUntrusted = pj => ({ ...pj, trusted: false });
