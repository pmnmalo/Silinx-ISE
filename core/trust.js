// Trust for outside projects (#2830), the third layer of SECURITY.md's "Files and projects from outside": a project that
// came from outside (a zip, an ISE project, a design link, the MCP's import_project) is marked `trusted: false` in its
// silinx.json by the import. It opens, is edited, checked, simulated and implemented with the Silinx toolchain, in the
// browser's sandbox; what runs outside it (Xilinx ISE over Docker or ssh, programming a board or a PROM) waits until the
// user trusts it: the console's line with its Trust Project button, said when the project opens. A project the user
// made is trusted from the start (no `trusted` field). Only the user trusts a project, in the interface: the MCP server
// has no tool for it, so that an assistant led astray by what it read cannot. A project the MCP server makes holds what an
// assistant wrote: untrusted from the start too, `madeBy: "mcp"` saying so (#2981). A shared project an editor of its
// link changed (#3355): untrusted from that editor's first change written, `madeBy: "editor"` saying so. Isomorphic
// (browser and server).

/** Whether a project's description lets it run what is outside the browser's sandbox. */
export const isTrusted = pj => pj?.trusted !== false;

// where an untrusted project came from, as its messages say it (pj: its description, #2981)
const ORIGINS = { mcp: 'was made through the MCP server (by an assistant)', editor: 'was changed by an editor of its shared link' };
const origin = pj => ORIGINS[pj?.madeBy] || 'came from outside (imported)';

/** The refusal of `what` (Xilinx ISE, programming the board…) for an untrusted project. */
export const untrustedMessage = (name, what, pj = null) => `project '${name}' ${origin(pj)}: ${what} runs only once you trust it (Trust Project, in the console when the project opens)`;

/** The console's line of an untrusted project opened. */
export const untrustedNotice = (name, pj = null) => `Project "${name}" ${origin(pj)}: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.`;

/** A project description marked as from outside (the import's last step): an imported one, whoever made it before. */
export const markUntrusted = pj => { const { madeBy, ...rest } = pj; return { ...rest, trusted: false }; };   // eslint-disable-line no-unused-vars

/** A project description the MCP server makes (#2981): untrusted, made by an assistant. */
export const markMadeByMcp = pj => ({ ...pj, trusted: false, madeBy: 'mcp' });

/** A shared project's description once an editor of its link changes a file of it (#3355): untrusted, changed by an
 *  editor; one untrusted already kept as it is (who made it said as before). */
export const markEditedByEditor = pj => (isTrusted(pj) ? { ...pj, trusted: false, madeBy: 'editor' } : pj);
