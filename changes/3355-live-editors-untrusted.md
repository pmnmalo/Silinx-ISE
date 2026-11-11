In short:

- A shared project that an editor of its link changes is untrusted from that change on: Xilinx ISE and programming a
  board or a PROM wait until you trust it again (Trust Project, in the console).

In detail:

- **An editor's change of a shared project passes the import gate and untrusts the project (#3355):** what an editor
  of a shared project's link changes in a text file is checked by the import gate (`core/collab-doc.js` `gateEdit`,
  `core/import-gate.js` `gateFile`) before the owner writes it, by the interface's Share Project… (`web/js/collab-share.js`)
  as by the MCP's `share_project` (`server/mcp-collab.js`); what the gate refuses is not written but undone, its reason a
  warning (the console's, the share's status). Before the first change is written the project is marked untrusted,
  changed by an editor (`core/trust.js` `markEditedByEditor`, `madeBy: "editor"`), so Xilinx ISE and programming are
  refused for it, said with the Trust Project button, until the user trusts it again; a change after that untrusts it
  again. The browser edition keeps who made an untrusted project when its description is saved, and Trust Project
  clears it. SECURITY.md describes live sharing. Tests: collab-edit (the gate's reasons, the marks and messages),
  mcp-collab (a trusted project untrusted by an editor's change, ISE refused, a refused change not written; fails on
  the old code), UI collab-edit (the owner's console, in both interfaces).
